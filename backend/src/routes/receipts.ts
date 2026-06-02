import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { extractReceiptData } from '../services/ocr';
import { appendReceiptRow } from '../services/spreadsheet';
import { storeReceipt, getReceiptPath, deleteReceipt } from '../services/storage';
import { getDatabase, saveDatabase } from '../database/schema';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  dest: path.resolve(__dirname, '../../../data/uploads/'),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
    cb(null, allowed.includes(file.mimetype));
  },
});

// POST /api/receipts/scan - Upload and OCR a receipt
router.post('/scan', upload.single('receipt'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }
    console.log(`📸 Processing receipt: ${req.file.originalname}`);
    const extracted = await extractReceiptData(req.file.path);
    // Return extracted data for user confirmation (don't save yet)
    res.json({
      success: true,
      data: extracted,
      tempFile: req.file.filename, // Reference to uploaded file for confirm step
    });
  } catch (error: any) {
    console.error('OCR error:', error);
    res.status(500).json({ error: error.message || 'Failed to process receipt' });
  }
});

// POST /api/receipts/confirm - Confirm extracted data and save
router.post('/confirm', upload.single('receipt'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { date, vendor, description, amountExGst, gst, total, category,
      paymentMethod, notes, tempFile } = req.body;

    const id = uuidv4().substring(0, 8);
    let receiptFilename: string | null = null;

    // Store the receipt image
    const uploadDir = path.resolve(__dirname, '../../../data/uploads/');
    const tempPath = req.file?.path || (tempFile ? path.join(uploadDir, tempFile) : null);

    if (tempPath && require('fs').existsSync(tempPath)) {
      receiptFilename = await storeReceipt(tempPath, date, vendor, description || vendor);
    }

    // Write to spreadsheet
    const rowNumber = await appendReceiptRow({
      id, date, vendor, description: description || '',
      amountExGst: amountExGst ? parseFloat(amountExGst) : null,
      gst: gst ? parseFloat(gst) : null,
      total: parseFloat(total),
      category: category || 'Other',
      paymentMethod: paymentMethod || null,
      receiptFilename, notes: notes || null,
    });

    // Save to database index
    const db = await getDatabase();
    db.run(
      `INSERT INTO receipts (id, date, vendor, description, amount_ex_gst, gst, total, 
       category, payment_method, notes, receipt_filename, spreadsheet_row)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, date, vendor, description || '', amountExGst ? parseFloat(amountExGst) : null,
       gst ? parseFloat(gst) : null, parseFloat(total), category || 'Other',
       paymentMethod || null, notes || null, receiptFilename, rowNumber]
    );
    saveDatabase();

    console.log(`✅ Receipt saved: ${id} → Row ${rowNumber}`);
    res.json({ success: true, id, rowNumber, receiptFilename });
  } catch (error: any) {
    console.error('Save error:', error);
    res.status(500).json({ error: error.message || 'Failed to save receipt' });
  }
});

// POST /api/receipts/manual - Manual entry (no image required)
router.post('/manual', upload.single('receipt'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { date, vendor, description, amountExGst, gst, total, category,
      paymentMethod, notes } = req.body;

    if (!date || !vendor || !total) {
      res.status(400).json({ error: 'Date, vendor, and total are required' });
      return;
    }

    const id = uuidv4().substring(0, 8);
    let receiptFilename: string | null = null;

    if (req.file) {
      receiptFilename = await storeReceipt(req.file.path, date, vendor, description || vendor);
    }

    const rowNumber = await appendReceiptRow({
      id, date, vendor, description: description || '',
      amountExGst: amountExGst ? parseFloat(amountExGst) : null,
      gst: gst ? parseFloat(gst) : null,
      total: parseFloat(total),
      category: category || 'Other',
      paymentMethod: paymentMethod || null,
      receiptFilename, notes: notes || null,
    });

    const db = await getDatabase();
    db.run(
      `INSERT INTO receipts (id, date, vendor, description, amount_ex_gst, gst, total,
       category, payment_method, notes, receipt_filename, spreadsheet_row)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, date, vendor, description || '', amountExGst ? parseFloat(amountExGst) : null,
       gst ? parseFloat(gst) : null, parseFloat(total), category || 'Other',
       paymentMethod || null, notes || null, receiptFilename, rowNumber]
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
    const receipts = results[0].values.map(row => {
      const obj: any = {};
      columns.forEach((col, i) => { obj[col] = row[i]; });
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
