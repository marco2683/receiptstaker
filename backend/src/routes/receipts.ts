import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { extractReceiptData } from '../services/ocr';
import { appendReceiptRow, getTopCategory, CATEGORY_MAP, getAllSubCategories } from '../services/spreadsheet';
import { storeReceipt, getReceiptPath, deleteReceipt } from '../services/storage';
import { getDatabase, saveDatabase } from '../database/schema';
import { UPLOADS_DIR, getCompanyUploadsDir } from '../config/paths';
import { authMiddleware } from '../middleware/auth';
import fs from 'fs';

const router = Router();

// All receipt routes require authentication
router.use(authMiddleware);

// Helper: get company ID from request header
function getCompanyId(req: Request): string | null {
  return req.headers['x-company-id'] as string || null;
}

// Helper: verify user is member of company
async function verifyMembership(userId: string, companyId: string): Promise<boolean> {
  const db = await getDatabase();
  const result = await db.exec(
    'SELECT role FROM company_members WHERE user_id = ? AND company_id = ?',
    [userId, companyId]
  );
  return result.length > 0 && result[0].values.length > 0;
}

// Configure multer for file uploads
const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
  fileFilter: (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
    cb(null, allowed.includes(file.mimetype));
  },
});

// Ensure uploads dir exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// GET /api/receipts/categories - Return the full category structure
router.get('/categories', (_req: Request, res: Response): void => {
  res.json({
    categories: CATEGORY_MAP,
    allSubCategories: getAllSubCategories(),
  });
});

// POST /api/receipts/auto - Fire-and-forget: upload image, instant response, background OCR+save
router.post('/auto', upload.single('receipt'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const companyId = getCompanyId(req);
    if (!companyId) {
      res.status(400).json({ error: 'Company ID required (X-Company-Id header)' });
      return;
    }

    const userId = req.user!.userId;
    if (!(await verifyMembership(userId, companyId))) {
      res.status(403).json({ error: 'Not a member of this company' });
      return;
    }

    const filePath = req.file.path;
    console.log(`📸 Auto-scan received: ${req.file.originalname} (${(req.file.size / 1024).toFixed(0)}KB)`);

    // Respond immediately — processing happens in background
    res.json({ success: true, message: 'Receipt received — processing in background' });

    // === Background processing (after response sent) ===
    try {
      const extracted = await extractReceiptData(filePath);
      console.log(`🔍 OCR complete: ${extracted.vendor} $${extracted.amountIncGst} (confidence: ${extracted.confidence})`);

      const id = uuidv4().substring(0, 8);
      const topCategory = extracted.category || getTopCategory(extracted.subCategory || '');

      // Store the receipt image
      let receiptFilename: string | null = null;
      try {
        receiptFilename = await storeReceipt(
          filePath, extracted.date, extracted.vendor, extracted.description || extracted.vendor,
          companyId
        );
      } catch (e) {
        console.error('⚠️  Failed to store receipt image:', e);
      }

      // Write to spreadsheet
      const rowNumber = await appendReceiptRow({
        id,
        date: extracted.date,
        vendor: extracted.vendor,
        description: extracted.description || '',
        category: topCategory,
        subCategory: extracted.subCategory || '',
        amountIncGst: extracted.amountIncGst,
        gst: extracted.gst,
        businessPct: extracted.businessPct || 1.0,
        confidence: extracted.confidence || 0.5,
        receiptFilename,
        notes: extracted.confidence_notes || null,
      }, companyId);

      // Sav      // Save to database
      const db = await getDatabase();
      let imageBase64: string | null = null;
      try {
        if (fs.existsSync(filePath)) {
          imageBase64 = fs.readFileSync(filePath).toString('base64');
        }
      } catch {}

      await db.run(
        `INSERT INTO receipts (id, company_id, date, description, vendor, category, sub_category,
         amount_inc_gst, gst, business_pct, confidence, needs_review,
         notes, receipt_filename, receipt_image_base64, spreadsheet_row, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, companyId, extracted.date, extracted.description || '', extracted.vendor,
         topCategory, extracted.subCategory || '',
         extracted.amountIncGst, extracted.gst,
         extracted.businessPct || 1.0, extracted.confidence,
         extracted.confidence < 0.7 ? 1 : 0,
         extracted.confidence_notes || null,
         receiptFilename, imageBase64, rowNumber, userId]
      );
      saveDatabase();

      const status = extracted.confidence >= 0.7 ? '✅' : '⚠️';
      console.log(`${status} Auto-saved: ${id} → Row ${rowNumber} | ${extracted.vendor} $${extracted.amountIncGst}`);

    } catch (bgError: any) {
      console.error('❌ Background processing failed:', bgError.message);
      // Even if OCR fails, try to save a placeholder row
      try {
        const id = uuidv4().substring(0, 8);
        const today = new Date().toISOString().split('T')[0];
        let receiptFilename: string | null = null;
        let imageBase64: string | null = null;
        if (fs.existsSync(filePath)) {
          receiptFilename = await storeReceipt(filePath, today, 'Unknown', 'OCR-failed', companyId);
          try { imageBase64 = fs.readFileSync(filePath).toString('base64'); } catch {}
        }
        const rowNumber = await appendReceiptRow({
          id, date: today, vendor: 'REVIEW NEEDED', description: 'OCR failed - check receipt image',
          category: 'OPERATING_EXPENSE', subCategory: '',
          amountIncGst: 0, gst: null, businessPct: 1.0, confidence: 0.0,
          receiptFilename, notes: `OCR Error: ${bgError.message}`,
        }, companyId);
        const db = await getDatabase();
        await db.run(
          `INSERT INTO receipts (id, company_id, date, description, vendor, category, sub_category,
           amount_inc_gst, gst, business_pct, confidence, needs_review,
           notes, receipt_filename, receipt_image_base64, spreadsheet_row, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, companyId, today, 'OCR failed', 'REVIEW NEEDED', 'OPERATING_EXPENSE', '',
           0, null, 1.0, 0.0, 1, `OCR Error: ${bgError.message}`,
           receiptFilename, imageBase64, rowNumber, userId]
        );
        saveDatabase();
        console.log(`⚠️  Placeholder saved: ${id} → Row ${rowNumber}`);
      } catch (e) {
        console.error('❌ Failed to save even placeholder:', e);
      }
    }
  } catch (error: any) {
    console.error('Upload error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'Failed to upload receipt' });
    }
  }
});

