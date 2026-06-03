import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import receiptsRouter from './routes/receipts';
import { getDatabase } from './database/schema';
import { initializeSpreadsheet } from './services/spreadsheet';
import { initializeStorage } from './services/storage';
import { DATA_DIR, UPLOADS_DIR, SPREADSHEET_PATH } from './config/paths';
import fs from 'fs';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const app = express();
const PORT = parseInt(process.env.PORT || '3001');
const HOST = process.env.HOST || '0.0.0.0';

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Ensure directories exist
[DATA_DIR, UPLOADS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// API Routes
app.use('/api/receipts', receiptsRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Download spreadsheet
app.get('/api/spreadsheet/download', (_req, res) => {
  if (!fs.existsSync(SPREADSHEET_PATH)) {
    res.status(404).json({ error: 'Spreadsheet not found' });
    return;
  }
  res.download(SPREADSHEET_PATH, 'receipts.xlsx');
});

// Start server
async function start() {
  try {
    await getDatabase();
    console.log('💾 Database initialized');

    await initializeSpreadsheet();
    initializeStorage();

    app.listen(PORT, HOST, () => {
      console.log(`\n🧾 Receipt Taker API running at http://${HOST}:${PORT}`);
      console.log(`   POST /api/receipts/auto     → Auto-scan (fire & forget)`);
      console.log(`   POST /api/receipts/scan     → Upload & OCR receipt`);
      console.log(`   POST /api/receipts/confirm  → Confirm & save`);
      console.log(`   POST /api/receipts/manual   → Manual entry`);
      console.log(`   GET  /api/receipts          → List all receipts`);
      console.log(`   GET  /api/spreadsheet/download → Download Excel\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
