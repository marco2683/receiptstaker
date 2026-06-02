import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.resolve(__dirname, '../../../data');
const SPREADSHEET_PATH = path.join(DATA_DIR, process.env.SPREADSHEET_FILE || 'receipts.xlsx');

// Column mapping
const COLUMNS = {
  DATE: 1,          // A
  VENDOR: 2,        // B
  DESCRIPTION: 3,   // C
  AMOUNT_EX_GST: 4, // D
  GST: 5,           // E
  TOTAL: 6,         // F
  CATEGORY: 7,      // G
  PAYMENT: 8,       // H
  RECEIPT_LINK: 9,  // I
  NOTES: 10,        // J
  ID: 11,           // K
};

const HEADER_ROW = 1;

interface ReceiptRow {
  id: string;
  date: string;
  vendor: string;
  description: string;
  amountExGst: number | null;
  gst: number | null;
  total: number;
  category: string;
  paymentMethod: string | null;
  receiptFilename: string | null;
  notes: string | null;
}

async function getOrCreateWorkbook(): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();

  if (fs.existsSync(SPREADSHEET_PATH)) {
    await workbook.xlsx.readFile(SPREADSHEET_PATH);
  } else {
    // Create new workbook with template
    const sheet = workbook.addWorksheet('Receipts', {
      properties: { defaultColWidth: 18 },
    });

    // Header row
    const headerRow = sheet.getRow(HEADER_ROW);
    headerRow.values = [
      'Date', 'Vendor', 'Description', 'Amount (ex GST)', 
      'GST', 'Total', 'Category', 'Payment Method', 
      'Receipt', 'Notes', 'ID'
    ];

    // Style header
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2D3748' },
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FF4A5568' } },
      };
    });

    headerRow.height = 28;

    // Set column widths
    sheet.getColumn(COLUMNS.DATE).width = 14;
    sheet.getColumn(COLUMNS.VENDOR).width = 25;
    sheet.getColumn(COLUMNS.DESCRIPTION).width = 30;
    sheet.getColumn(COLUMNS.AMOUNT_EX_GST).width = 16;
    sheet.getColumn(COLUMNS.GST).width = 12;
    sheet.getColumn(COLUMNS.TOTAL).width = 14;
    sheet.getColumn(COLUMNS.CATEGORY).width = 22;
    sheet.getColumn(COLUMNS.PAYMENT).width = 16;
    sheet.getColumn(COLUMNS.RECEIPT_LINK).width = 14;
    sheet.getColumn(COLUMNS.NOTES).width = 30;
    sheet.getColumn(COLUMNS.ID).width = 12;

    // Format currency columns
    [COLUMNS.AMOUNT_EX_GST, COLUMNS.GST, COLUMNS.TOTAL].forEach(col => {
      sheet.getColumn(col).numFmt = '$#,##0.00';
    });

    // Date format
    sheet.getColumn(COLUMNS.DATE).numFmt = 'DD/MM/YYYY';

    // Auto-filter
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: Object.keys(COLUMNS).length },
    };

    // Freeze header row
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    await workbook.xlsx.writeFile(SPREADSHEET_PATH);
  }

  return workbook;
}

export async function appendReceiptRow(receipt: ReceiptRow): Promise<number> {
  const workbook = await getOrCreateWorkbook();
  const sheet = workbook.getWorksheet('Receipts') || workbook.worksheets[0];

  if (!sheet) {
    throw new Error('No worksheet found in spreadsheet');
  }

  // Find the next empty row
  let nextRow = HEADER_ROW + 1;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > HEADER_ROW) {
      nextRow = rowNumber + 1;
    }
  });

  const row = sheet.getRow(nextRow);

  // Parse date
  const dateParts = receipt.date.split('-');
  const dateValue = new Date(
    parseInt(dateParts[0]), 
    parseInt(dateParts[1]) - 1, 
    parseInt(dateParts[2])
  );

  row.getCell(COLUMNS.DATE).value = dateValue;
  row.getCell(COLUMNS.DATE).numFmt = 'DD/MM/YYYY';
  row.getCell(COLUMNS.VENDOR).value = receipt.vendor;
  row.getCell(COLUMNS.DESCRIPTION).value = receipt.description;
  row.getCell(COLUMNS.AMOUNT_EX_GST).value = receipt.amountExGst;
  row.getCell(COLUMNS.GST).value = receipt.gst;
  row.getCell(COLUMNS.TOTAL).value = receipt.total;
  row.getCell(COLUMNS.CATEGORY).value = receipt.category;
  row.getCell(COLUMNS.PAYMENT).value = receipt.paymentMethod;
  row.getCell(COLUMNS.NOTES).value = receipt.notes;
  row.getCell(COLUMNS.ID).value = receipt.id;

  // Add receipt hyperlink if filename provided
  if (receipt.receiptFilename) {
    const receiptRelPath = getReceiptRelativePath(receipt.date, receipt.receiptFilename);
    row.getCell(COLUMNS.RECEIPT_LINK).value = {
      text: '📎 View',
      hyperlink: receiptRelPath,
    };
    row.getCell(COLUMNS.RECEIPT_LINK).font = {
      color: { argb: 'FF3182CE' },
      underline: true,
    };
  }

  // Alternate row colors for readability
  const isEven = (nextRow - HEADER_ROW) % 2 === 0;
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: isEven ? 'FFF7FAFC' : 'FFFFFFFF' },
    };
    cell.alignment = { vertical: 'middle' };
  });

  row.commit();

  await workbook.xlsx.writeFile(SPREADSHEET_PATH);
  return nextRow;
}

function getReceiptRelativePath(date: string, filename: string): string {
  const [year, month] = date.split('-');
  return `receipts/${year}/${month}/${filename}`;
}

export async function initializeSpreadsheet(): Promise<void> {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  await getOrCreateWorkbook();
  console.log(`📊 Spreadsheet ready at: ${SPREADSHEET_PATH}`);
}
