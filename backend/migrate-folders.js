const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = 'C:\\Users\\sebas\\OneDrive - AtlasDT\\OneDrive - Paniani Products Pty Ltf\\000 - Company Admin\\00 - Accounting\\ReceiptTaker\\receipts.db';
const companiesDir = 'C:\\Users\\sebas\\OneDrive - AtlasDT\\OneDrive - Paniani Products Pty Ltf\\000 - Company Admin\\00 - Accounting\\ReceiptTaker\\companies';

(async () => {
  const SQL = await initSqlJs();
  const buf = fs.readFileSync(dbPath);
  const db = new SQL.Database(buf);

  const result = db.exec('SELECT id, name FROM companies');
  if (result.length > 0) {
    for (const row of result[0].values) {
      const [id, name] = row;
      const sanitized = String(name).replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, ' ').trim();
      const oldDir = path.join(companiesDir, String(id));
      const newDir = path.join(companiesDir, sanitized);

      if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) {
        fs.renameSync(oldDir, newDir);
        console.log(`✅ Renamed: ${id} → ${sanitized}`);

        // Rename receipts.xlsx too
        const oldXlsx = path.join(newDir, 'receipts.xlsx');
        const newXlsx = path.join(newDir, `${sanitized}_receipts.xlsx`);
        if (fs.existsSync(oldXlsx)) {
          fs.renameSync(oldXlsx, newXlsx);
          console.log(`   📊 Renamed: receipts.xlsx → ${sanitized}_receipts.xlsx`);
        }
      } else if (fs.existsSync(newDir)) {
        console.log(`⏭️  Already migrated: ${sanitized}`);
      } else {
        console.log(`⚠️  No folder found for: ${id} (${sanitized})`);
      }
    }
  }
  db.close();
  console.log('\nDone!');
})();
