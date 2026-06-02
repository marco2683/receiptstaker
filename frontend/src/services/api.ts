// In web dev mode, Vite proxies /api → localhost:3001
// In mobile/production, set VITE_API_URL to your deployed backend
const API_BASE = import.meta.env.VITE_API_URL || '/api';

export interface ReceiptData {
  date: string;
  vendor: string;
  description: string;
  items?: Array<{ name: string; amount: number }>;
  subtotal?: number | null;
  gst: number | null;
  total: number;
  amountExGst?: number | null;
  payment_method?: string | null;
  paymentMethod?: string | null;
  category_guess?: string;
  category?: string;
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
  vendor: string;
  description: string;
  amount_ex_gst: number | null;
  gst: number | null;
  total: number;
  category: string;
  payment_method: string | null;
  notes: string | null;
  receipt_filename: string | null;
  spreadsheet_row: number;
  created_at: string;
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
