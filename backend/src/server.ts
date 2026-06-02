import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import receiptsRouter from './routes/receipts';
import { getDatabase } from './database/schema';
import { initializeSpreadsheet } from './services/spreadsheet';
import { initializeStorage } from './services/storage';
import fs from 'fs';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.example') });

const app = express();
const PORT = parseInt(process.env.PORT || '3001');
const HOST = process.env.HOST || '0.0.0.0';

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Ensure uploads directory exists
const uploadsDir = path.resolve(__dirname, '../../data/uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// API Routes
app.use('/api/receipts', receiptsRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
      console.log(`   POST /api/receipts/scan    → Upload & OCR receipt`);
      console.log(`   POST /api/receipts/confirm  → Confirm & save`);
      console.log(`   POST /api/receipts/manual   → Manual entry`);
      console.log(`   GET  /api/receipts          → List all receipts\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
