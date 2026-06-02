import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

const DATA_DIR = path.resolve(__dirname, '../../../data');
const RECEIPTS_DIR = path.join(DATA_DIR, process.env.RECEIPTS_FOLDER || 'receipts');

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

  if (targetExt !== '.pdf') {
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
