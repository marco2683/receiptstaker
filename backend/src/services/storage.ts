import path from 'path';
import fs from 'fs';
import { RECEIPTS_DIR } from '../config/paths';

// Sharp is optional — used for image optimization but not required
let sharp: any = null;
try {
  sharp = require('sharp');
} catch {
  console.log('⚠️  sharp not available — receipts will be stored without optimization');
}

export async function storeReceipt(
  sourcePath: string, date: string, vendor: string, description: string
): Promise<string> {
  const [year, month] = date.split('-');
  const targetDir = path.join(RECEIPTS_DIR, year, month);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  const cleanVendor = sanitize(vendor);
  const cleanDesc = sanitize(description);
  const dateFlat = date.replace(/-/g, '');
  const sourceExt = path.extname(sourcePath).toLowerCase();
  const targetExt = ['.pdf', '.png', '.webp'].includes(sourceExt) ? sourceExt : '.jpg';
  const filename = `${dateFlat}_${cleanVendor}_${cleanDesc}${targetExt}`;
  const targetPath = path.join(targetDir, filename);

  if (targetExt !== '.pdf' && sharp) {
    try {
      await sharp(sourcePath)
        .resize(2000, 3000, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toFile(targetPath.replace(targetExt, '.jpg'));
      if (fs.existsSync(sourcePath)) fs.unlinkSync(sourcePath);
      return filename.replace(targetExt, '.jpg');
    } catch {
      fs.copyFileSync(sourcePath, targetPath);
      if (fs.existsSync(sourcePath) && sourcePath !== targetPath) fs.unlinkSync(sourcePath);
      return filename;
    }
  } else {
    fs.copyFileSync(sourcePath, targetPath);
    if (fs.existsSync(sourcePath) && sourcePath !== targetPath) fs.unlinkSync(sourcePath);
    return filename;
  }
}

export function getReceiptPath(date: string, filename: string): string {
  const [year, month] = date.split('-');
  return path.join(RECEIPTS_DIR, year, month, filename);
}

export function deleteReceipt(date: string, filename: string): boolean {
  const fp = getReceiptPath(date, filename);
  if (fs.existsSync(fp)) { fs.unlinkSync(fp); return true; }
  return false;
}

function sanitize(str: string): string {
  return str.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_')
    .replace(/_+/g, '_').replace(/^_|_$/g, '').substring(0, 40).replace(/_$/g, '');
}

export function initializeStorage(): void {
  if (!fs.existsSync(RECEIPTS_DIR)) fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
  console.log(`📁 Receipt storage ready at: ${RECEIPTS_DIR}`);
}
