// @ts-ignore - sql.js has no type declarations
import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { DATA_DIR, DB_PATH } from '../config/paths';

let db: Database | null = null;

/** Get DB synchronously (returns null if not initialized yet) */
export function getDatabaseSync(): Database | null {
  return db;
}

export async function getDatabase(): Promise<Database> {
  if (db) return db;
  const SQL = await initSqlJs();
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // === Users ===
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // === Companies ===
  db.run(`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // === Company Members (user <-> company with role) ===
  db.run(`
    CREATE TABLE IF NOT EXISTS company_members (
      user_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'staff',
      invited_by TEXT,
      joined_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, company_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (company_id) REFERENCES companies(id)
    )
  `);

  // === Invitations ===
  db.run(`
    CREATE TABLE IF NOT EXISTS invitations (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'staff',
      token TEXT UNIQUE NOT NULL,
      invited_by TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      accepted_at TEXT,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (invited_by) REFERENCES users(id)
    )
  `);

  // === Receipts — with company_id ===
  db.run(`
    CREATE TABLE IF NOT EXISTS receipts (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      date TEXT NOT NULL,
      description TEXT,
      vendor TEXT NOT NULL,
      category TEXT,
      sub_category TEXT,
      amount_inc_gst REAL NOT NULL,
      gst REAL,
      business_pct REAL DEFAULT 1.0,
      confidence REAL DEFAULT 1.0,
      needs_review INTEGER DEFAULT 0,
      notes TEXT,
      receipt_filename TEXT,
      spreadsheet_row INTEGER,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // === Migrations for existing schema ===
  try {
    const tableInfo = db.exec("PRAGMA table_info(receipts)");
    if (tableInfo.length > 0) {
      const columns = tableInfo[0].values.map((row: any[]) => row[1] as string);
      if (!columns.includes('confidence')) {
        db.run(`ALTER TABLE receipts ADD COLUMN confidence REAL DEFAULT 1.0`);
      }
      if (!columns.includes('needs_review')) {
        db.run(`ALTER TABLE receipts ADD COLUMN needs_review INTEGER DEFAULT 0`);
      }
      if (!columns.includes('company_id')) {
        db.run(`ALTER TABLE receipts ADD COLUMN company_id TEXT DEFAULT ''`);
      }
      if (!columns.includes('created_by')) {
        db.run(`ALTER TABLE receipts ADD COLUMN created_by TEXT`);
      }
    }
  } catch (e) {
    // Migration not needed
  }

  // Companies migration — add logo_filename
  try {
    const companyInfo = db.exec("PRAGMA table_info(companies)");
    if (companyInfo.length > 0) {
      const cols = companyInfo[0].values.map((row: any[]) => row[1] as string);
      if (!cols.includes('logo_filename')) {
        db.run(`ALTER TABLE companies ADD COLUMN logo_filename TEXT`);
      }
      if (!cols.includes('logo_shape')) {
        db.run(`ALTER TABLE companies ADD COLUMN logo_shape TEXT DEFAULT 'square'`);
      }
    }
  } catch (e) {
    // Migration not needed
  }

  // === Email Accounts (linked to company) ===
  db.run(`
    CREATE TABLE IF NOT EXISTS email_accounts (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      added_by TEXT NOT NULL,
      label TEXT NOT NULL,
      email TEXT NOT NULL,
      imap_host TEXT NOT NULL,
      imap_port INTEGER NOT NULL DEFAULT 993,
      imap_user TEXT NOT NULL,
      imap_pass TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      last_scan_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (added_by) REFERENCES users(id)
    )
  `);

  // === Processed Emails (dedup tracking) ===
  db.run(`
    CREATE TABLE IF NOT EXISTS processed_emails (
      id TEXT PRIMARY KEY,
      email_account_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      subject TEXT,
      sender TEXT,
      email_date TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      receipt_id TEXT,
      error TEXT,
      processed_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (email_account_id) REFERENCES email_accounts(id),
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (receipt_id) REFERENCES receipts(id)
    )
  `);

  saveDatabase();
  return db;
}

export function saveDatabase(): void {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_PATH, buffer);
}

export function closeDatabase(): void {
  if (db) {
    saveDatabase();
    db.close();
    db = null;
  }
}
