import path from 'path';

// Single source of truth for data directory
// Works in both dev (tsx src/server.ts) and prod (node dist/server.js)
export const DATA_DIR = path.resolve(process.cwd(), 'data');
export const SPREADSHEET_PATH = path.join(DATA_DIR, process.env.SPREADSHEET_FILE || 'receipts.xlsx');
export const DB_PATH = path.join(DATA_DIR, 'receipts.db');
export const RECEIPTS_DIR = path.join(DATA_DIR, process.env.RECEIPTS_FOLDER || 'receipts');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
