// In web dev mode, Vite proxies /api → localhost:3001
// In mobile/production, set VITE_API_URL to your deployed backend
const API_BASE = import.meta.env.VITE_API_URL || '/api';

export async function autoScan(file: File): Promise<{ success: boolean; message: string }> {
  const formData = new FormData();
  formData.append('receipt', file);
  const res = await fetch(`${API_BASE}/receipts/auto`, { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Upload failed');
  }
  return res.json();
}

export interface ReceiptData {
  date: string;
  vendor: string;
  description: string;
  items?: Array<{ name: string; amount: number }>;
  amountIncGst: number;
  gst: number | null;
  payment_method?: string | null;
  category: string;       // Top-level: OPERATING_EXPENSE, etc.
  subCategory: string;    // Specific: Fuel, Mobile Bill, etc.
  businessPct: number;    // 0.0-1.0
  notes?: string;
}

export interface ScanResult {
  success: boolean;
  data: ReceiptData;
  tempFile: string;
}

export interface SaveResult {
  success: boolean;
  id: string;
  rowNumber: number;
  receiptFilename: string | null;
}

export interface ReceiptRecord {
  id: string;
  date: string;
  description: string;
  vendor: string;
  category: string;
  sub_category: string;
  amount_inc_gst: number;
  gst: number | null;
  business_pct: number;
  notes: string | null;
  receipt_filename: string | null;
  spreadsheet_row: number;
  created_at: string;
}

export interface CategoryMap {
  [topCategory: string]: string[];
}

export async function fetchCategories(): Promise<CategoryMap> {
  const res = await fetch(`${API_BASE}/receipts/categories`);
  if (!res.ok) throw new Error('Failed to load categories');
  const data = await res.json();
  return data.categories;
}

export async function scanReceipt(file: File): Promise<ScanResult> {
  const formData = new FormData();
  formData.append('receipt', file);
  const res = await fetch(`${API_BASE}/receipts/scan`, { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Scan failed');
  }
  return res.json();
}

export async function confirmReceipt(data: Record<string, any>, file?: File): Promise<SaveResult> {
  const formData = new FormData();
  Object.entries(data).forEach(([key, value]) => {
    if (value !== null && value !== undefined) formData.append(key, String(value));
  });
  if (file) formData.append('receipt', file);
  const res = await fetch(`${API_BASE}/receipts/confirm`, { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Save failed');
  }
  return res.json();
}

export async function manualEntry(data: Record<string, any>, file?: File): Promise<SaveResult> {
  const formData = new FormData();
  Object.entries(data).forEach(([key, value]) => {
    if (value !== null && value !== undefined) formData.append(key, String(value));
  });
  if (file) formData.append('receipt', file);
  const res = await fetch(`${API_BASE}/receipts/manual`, { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Save failed');
  }
  return res.json();
}

export async function listReceipts(): Promise<ReceiptRecord[]> {
  const res = await fetch(`${API_BASE}/receipts`);
  if (!res.ok) throw new Error('Failed to load receipts');
  const data = await res.json();
  return data.receipts;
}

export async function deleteReceipt(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/receipts/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete receipt');
}

export function getReceiptImageUrl(id: string): string {
  return `${API_BASE}/receipts/${id}/image`;
}
