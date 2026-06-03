// @ts-ignore - sql.js has no type declarations
import initSqlJs, { Database } from 'sql.js';
import path from 'path';
import fs from 'fs';

let db: Database | null = null;

const DB_PATH = path.resolve(__dirname, '../../data/receipts.db');

export async function getDatabase(): Promise<Database> {
  if (db) return db;

  const SQL = await initSqlJs();
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables — schema matches accountant template fields
  db.run(`
    CREATE TABLE IF NOT EXISTS receipts (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      description TEXT,
      vendor TEXT NOT NULL,
      category TEXT,
      sub_category TEXT,
      amount_inc_gst REAL NOT NULL,
      gst REAL,
      business_pct REAL DEFAULT 1.0,
      notes TEXT,
      receipt_filename TEXT,
      spreadsheet_row INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Migration: if old schema exists with 'total' column, migrate data
  try {
    const tableInfo = db.exec("PRAGMA table_info(receipts)");
    if (tableInfo.length > 0) {
      const columns = tableInfo[0].values.map((row: any[]) => row[1]);
      if (columns.includes('total') && !columns.includes('amount_inc_gst')) {
        console.log('🔄 Migrating database to new schema...');
        db.run(`ALTER TABLE receipts RENAME TO receipts_old`);
        db.run(`
          CREATE TABLE receipts (
            id TEXT PRIMARY KEY,
            date TEXT NOT NULL,
            description TEXT,
            vendor TEXT NOT NULL,
            category TEXT,
            sub_category TEXT,
            amount_inc_gst REAL NOT NULL,
            gst REAL,
            business_pct REAL DEFAULT 1.0,
            notes TEXT,
            receipt_filename TEXT,
            spreadsheet_row INTEGER,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
          )
        `);
        db.run(`
          INSERT INTO receipts (id, date, description, vendor, category, sub_category,
            amount_inc_gst, gst, business_pct, notes, receipt_filename, spreadsheet_row,
            created_at, updated_at)
          SELECT id, date, description, vendor, category, category,
            total, gst, 1.0, notes, receipt_filename, spreadsheet_row,
            created_at, updated_at
          FROM receipts_old
        `);
        db.run(`DROP TABLE receipts_old`);
        console.log('✅ Database migration complete');
      }
    }
  } catch (e) {
    // Migration not needed or already done
  }

  saveDatabase();
  return db;
}

export function saveDatabase(): void {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
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