// POST /api/receipts/scan - Upload and OCR a receipt (returns data for review)
router.post('/scan', upload.single('receipt'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }
    console.log(`📸 Processing receipt: ${req.file.originalname}`);
    const extracted = await extractReceiptData(req.file.path);
    res.json({
      success: true,
      data: extracted,
      tempFile: req.file.filename,
    });
  } catch (error: any) {
    console.error('OCR error:', error);
    res.status(500).json({ error: error.message || 'Failed to process receipt' });
  }
});

// POST /api/receipts/confirm - Confirm extracted data and save
router.post('/confirm', upload.single('receipt'), async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) {
      res.status(400).json({ error: 'Company ID required' });
      return;
    }

    const userId = req.user!.userId;
    if (!(await verifyMembership(userId, companyId))) {
      res.status(403).json({ error: 'Not a member of this company' });
      return;
    }

    const { date, vendor, description, subCategory, category,
      amountIncGst, gst, businessPct, notes, tempFile } = req.body;

    const id = uuidv4().substring(0, 8);
    let receiptFilename: string | null = null;
    let imageBase64: string | null = null;

    const tempPath = req.file?.path || (tempFile ? `${UPLOADS_DIR}/${tempFile}` : null);
    if (tempPath && fs.existsSync(tempPath)) {
      try { imageBase64 = fs.readFileSync(tempPath).toString('base64'); } catch {}
      receiptFilename = await storeReceipt(tempPath, date, vendor, description || vendor, companyId);
    }

    const topCategory = category || getTopCategory(subCategory || '');

    const rowNumber = await appendReceiptRow({
      id, date, vendor, description: description || '',
      category: topCategory, subCategory: subCategory || '',
      amountIncGst: parseFloat(amountIncGst),
      gst: gst ? parseFloat(gst) : null,
      businessPct: businessPct ? parseFloat(businessPct) : 1.0,
      confidence: 1.0, // Manual confirm = high confidence
      receiptFilename, notes: notes || null,
    }, companyId);

    const db = await getDatabase();
    await db.run(
      `INSERT INTO receipts (id, company_id, date, description, vendor, category, sub_category,
       amount_inc_gst, gst, business_pct, confidence, needs_review,
       notes, receipt_filename, receipt_image_base64, spreadsheet_row, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, companyId, date, description || '', vendor, topCategory,
       subCategory || '', parseFloat(amountIncGst),
       gst ? parseFloat(gst) : null,
       businessPct ? parseFloat(businessPct) : 1.0,
       1.0, 0, notes || null, receiptFilename, imageBase64, rowNumber, userId]
    );
    saveDatabase();

    console.log(`✅ Receipt saved: ${id} → Row ${rowNumber}`);
    res.json({ success: true, id, rowNumber, receiptFilename });
  } catch (error: any) {
    console.error('Save error:', error);
    res.status(500).json({ error: error.message || 'Failed to save receipt' });
  }
});

// POST /api/receipts/manual - Manual entry
router.post('/manual', upload.single('receipt'), async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) {
      res.status(400).json({ error: 'Company ID required' });
      return;
    }

    const userId = req.user!.userId;
    if (!(await verifyMembership(userId, companyId))) {
      res.status(403).json({ error: 'Not a member of this company' });
      return;
    }

    const { date, vendor, description, subCategory, category,
      amountIncGst, gst, businessPct, notes } = req.body;

    if (!date || !vendor || !amountIncGst) {
      res.status(400).json({ error: 'Date, vendor, and amount are required' });
      return;
    }

    const id = uuidv4().substring(0, 8);
    let receiptFilename: string | null = null;
    let imageBase64: string | null = null;
    if (req.file) {
      try { imageBase64 = fs.readFileSync(req.file.path).toString('base64'); } catch {}
      receiptFilename = await storeReceipt(req.file.path, date, vendor, description || vendor, companyId);
    }

    const topCategory = category || getTopCategory(subCategory || '');

    const rowNumber = await appendReceiptRow({
      id, date, vendor, description: description || '',
      category: topCategory, subCategory: subCategory || '',
      amountIncGst: parseFloat(amountIncGst),
      gst: gst ? parseFloat(gst) : null,
      businessPct: businessPct ? parseFloat(businessPct) : 1.0,
      confidence: 1.0, // Manual = high confidence
      receiptFilename, notes: notes || null,
    }, companyId);

    const db = await getDatabase();
    await db.run(
      `INSERT INTO receipts (id, company_id, date, description, vendor, category, sub_category,
       amount_inc_gst, gst, business_pct, confidence, needs_review,
       notes, receipt_filename, receipt_image_base64, spreadsheet_row, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, companyId, date, description || '', vendor, topCategory,
       subCategory || '', parseFloat(amountIncGst),
       gst ? parseFloat(gst) : null,
       businessPct ? parseFloat(businessPct) : 1.0,
       1.0, 0, notes || null, receiptFilename, imageBase64, rowNumber, userId]
    );
    saveDatabase();

    res.json({ success: true, id, rowNumber, receiptFilename });
  } catch (error: any) {
    console.error('Manual entry error:', error);
    res.status(500).json({ error: error.message || 'Failed to save receipt' });
  }
});

