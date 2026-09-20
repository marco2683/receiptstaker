// In web dev mode, Vite proxies /api → localhost:3001
// In mobile/production, set VITE_API_URL to your deployed backend
const API_BASE = import.meta.env.VITE_API_URL || '/api';

// ---- Auth Token Management ----
function getToken(): string | null {
  return localStorage.getItem('auth_token');
}

function getCompanyId(): string | null {
  return localStorage.getItem('current_company_id');
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const companyId = getCompanyId();
  if (companyId) headers['X-Company-Id'] = companyId;
  return headers;
}

export async function authFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  const headers = { ...authHeaders(), ...(opts.headers as Record<string, string> || {}) };
  const res = await fetch(url, { ...opts, headers });
  if (res.status === 401) {
    // Token expired — trigger logout
    localStorage.removeItem('auth_token');
    localStorage.removeItem('current_company_id');
    window.location.href = '/login';
    throw new Error('Session expired');
  }
  return res;
}

// ---- Auth API ----
export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  role: 'admin' | 'staff';
  logoFilename: string | null;
  logoShape: 'landscape' | 'square' | 'portrait';
}

export function getCompanyLogoUrl(companyId: string): string {
  return `${API_BASE}/companies/${companyId}/logo`;
}

export async function uploadCompanyLogo(companyId: string, file: File): Promise<{ logoFilename: string }> {
  const formData = new FormData();
  formData.append('logo', file);
  const res = await authFetch(`${API_BASE}/companies/${companyId}/logo`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to upload logo');
  }
  return res.json();
}

export async function updateLogoShape(companyId: string, shape: 'landscape' | 'square' | 'portrait'): Promise<void> {
  const res = await authFetch(`${API_BASE}/companies/${companyId}/logo-shape`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shape }),
  });
  if (!res.ok) throw new Error('Failed to update logo shape');
}

export interface LoginResponse {
  success: boolean;
  token: string;
  user: AuthUser;
  companies: Company[];
}

export interface SignupResponse {
  success: boolean;
  token: string;
  user: AuthUser;
  pendingInvites: Array<{ id: string; companyId: string; role: string; token: string }>;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Login failed');
  }
  return res.json();
}

export async function signup(email: string, password: string, name: string): Promise<SignupResponse> {
  const res = await fetch(`${API_BASE}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Registration failed');
  }
  return res.json();
}

export async function fetchCurrentUser(): Promise<{ user: AuthUser; companies: Company[] }> {
  const res = await authFetch(`${API_BASE}/auth/me`);
  if (!res.ok) throw new Error('Not authenticated');
  return res.json();
}

// ---- Company API ----
export async function createCompany(name: string): Promise<{ success: boolean; company: Company }> {
  const res = await authFetch(`${API_BASE}/companies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to create company');
  }
  return res.json();
}

export interface Member {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'staff';
  joinedAt: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: 'admin' | 'staff';
  createdAt: string;
}

export async function fetchCompanyMembers(companyId: string): Promise<{ members: Member[]; pendingInvitations: Invitation[] }> {
  const res = await authFetch(`${API_BASE}/companies/${companyId}/members`);
  if (!res.ok) throw new Error('Failed to load members');
  return res.json();
}

export async function inviteMember(companyId: string, email: string, role: string = 'staff'): Promise<any> {
  const res = await authFetch(`${API_BASE}/companies/${companyId}/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, role }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to invite');
  }
  return res.json();
}

export async function acceptInvitation(token: string): Promise<{ success: boolean; company: Company }> {
  const res = await authFetch(`${API_BASE}/companies/invitations/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to accept invitation');
  }
  return res.json();
}

