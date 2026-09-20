import { createClient, Client } from '@libsql/client';
// @ts-ignore - sql.js has no type declarations
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { DATA_DIR, DB_PATH } from '../config/paths';

export interface DatabaseWrapper {
  exec(sql: string, params?: any[]): Promise<any[]>;
  run(sql: string, params?: any[]): Promise<any>;
}

let tursoClient: Client | null = null;
let sqlJsDb: SqlJsDatabase | null = null;
let dbAdapter: DatabaseWrapper | null = null;

export function getDatabaseSync(): DatabaseWrapper | null {
  return dbAdapter;
}

export async function getDatabase(): Promise<DatabaseWrapper> {
  if (dbAdapter) return dbAdapter;

  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  if (tursoUrl && tursoToken) {
    console.log(`⚡ Connecting to Turso Cloud Database: ${tursoUrl}`);
    tursoClient = createClient({
      url: tursoUrl,
      authToken: tursoToken,
    });

    dbAdapter = {
      async exec(sql: string, params: any[] = []) {
        const res = await tursoClient!.execute({ sql, args: params });
        if (!res.rows || res.rows.length === 0) return [];
        const columns = res.columns;
        const values = res.rows.map((row: any) => columns.map(col => row[col]));
        return [{ columns, values }];
      },
      async run(sql: string, params: any[] = []) {
        return await tursoClient!.execute({ sql, args: params });
      }
    };
  } else {
    console.log(`💾 Using Local SQLite File: ${DB_PATH}`);
    const SQL = await initSqlJs();
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH);
      sqlJsDb = new SQL.Database(buffer);
    } else {
      const possibleSeeds = [
        path.join(process.cwd(), 'data', 'receipts.db'),
        path.join(process.cwd(), '../data', 'receipts.db'),
      ];
      const seedFile = possibleSeeds.find(s => fs.existsSync(s));

      if (seedFile) {
        console.log(`🌱 Pre-populating database from seed: ${seedFile}`);
        fs.copyFileSync(seedFile, DB_PATH);
        const buffer = fs.readFileSync(DB_PATH);
        sqlJsDb = new SQL.Database(buffer);
      } else {
        sqlJsDb = new SQL.Database();
      }
    }

    dbAdapter = {
      async exec(sql: string, params: any[] = []) {
        return sqlJsDb!.exec(sql, params);
      },
      async run(sql: string, params: any[] = []) {
        const res = sqlJsDb!.run(sql, params);
        saveDatabase();
        return res;
      }
    };
  }

  // === Ensure tables exist ===
  await dbAdapter.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await dbAdapter.run(`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      logo_filename TEXT,
      logo_shape TEXT DEFAULT 'square',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await dbAdapter.run(`
    CREATE TABLE IF NOT EXISTS company_members (
      user_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'staff',
      invited_by TEXT,
      joined_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, company_id)
    )
  `);

  await dbAdapter.run(`
    CREATE TABLE IF NOT EXISTS invitations (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'staff',
      token TEXT UNIQUE NOT NULL,
      invited_by TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      accepted_at TEXT
    )
  `);

  await dbAdapter.run(`
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
      receipt_image_base64 TEXT,
      spreadsheet_row INTEGER,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await dbAdapter.run(`
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
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await dbAdapter.run(`
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
      processed_at TEXT DEFAULT (datetime('now'))
    )
  `);

  saveDatabase();
  return dbAdapter;
}

export function saveDatabase(): void {
  if (sqlJsDb) {
    const data = sqlJsDb.export();
    const buffer = Buffer.from(data);
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_PATH, buffer);
  }
}

export function closeDatabase(): void {
  if (sqlJsDb) {
    saveDatabase();
    sqlJsDb.close();
    sqlJsDb = null;
  }
  dbAdapter = null;
}
