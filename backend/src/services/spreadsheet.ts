import ExcelJS from 'exceljs';
import fs from 'fs';
import { DATA_DIR, SPREADSHEET_PATH } from '../config/paths';

// ==========================================
// Column mapping — matches accountant template
// "Ynot Innovate 24-25 Income Expenses"
// Sheet: "Expenses 24-25"
// ==========================================
const COL = {
  DATE: 1,          // A - DATE
  DESCRIPTION: 2,   // B - DESCRIPTION (what was bought)
  VENDOR: 3,        // C - VENDOR
  CATEGORY: 4,      // D - CATEGORY (top-level: OPERATING_EXPENSE, etc.)
  SUB_CATEGORY: 5,  // E - SUB CATEGORY (specific: Fuel, Mobile Bill, etc.)
  AMOUNT_INC_GST: 6,// F - AMOUNT (INCLUDING GST)
  GST: 7,           // G - GST (formula: =F/11)
  BUSINESS_PCT: 8,  // H - BUSINESS % (0-1 decimal)
  DEDUCTIBLE: 9,    // I - DEDUCTIBLE AMOUNT (formula: =(F-G)*H)
  GST_APPORTION: 10,// J - GST APPORTIONMENT (formula: =G*H)
  NOTES: 11,        // K - NOTES
  RECEIPT_LINK: 12,  // L - Receipt link (our addition)
  // M-O: Summary area for OPERATING EXPENSES (auto SUMIF formulas)
  // P: gap
  // Q-S: Summary area for MOTOR VEHICLE EXPENSES (auto SUMIF formulas)
};

const HEADER_ROW = 3; // Row 3 has column headers (matching accountant template)
const DATA_START_ROW = 4; // Data starts at row 4

// Top-level categories from accountant's "Category Dataset" sheet
const TOP_CATEGORIES = [
  'OPERATING_EXPENSE',
  'MOTOR_VEHICLE_EXPENSE',
  'PURCHASED ASSESTS TO DEPRECIATE',
  'HEALTH_RELATED_EXPENSE',
  'TRAVEL_EXPENSE',
  'SUPERANNUATION_CONTRIBUTIONS',
  'HOME_OFFICE_EXPENSE',
];

// Sub-categories grouped by top-level category
export const CATEGORY_MAP: Record<string, string[]> = {
  OPERATING_EXPENSE: [
    'Stationary', 'Software', 'IT Accessories', 'Mobile Bill', 'Tools',
    'Project Related Consumables', 'Subscriptions & Business Resources',
    'Bank Fee', 'Project Parts', 'Office', 'Project Costs', 'Clothing',
    'Insurance', 'Materials & Consumables', 'Security', 'Operating Costs',
    'Mobile Phone Accessories', 'PPE', 'Cleaning Supplies', 'First Aid Supplies',
    'COGS', 'Office Equipment', 'Business related meals', 'Software subscriptions',
    'Computers / Mobiles', 'Advertising & Marketing', 'Accounting & Book Keeping Fees',
    'Operating Equipment', 'Dry cleaning', 'Spare parts',
  ],
  MOTOR_VEHICLE_EXPENSE: [
    'Vehicle Registration', 'Vehicle Insurance', 'Fuel', 'Tolls',
    'Vehicle Repair & Maintenance', 'Vehicle Accessories',
    'Vehicle Loan Principal Payment', 'Vehicle Loan Interest payment',
    'Roadside Assistance', 'Parking',
  ],
  'PURCHASED ASSESTS TO DEPRECIATE': [],
  HEALTH_RELATED_EXPENSE: [
    'Private Health Insurance', 'Ambulance Cover',
  ],
  TRAVEL_EXPENSE: [
    'Taxis, Uber, hire car', 'Meals', 'Accomodation', 'Flights',
    'Business related travel expense', 'Public Transport', 'Car parking',
    'Travel Fuel', 'Travel Tolls',
  ],
  SUPERANNUATION_CONTRIBUTIONS: [
    'Voluntary Super Contribution',
  ],
  HOME_OFFICE_EXPENSE: [
    'Gas', 'Electricity', 'Water', 'NBN Internet',
  ],
};

// Reverse lookup: sub-category → top-level category
export function getTopCategory(subCategory: string): string {
  for (const [topCat, subs] of Object.entries(CATEGORY_MAP)) {
    if (subs.includes(subCategory)) return topCat;
  }
  return 'OPERATING_EXPENSE'; // Default
}