export async function removeMember(companyId: string, memberId: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/companies/${companyId}/members/${memberId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to remove member');
}

// ---- Receipt API ----
export async function autoScan(file: File): Promise<{ success: boolean; message: string }> {
  const formData = new FormData();
  formData.append('receipt', file);
  const res = await authFetch(`${API_BASE}/receipts/auto`, { method: 'POST', body: formData });
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
  company_id: string;
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
  created_by: string | null;
  created_at: string;
}

export interface CategoryMap {
  [topCategory: string]: string[];
}

export async function fetchCategories(): Promise<CategoryMap> {
  const res = await authFetch(`${API_BASE}/receipts/categories`);
  if (!res.ok) throw new Error('Failed to load categories');
  const data = await res.json();
  return data.categories;
}

export async function scanReceipt(file: File): Promise<ScanResult> {
  const formData = new FormData();
  formData.append('receipt', file);
  const res = await authFetch(`${API_BASE}/receipts/scan`, { method: 'POST', body: formData });
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
  const res = await authFetch(`${API_BASE}/receipts/confirm`, { method: 'POST', body: formData });
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
  const res = await authFetch(`${API_BASE}/receipts/manual`, { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Save failed');
  }
  return res.json();
}

export async function listReceipts(): Promise<ReceiptRecord[]> {
  const res = await authFetch(`${API_BASE}/receipts`);
  if (!res.ok) throw new Error('Failed to load receipts');
  const data = await res.json();
  return data.receipts;
}

export async function fetchReceipt(id: string): Promise<ReceiptRecord> {
  const res = await authFetch(`${API_BASE}/receipts/${id}`);
  if (!res.ok) throw new Error('Failed to load receipt');
  const data = await res.json();
  return data.receipt;
}

export async function updateReceipt(id: string, data: Record<string, any>): Promise<void> {
  const res = await authFetch(`${API_BASE}/receipts/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to update receipt');
  }
}

export async function deleteReceipt(id: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/receipts/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete receipt');
}

export async function fetchReceiptImageUrl(id: string): Promise<string | null> {
  try {
    const res = await authFetch(`${API_BASE}/receipts/${id}/image`);
    if (!res.ok) return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

// ========== EMAIL ACCOUNTS ==========

export interface EmailAccount {
  id: string;
  label: string;
  email: string;
  imapHost: string;
  imapPort: number;
  enabled: boolean;
  lastScanAt: string | null;
  createdAt: string;
  addedByName: string;
}

export interface ScanResult {
  total_emails_checked: number;
  receipts_found: number;
  receipts_saved: number;
  errors: string[];
  details: Array<{
    subject: string;
    from: string;
    status: 'saved' | 'skipped' | 'error';
    receipt_id?: string;
    error?: string;
  }>;
}

export interface ScanHistoryItem {
  id: string;
  subject: string;
  sender: string;
  emailDate: string;
  status: string;
  receiptId: string | null;
  error: string | null;
  processedAt: string;
}

export async function fetchEmailAccounts(): Promise<EmailAccount[]> {
  const res = await authFetch(`${API_BASE}/email-accounts`);
  if (!res.ok) throw new Error('Failed to load email accounts');
  const data = await res.json();
  return data.accounts;
}

export async function addEmailAccount(data: {
  label: string; email: string; imapHost: string; imapPort: number; imapUser: string; imapPass: string;
}): Promise<{ success: boolean; account: EmailAccount }> {
  const res = await authFetch(`${API_BASE}/email-accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to add email account');
  }
  return res.json();
}

export async function testEmailConnection(data: {
  imapHost: string; imapPort: number; imapUser: string; imapPass: string;
}): Promise<{ success: boolean; error?: string }> {
  const res = await authFetch(`${API_BASE}/email-accounts/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function triggerEmailScan(accountId: string): Promise<ScanResult> {
  const res = await authFetch(`${API_BASE}/email-accounts/${accountId}/scan`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Scan failed');
  }
  const data = await res.json();
  return data.result;
}

export async function deleteEmailAccount(accountId: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/email-accounts/${accountId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete email account');
}

export async function fetchScanHistory(accountId: string): Promise<ScanHistoryItem[]> {
  const res = await authFetch(`${API_BASE}/email-accounts/${accountId}/history`);
  if (!res.ok) throw new Error('Failed to load scan history');
  const data = await res.json();
  return data.history;
}

export async function triggerEmailRescan(accountId: string): Promise<ScanResult> {
  const res = await authFetch(`${API_BASE}/email-accounts/${accountId}/rescan`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Rescan failed');
  }
  const data = await res.json();
  return data.result;
}

export async function downloadSpreadsheet(): Promise<void> {
  const companyId = getCompanyId();
  if (!companyId) throw new Error('No company selected');
  const res = await authFetch(`${API_BASE}/spreadsheet/download`);
  if (!res.ok) throw new Error('Failed to download spreadsheet');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `receipts_${companyId}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

