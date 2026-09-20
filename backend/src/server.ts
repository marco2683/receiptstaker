import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import authRouter from './routes/auth';
import companiesRouter from './routes/companies';
import receiptsRouter from './routes/receipts';
import emailAccountsRouter from './routes/email-accounts';
import { getDatabase } from './database/schema';
import { initializeSpreadsheet } from './services/spreadsheet';
import { initializeStorage } from './services/storage';
import { DATA_DIR, UPLOADS_DIR, COMPANIES_DIR } from './config/paths';
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
[DATA_DIR, UPLOADS_DIR, COMPANIES_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/companies', companiesRouter);
app.use('/api/receipts', receiptsRouter);
app.use('/api/email-accounts', emailAccountsRouter);

// Health check
app.get('/api/health', async (_req, res) => {
  const isTurso = !!(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN);
  try {
    const db = await getDatabase();
    const result = await db.exec('SELECT COUNT(*) as count FROM receipts');
    const count = result.length > 0 && result[0].values.length > 0 ? result[0].values[0][0] : 0;
    res.json({
      status: 'ok',
      database: isTurso ? 'turso-cloud' : 'local-sqlite',
      receiptsCount: count,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.json({
      status: 'ok',
      database: isTurso ? 'turso-cloud' : 'local-sqlite',
      dbError: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Download spreadsheet (company-scoped)
app.get('/api/spreadsheet/download', (_req, res) => {
  const companyId = _req.headers['x-company-id'] as string;
  if (!companyId) {
    res.status(400).json({ error: 'Company ID required' });
    return;
  }
  const { getCompanySpreadsheetPath } = require('./config/paths');
  const spreadsheetPath = getCompanySpreadsheetPath(companyId);
  if (!fs.existsSync(spreadsheetPath)) {
    res.status(404).json({ error: 'Spreadsheet not found' });
    return;
  }
  res.download(spreadsheetPath, `receipts_${companyId}.xlsx`);
});

// Serve frontend static files (for tunnel/production cloud mode)
const possibleFrontendPaths = [
  path.resolve(process.cwd(), 'frontend/dist'),
  path.resolve(process.cwd(), '../frontend/dist'),
];
const frontendDist = possibleFrontendPaths.find(p => fs.existsSync(p));

if (frontendDist) {
  app.use(express.static(frontendDist));
  // SPA fallback — serve index.html for any non-API route
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
  console.log(`🌐 Serving frontend from: ${frontendDist}`);
}

// Start server
async function start() {
  try {
    await getDatabase();
    console.log('💾 Database initialized');

    await initializeSpreadsheet();
    initializeStorage();

    app.listen(PORT, HOST, () => {
      console.log(`\n🧾 Receipt Taker API running at http://${HOST}:${PORT}`);
      console.log(`   Companies dir: ${COMPANIES_DIR}\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