// All sub-categories as flat list
export function getAllSubCategories(): string[] {
  return Object.values(CATEGORY_MAP).flat().sort();
}

// Currency number format matching the accountant's template
const CURRENCY_FMT = '_-"$"* #,##0.00_-;-"$"* #,##0.00_-;_-"$"* "-"??_-;_-@_-';
const PCT_FMT = '0%';
const DATE_FMT = 'DD/MM/YYYY';

interface ReceiptRow {
  id: string;
  date: string;
  vendor: string;
  description: string;
  category: string;
  subCategory: string;
  amountIncGst: number;
  gst: number | null;
  businessPct: number;
  confidence: number;     // 0.0-1.0, drives orange highlighting
  notes: string | null;
  receiptFilename: string | null;
}

const ORANGE_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFDE8D0' }, // Light orange for review
};

async function getOrCreateWorkbook(): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();

  if (fs.existsSync(SPREADSHEET_PATH)) {
    await workbook.xlsx.readFile(SPREADSHEET_PATH);
  } else {
    // === Create new workbook matching accountant template ===

    // --- Sheet 1: Expenses ---
    const sheet = workbook.addWorksheet('Expenses', {
      properties: { defaultColWidth: 16 },
    });

    // Row 1: Title
    const titleRow = sheet.getRow(1);
    titleRow.getCell(1).value = 'EXPENSES';
    titleRow.getCell(1).font = { bold: true, size: 14 };

    // Row 3: Column headers
    const headerRow = sheet.getRow(HEADER_ROW);
    headerRow.values = [
      'DATE',                // A
      'DESCRIPTION',         // B
      'VENDOR',              // C
      'CATEGORY',            // D
      'SUB CATEGORY',        // E
      'AMOUNT\n(INCLUDING GST)', // F
      'GST',                 // G
      'BUSINESS  %',         // H
      'DEDUCTIBLE\nAMOUNT',  // I
      ' GST\nAPPORTIONMENT', // J
      'NOTES',               // K
      'RECEIPT',             // L (our addition)
    ];

    // Style headers
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD9E1F2' }, // Light blue background
      };
      cell.border = {
        bottom: { style: 'thin' },
        right: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      };
    });
    headerRow.height = 36;

    // Column widths
    sheet.getColumn(COL.DATE).width = 14;
    sheet.getColumn(COL.DESCRIPTION).width = 30;
    sheet.getColumn(COL.VENDOR).width = 25;
    sheet.getColumn(COL.CATEGORY).width = 28;
    sheet.getColumn(COL.SUB_CATEGORY).width = 30;
    sheet.getColumn(COL.AMOUNT_INC_GST).width = 18;
    sheet.getColumn(COL.GST).width = 14;
    sheet.getColumn(COL.BUSINESS_PCT).width = 12;
    sheet.getColumn(COL.DEDUCTIBLE).width = 16;
    sheet.getColumn(COL.GST_APPORTION).width = 16;
    sheet.getColumn(COL.NOTES).width = 30;
    sheet.getColumn(COL.RECEIPT_LINK).width = 14;

    // Column formats
    sheet.getColumn(COL.DATE).numFmt = DATE_FMT;
    [COL.AMOUNT_INC_GST, COL.GST, COL.DEDUCTIBLE, COL.GST_APPORTION].forEach(c => {
      sheet.getColumn(c).numFmt = CURRENCY_FMT;
    });
    sheet.getColumn(COL.BUSINESS_PCT).numFmt = PCT_FMT;

    // Auto-filter
    sheet.autoFilter = {
      from: { row: HEADER_ROW, column: 1 },
      to: { row: HEADER_ROW, column: 12 },
    };

    // Freeze header rows
    sheet.views = [{ state: 'frozen', ySplit: HEADER_ROW }];

    // === Summary area (columns M-O for Operating, Q-S for Motor Vehicle) ===
    // These use SUMIF formulas like the accountant's template
    const summaryHeaderRow = sheet.getRow(HEADER_ROW);
    summaryHeaderRow.getCell(13).value = 'OPERATING EXPENSES';
    summaryHeaderRow.getCell(13).font = { bold: true, size: 10 };
    summaryHeaderRow.getCell(14).value = 'DEDUCTIBLE\nAMOUNT';
    summaryHeaderRow.getCell(14).font = { bold: true, size: 10 };
    summaryHeaderRow.getCell(14).alignment = { horizontal: 'center', wrapText: true };
    summaryHeaderRow.getCell(15).value = ' GST\nAPPORTIONMENT';
    summaryHeaderRow.getCell(15).font = { bold: true, size: 10 };
    summaryHeaderRow.getCell(15).alignment = { horizontal: 'center', wrapText: true };

    summaryHeaderRow.getCell(17).value = 'MOTOR VEHICLE EXPENSES';
    summaryHeaderRow.getCell(17).font = { bold: true, size: 10 };
    summaryHeaderRow.getCell(18).value = 'DEDUCTIBLE\nAMOUNT';
    summaryHeaderRow.getCell(18).font = { bold: true, size: 10 };
    summaryHeaderRow.getCell(18).alignment = { horizontal: 'center', wrapText: true };
    summaryHeaderRow.getCell(19).value = ' GST\nAPPORTIONMENT';
    summaryHeaderRow.getCell(19).font = { bold: true, size: 10 };
    summaryHeaderRow.getCell(19).alignment = { horizontal: 'center', wrapText: true };

    // Populate summary sub-category rows with SUMIF formulas
    const opSubs = CATEGORY_MAP.OPERATING_EXPENSE;
    const mvSubs = CATEGORY_MAP.MOTOR_VEHICLE_EXPENSE;
    const maxSubs = Math.max(opSubs.length, mvSubs.length);

    for (let i = 0; i < maxSubs; i++) {
      const r = DATA_START_ROW + i;
      const sumRow = sheet.getRow(r);

      if (i < opSubs.length) {
        sumRow.getCell(13).value = opSubs[i]; // M: sub-category name
        sumRow.getCell(14).value = { formula: `SUMIF($E$${DATA_START_ROW}:$E$500, M${r}, $I$${DATA_START_ROW}:$I$500)` };
        sumRow.getCell(14).numFmt = CURRENCY_FMT;
        sumRow.getCell(15).value = { formula: `SUMIF($E$${DATA_START_ROW}:$E$500, M${r}, $J$${DATA_START_ROW}:$J$500)` };
        sumRow.getCell(15).numFmt = CURRENCY_FMT;
      }

      if (i < mvSubs.length) {
        sumRow.getCell(17).value = mvSubs[i]; // Q: sub-category name
        sumRow.getCell(18).value = { formula: `SUMIF($E$${DATA_START_ROW}:$E$500, Q${r}, $I$${DATA_START_ROW}:$I$500)` };
        sumRow.getCell(18).numFmt = CURRENCY_FMT;
        sumRow.getCell(19).value = { formula: `SUMIF($E$${DATA_START_ROW}:$E$500, Q${r}, $J$${DATA_START_ROW}:$J$500)` };
        sumRow.getCell(19).numFmt = CURRENCY_FMT;
      }
    }

    // --- Sheet 2: Category Dataset ---
    const catSheet = workbook.addWorksheet('Category Dataset');
    const topCats = Object.keys(CATEGORY_MAP);
    const catHeaderRow = catSheet.getRow(1);
    topCats.forEach((cat, i) => {
      catHeaderRow.getCell(i + 1).value = cat;
      catHeaderRow.getCell(i + 1).font = { bold: true };
      catSheet.getColumn(i + 1).width = 30;

      const subs = CATEGORY_MAP[cat];
      subs.forEach((sub, j) => {
        catSheet.getRow(j + 2).getCell(i + 1).value = sub;
      });
    });

    await workbook.xlsx.writeFile(SPREADSHEET_PATH);
  }

  return workbook;
}

