import path from 'path';

// Data directory: business OneDrive for cloud sync
const LOCAL_DATA = process.env.DATA_DIR || 'C:\\Users\\sebas\\OneDrive - AtlasDT\\OneDrive - Paniani Products Pty Ltf\\000 - Company Admin\\00 - Accounting\\ReceiptTaker';
const PROJECT_DATA = process.env.RAILWAY_ENVIRONMENT
  ? path.join(process.cwd(), 'data')
  : LOCAL_DATA;

export const DATA_DIR = PROJECT_DATA;
export const SPREADSHEET_PATH = path.join(DATA_DIR, process.env.SPREADSHEET_FILE || 'receipts.xlsx');
export const DB_PATH = path.join(DATA_DIR, 'receipts.db');
export const RECEIPTS_DIR = path.join(DATA_DIR, process.env.RECEIPTS_FOLDER || 'receipts');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
