import path from 'path';

// Data directory: always at project_root/data/ regardless of where we run from
// In dev: cwd is backend/, so go up one level
// On Railway: cwd is /app/ (the backend root), data/ is fine there
const PROJECT_ROOT = process.env.RAILWAY_ENVIRONMENT
  ? process.cwd()  // Railway: /app/ is the backend root
  : path.resolve(process.cwd(), '..');  // Local: go up from backend/ to project root

export const DATA_DIR = path.join(PROJECT_ROOT, 'data');
export const SPREADSHEET_PATH = path.join(DATA_DIR, process.env.SPREADSHEET_FILE || 'receipts.xlsx');
export const DB_PATH = path.join(DATA_DIR, 'receipts.db');
export const RECEIPTS_DIR = path.join(DATA_DIR, process.env.RECEIPTS_FOLDER || 'receipts');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