export async function appendReceiptRow(receipt: ReceiptRow): Promise<number> {
  const workbook = await getOrCreateWorkbook();
  const sheet = workbook.getWorksheet('Expenses') || workbook.worksheets[0];

  if (!sheet) {
    throw new Error('No worksheet found in spreadsheet');
  }

  // Find the next empty row in the data area (start from DATA_START_ROW)
  let nextRow = DATA_START_ROW;
  for (let r = DATA_START_ROW; r <= sheet.rowCount + 1; r++) {
    const dateCell = sheet.getRow(r).getCell(COL.DATE).value;
    const descCell = sheet.getRow(r).getCell(COL.DESCRIPTION).value;
    if (dateCell || descCell) {
      nextRow = r + 1;
    } else {
      break;
    }
  }

  const row = sheet.getRow(nextRow);
  const rowNum = nextRow; // For formula references

  // Parse date
  const dateParts = receipt.date.split('-');
  const dateValue = new Date(
    parseInt(dateParts[0]),
    parseInt(dateParts[1]) - 1,
    parseInt(dateParts[2])
  );

  // A: DATE
  row.getCell(COL.DATE).value = dateValue;
  row.getCell(COL.DATE).numFmt = DATE_FMT;

  // B: DESCRIPTION
  row.getCell(COL.DESCRIPTION).value = receipt.description;

  // C: VENDOR
  row.getCell(COL.VENDOR).value = receipt.vendor;

  // D: CATEGORY (top-level)
  row.getCell(COL.CATEGORY).value = receipt.category;

  // E: SUB CATEGORY
  row.getCell(COL.SUB_CATEGORY).value = receipt.subCategory;

  // F: AMOUNT (INCLUDING GST)
  row.getCell(COL.AMOUNT_INC_GST).value = receipt.amountIncGst;
  row.getCell(COL.AMOUNT_INC_GST).numFmt = CURRENCY_FMT;

  // G: GST — formula: =F/11 (standard Australian 10% GST)
  if (receipt.gst !== null && receipt.gst !== undefined) {
    row.getCell(COL.GST).value = receipt.gst;
  } else {
    row.getCell(COL.GST).value = { formula: `F${rowNum}/11` };
  }
  row.getCell(COL.GST).numFmt = CURRENCY_FMT;

  // H: BUSINESS %
  row.getCell(COL.BUSINESS_PCT).value = receipt.businessPct;
  row.getCell(COL.BUSINESS_PCT).numFmt = PCT_FMT;

  // I: DEDUCTIBLE AMOUNT — formula: =(F-G)*H
  row.getCell(COL.DEDUCTIBLE).value = { formula: `(F${rowNum}-G${rowNum})*H${rowNum}` };
  row.getCell(COL.DEDUCTIBLE).numFmt = CURRENCY_FMT;

  // J: GST APPORTIONMENT — formula: =G*H
  row.getCell(COL.GST_APPORTION).value = { formula: `G${rowNum}*H${rowNum}` };
  row.getCell(COL.GST_APPORTION).numFmt = CURRENCY_FMT;

  // K: NOTES
  row.getCell(COL.NOTES).value = receipt.notes;

  // L: RECEIPT (hyperlink — our addition, not in accountant template)
  if (receipt.receiptFilename) {
    const receiptRelPath = `receipts/${receipt.receiptFilename}`;
    row.getCell(COL.RECEIPT_LINK).value = {
      text: '📎 View',
      hyperlink: receiptRelPath,
    };
    row.getCell(COL.RECEIPT_LINK).font = {
      color: { argb: 'FF3182CE' },
      underline: true,
    };
  }

  // Orange highlight for low-confidence entries (needs manual review)
  if (receipt.confidence < 0.7) {
    for (let c = 1; c <= 12; c++) {
      row.getCell(c).fill = ORANGE_FILL;
    }
    // Append confidence note
    const existingNotes = receipt.notes || '';
    row.getCell(COL.NOTES).value = `⚠️ LOW CONFIDENCE (${Math.round(receipt.confidence * 100)}%) ${existingNotes}`.trim();
  }

  row.commit();

  // Retry logic for OneDrive file locking (EBUSY errors)
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await workbook.xlsx.writeFile(SPREADSHEET_PATH);
      console.log(`📊 Row ${nextRow} written to spreadsheet (confidence: ${receipt.confidence})`);
      return nextRow;
    } catch (err: any) {
      if (err.code === 'EBUSY' && attempt < 5) {
        console.log(`⏳ Spreadsheet locked by OneDrive, retrying (${attempt}/5)...`);
        await new Promise(r => setTimeout(r, attempt * 1000));
      } else {
        throw err;
      }
    }
  }
  return nextRow;
}

export async function initializeSpreadsheet(): Promise<void> {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  await getOrCreateWorkbook();
  console.log(`📊 Spreadsheet ready at: ${SPREADSHEET_PATH}`);
}
