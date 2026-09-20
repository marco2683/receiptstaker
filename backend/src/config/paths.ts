import path from 'path';
import fs from 'fs';

// Data directory: supports local OneDrive development or persistent cloud storage (Render / Railway / Docker / env DATA_DIR)
const isCloudEnv = !!(process.env.DATA_DIR || process.env.RAILWAY_ENVIRONMENT || process.env.RENDER || process.env.NODE_ENV === 'production');
const LOCAL_DATA = 'C:\\Users\\sebas\\OneDrive - AtlasDT\\Paniani Products Pty Ltd\\Paniani Products PTY LTD - Documents\\000 - Company Admin\\00 - Accounting\\ReceiptTaker';

const PROJECT_DATA = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : (isCloudEnv ? path.join(process.cwd(), 'data') : LOCAL_DATA);

export const DATA_DIR = PROJECT_DATA;
export const DB_PATH = path.join(DATA_DIR, 'receipts.db');

// Default paths (legacy, for non-company-scoped usage)
export const SPREADSHEET_PATH = path.join(DATA_DIR, process.env.SPREADSHEET_FILE || 'receipts.xlsx');
export const RECEIPTS_DIR = path.join(DATA_DIR, process.env.RECEIPTS_FOLDER || 'receipts');
export const UPLOADS_DIR = path.join(require('os').tmpdir(), 'receipt-taker-uploads');

// Company-scoped paths
export const COMPANIES_DIR = path.join(DATA_DIR, 'companies');

// Sanitize company name for use as a folder name
function sanitizeFolderName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, ' ').trim();
}

// Cache: companyId → company name
const companyNameCache = new Map<string, string>();

/** Register a company name for folder resolution (call during create/init) */
export function registerCompanyName(companyId: string, companyName: string): void {
  companyNameCache.set(companyId, companyName);
}

/** Look up company name from DB if not cached */
function resolveCompanyName(companyId: string): string | null {
  if (companyNameCache.has(companyId)) return companyNameCache.get(companyId)!;
  
  // Try to resolve from DB (lazy import to avoid circular deps)
  try {
    const { getDatabaseSync } = require('../database/schema');
    const db = getDatabaseSync();
    if (db) {
      const result = db.exec('SELECT name FROM companies WHERE id = ?', [companyId]);
      if (result.length > 0 && result[0].values.length > 0) {
        const name = result[0].values[0][0] as string;
        companyNameCache.set(companyId, name);
        return name;
      }
    }
  } catch { /* DB not ready yet */ }
  return null;
}

/**
 * Resolve the directory for a company.
 * Uses company name for human-readable folders.
 * Auto-migrates from old UUID-based folders.
 */
export function getCompanyDir(companyId: string, companyName?: string): string {
  const name = companyName || resolveCompanyName(companyId);
  const sanitized = name ? sanitizeFolderName(name) : null;
  const namedDir = sanitized ? path.join(COMPANIES_DIR, sanitized) : null;
  const idDir = path.join(COMPANIES_DIR, companyId);

  // If a named dir already exists, use it
  if (namedDir && fs.existsSync(namedDir)) {
    return namedDir;
  }

  // If old UUID-based folder exists, rename it to the new name
  if (namedDir && fs.existsSync(idDir)) {
    try {
      fs.renameSync(idDir, namedDir);
      console.log(`📁 Renamed company folder: ${companyId} → ${sanitized}`);
      // Also rename old receipts.xlsx to CompanyName_receipts.xlsx
      const oldXlsx = path.join(namedDir, 'receipts.xlsx');
      const newXlsx = path.join(namedDir, `${sanitized}_receipts.xlsx`);
      if (fs.existsSync(oldXlsx) && !fs.existsSync(newXlsx)) {
        fs.renameSync(oldXlsx, newXlsx);
        console.log(`📊 Renamed spreadsheet → ${sanitized}_receipts.xlsx`);
      }
      return namedDir;
    } catch (err) {
      console.warn(`⚠️ Could not rename folder, using ID-based:`, err);
      return idDir;
    }
  }

  // New company — create with name if available
  return namedDir || idDir;
}

export function getCompanySpreadsheetPath(companyId: string, companyName?: string): string {
  const dir = getCompanyDir(companyId, companyName);
  const folderName = path.basename(dir);
  return path.join(dir, `${folderName}_receipts.xlsx`);
}

export function getCompanyReceiptsDir(companyId: string, companyName?: string): string {
  return path.join(getCompanyDir(companyId, companyName), 'receipts');
}

export function getCompanyUploadsDir(companyId: string, companyName?: string): string {
  return path.join(getCompanyDir(companyId, companyName), 'uploads');
}

