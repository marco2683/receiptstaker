import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { extractReceiptData } from '../services/ocr';
import { appendReceiptRow, getTopCategory, CATEGORY_MAP, getAllSubCategories } from '../services/spreadsheet';
import { storeReceipt, getReceiptPath, deleteReceipt } from '../services/storage';
import { getDatabase, saveDatabase } from '../database/schema';
import { UPLOADS_DIR } from '../config/paths';
import fs from 'fs';

const router = Router();

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
          filePath, extracted.date, extracted.vendor, extracted.description || extracted.vendor
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
      });

      // Save to database
      const db = await getDatabase();
      db.run(
        `INSERT INTO receipts (id, date, description, vendor, category, sub_category,
         amount_inc_gst, gst, business_pct, confidence, needs_review,
         notes, receipt_filename, spreadsheet_row)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, extracted.date, extracted.description || '', extracted.vendor,
         topCategory, extracted.subCategory || '',
         extracted.amountIncGst, extracted.gst,
         extracted.businessPct || 1.0, extracted.confidence,
         extracted.confidence < 0.7 ? 1 : 0,
         extracted.confidence_notes || null,
         receiptFilename, rowNumber]
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
        if (fs.existsSync(filePath)) {
          receiptFilename = await storeReceipt(filePath, today, 'Unknown', 'OCR-failed');
        }
        const rowNumber = await appendReceiptRow({
          id, date: today, vendor: 'REVIEW NEEDED', description: 'OCR failed - check receipt image',
          category: 'OPERATING_EXPENSE', subCategory: '',
          amountIncGst: 0, gst: null, businessPct: 1.0, confidence: 0.0,
          receiptFilename, notes: `OCR Error: ${bgError.message}`,
        });
        const db = await getDatabase();
        db.run(
          `INSERT INTO receipts (id, date, description, vendor, category, sub_category,
           amount_inc_gst, gst, business_pct, confidence, needs_review,
           notes, receipt_filename, spreadsheet_row)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, today, 'OCR failed', 'REVIEW NEEDED', 'OPERATING_EXPENSE', '',
           0, null, 1.0, 0.0, 1, `OCR Error: ${bgError.message}`,
           receiptFilename, rowNumber]
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
    const { date, vendor, description, subCategory, category,
      amountIncGst, gst, businessPct, notes, tempFile } = req.body;

    const id = uuidv4().substring(0, 8);
    let receiptFilename: string | null = null;

    const tempPath = req.file?.path || (tempFile ? `${UPLOADS_DIR}/${tempFile}` : null);
    if (tempPath && fs.existsSync(tempPath)) {
      receiptFilename = await storeReceipt(tempPath, date, vendor, description || vendor);
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
    });

    const db = await getDatabase();
    db.run(
      `INSERT INTO receipts (id, date, description, vendor, category, sub_category,
       amount_inc_gst, gst, business_pct, confidence, needs_review,
       notes, receipt_filename, spreadsheet_row)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, date, description || '', vendor, topCategory,
       subCategory || '', parseFloat(amountIncGst),
       gst ? parseFloat(gst) : null,
       businessPct ? parseFloat(businessPct) : 1.0,
       1.0, 0, notes || null, receiptFilename, rowNumber]
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
    const { date, vendor, description, subCategory, category,
      amountIncGst, gst, businessPct, notes } = req.body;

    if (!date || !vendor || !amountIncGst) {
      res.status(400).json({ error: 'Date, vendor, and amount are required' });
      return;
    }

    const id = uuidv4().substring(0, 8);
    let receiptFilename: string | null = null;
    if (req.file) {
      receiptFilename = await storeReceipt(req.file.path, date, vendor, description || vendor);
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
    });

    const db = await getDatabase();
    db.run(
      `INSERT INTO receipts (id, date, description, vendor, category, sub_category,
       amount_inc_gst, gst, business_pct, confidence, needs_review,
       notes, receipt_filename, spreadsheet_row)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, date, description || '', vendor, topCategory,
       subCategory || '', parseFloat(amountIncGst),
       gst ? parseFloat(gst) : null,
       businessPct ? parseFloat(businessPct) : 1.0,
       1.0, 0, notes || null, receiptFilename, rowNumber]
    );
    saveDatabase();

    res.json({ success: true, id, rowNumber, receiptFilename });
  } catch (error: any) {
    console.error('Manual entry error:', error);
    res.status(500).json({ error: error.message || 'Failed to save receipt' });
  }
});

// GET /api/receipts - List all receipts
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDatabase();
    const results = db.exec(
      'SELECT * FROM receipts ORDER BY date DESC, created_at DESC'
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

// GET /api/receipts/:id/image - Serve receipt image
router.get('/:id/image', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDatabase();
    const results = db.exec(
      'SELECT date, receipt_filename FROM receipts WHERE id = ?', [req.params.id]
    );
    if (results.length === 0 || results[0].values.length === 0) {
      res.status(404).json({ error: 'Receipt not found' });
      return;
    }
    const [date, filename] = results[0].values[0] as [string, string];
    if (!filename) {
      res.status(404).json({ error: 'No image for this receipt' });
      return;
    }
    const filePath = getReceiptPath(date, filename);
    res.sendFile(filePath);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/receipts/:id
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDatabase();
    const results = db.exec(
      'SELECT date, receipt_filename FROM receipts WHERE id = ?', [req.params.id]
    );
    if (results.length > 0 && results[0].values.length > 0) {
      const [date, filename] = results[0].values[0] as [string, string];
      if (filename) deleteReceipt(date, filename);
    }
    db.run('DELETE FROM receipts WHERE id = ?', [req.params.id]);
    saveDatabase();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