// GET /api/receipts - List all receipts (company-scoped)
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) {
      res.status(400).json({ error: 'Company ID required' });
      return;
    }

    const userId = req.user!.userId;
    if (!(await verifyMembership(userId, companyId))) {
      res.status(403).json({ error: 'Not a member of this company' });
      return;
    }

    const db = await getDatabase();
    const results = await db.exec(
      'SELECT id, company_id, date, description, vendor, category, sub_category, amount_inc_gst, gst, business_pct, confidence, needs_review, notes, receipt_filename, spreadsheet_row, created_by, created_at, updated_at FROM receipts WHERE company_id = ? ORDER BY date DESC, created_at DESC',
      [companyId]
    );
    if (results.length === 0) {
      res.json({ receipts: [] });
      return;
    }
    const columns = results[0].columns;
    const receipts = results[0].values.map((row: any[]) => {
      const obj: any = {};
      columns.forEach((col: string, i: number) => { obj[col] = row[i]; });
      return obj;
    });
    res.json({ receipts });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/receipts/:id - Get single receipt
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    // Skip non-receipt routes
    if (['categories', 'auto', 'scan', 'confirm', 'manual'].includes(String(req.params.id))) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const db = await getDatabase();
    const results = await db.exec('SELECT id, company_id, date, description, vendor, category, sub_category, amount_inc_gst, gst, business_pct, confidence, needs_review, notes, receipt_filename, spreadsheet_row, created_by, created_at, updated_at FROM receipts WHERE id = ?', [req.params.id]);
    if (results.length === 0 || results[0].values.length === 0) {
      res.status(404).json({ error: 'Receipt not found' });
      return;
    }
    const columns = results[0].columns;
    const receipt: any = {};
    columns.forEach((col: string, i: number) => { receipt[col] = results[0].values[0][i]; });
    res.json({ receipt });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/receipts/:id - Update a receipt
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = getCompanyId(req);
    const db = await getDatabase();

    // Verify receipt exists
    const existing = await db.exec('SELECT id, company_id FROM receipts WHERE id = ?', [req.params.id]);
    if (existing.length === 0 || existing[0].values.length === 0) {
      res.status(404).json({ error: 'Receipt not found' });
      return;
    }

    const { date, vendor, description, category, subCategory,
      amountIncGst, gst, businessPct, notes } = req.body;

    const topCategory = category || getTopCategory(subCategory || '');

    await db.run(
      `UPDATE receipts SET
        date = ?, vendor = ?, description = ?, category = ?, sub_category = ?,
        amount_inc_gst = ?, gst = ?, business_pct = ?, notes = ?,
        updated_at = datetime('now')
       WHERE id = ?`,
      [date, vendor, description || '', topCategory, subCategory || '',
       parseFloat(amountIncGst), gst ? parseFloat(gst) : null,
       businessPct ? parseFloat(businessPct) : 1.0, notes || null,
       req.params.id]
    );
    saveDatabase();

    console.log(`✏️ Receipt updated: ${req.params.id} | ${vendor} $${amountIncGst}`);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Update error:', error);
    res.status(500).json({ error: error.message || 'Failed to update receipt' });
  }
});

router.get('/:id/image', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = getCompanyId(req);
    const db = await getDatabase();
    const results = await db.exec(
      'SELECT date, receipt_filename, receipt_image_base64, company_id FROM receipts WHERE id = ?', [req.params.id]
    );
    if (results.length === 0 || results[0].values.length === 0) {
      res.status(404).json({ error: 'Receipt not found' });
      return;
    }
    const [date, filename, imageBase64, receiptCompanyId] = results[0].values[0] as [string, string, string, string];

    if (imageBase64) {
      const buffer = Buffer.from(imageBase64, 'base64');
      res.contentType('image/jpeg').send(buffer);
      return;
    }

    if (!filename) {
      res.status(404).json({ error: 'No image for this receipt' });
      return;
    }
    const filePath = getReceiptPath(date, filename, companyId || receiptCompanyId);
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).json({ error: 'Image file not found' });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/receipts/:id
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = getCompanyId(req);
    const db = await getDatabase();
    const results = await db.exec(
      'SELECT date, receipt_filename, company_id FROM receipts WHERE id = ?', [req.params.id]
    );
    if (results.length > 0 && results[0].values.length > 0) {
      const [date, filename, receiptCompanyId] = results[0].values[0] as [string, string, string];
      if (filename) deleteReceipt(date, filename, companyId || receiptCompanyId);
    }
    await db.run('DELETE FROM receipts WHERE id = ?', [req.params.id]);
    saveDatabase();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

