import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, saveDatabase } from '../database/schema';
import { authMiddleware } from '../middleware/auth';
import { testImapConnection, scanEmailAccount } from '../services/email-scanner';

const router = Router();
router.use(authMiddleware);

// Helper: verify user is admin of the company
async function verifyAdmin(userId: string, companyId: string): Promise<boolean> {
  const db = await getDatabase();
  const result = db.exec(
    'SELECT role FROM company_members WHERE user_id = ? AND company_id = ?',
    [userId, companyId]
  );
  return result.length > 0 && result[0].values.length > 0 && result[0].values[0][0] === 'admin';
}

// Helper: verify membership
async function verifyMembership(userId: string, companyId: string): Promise<boolean> {
  const db = await getDatabase();
  const result = db.exec(
    'SELECT role FROM company_members WHERE user_id = ? AND company_id = ?',
    [userId, companyId]
  );
  return result.length > 0 && result[0].values.length > 0;
}

function getCompanyId(req: Request): string | null {
  return (req.headers['x-company-id'] as string) || null;
}

// GET /api/email-accounts - List email accounts for current company
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) { res.status(400).json({ error: 'Company ID required' }); return; }

    const userId = req.user!.userId;
    if (!(await verifyMembership(userId, companyId))) {
      res.status(403).json({ error: 'Not a member of this company' }); return;
    }

    const db = await getDatabase();
    const results = db.exec(
      `SELECT ea.id, ea.label, ea.email, ea.imap_host, ea.imap_port, ea.enabled, ea.last_scan_at, ea.created_at,
              u.name as added_by_name
       FROM email_accounts ea
       LEFT JOIN users u ON u.id = ea.added_by
       WHERE ea.company_id = ?
       ORDER BY ea.created_at DESC`,
      [companyId]
    );

    const accounts = results.length > 0
      ? results[0].values.map((row: any[]) => ({
          id: row[0], label: row[1], email: row[2], imapHost: row[3],
          imapPort: row[4], enabled: !!row[5], lastScanAt: row[6],
          createdAt: row[7], addedByName: row[8]
        }))
      : [];

    res.json({ accounts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/email-accounts - Add a new email account (admin only)
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) { res.status(400).json({ error: 'Company ID required' }); return; }

    const userId = req.user!.userId;
    if (!(await verifyAdmin(userId, companyId))) {
      res.status(403).json({ error: 'Only admins can add email accounts' }); return;
    }

    const { label, email, imapHost, imapPort, imapUser, imapPass } = req.body;

    if (!email || !imapHost || !imapUser || !imapPass) {
      res.status(400).json({ error: 'Email, IMAP host, username, and password are required' }); return;
    }

    // Test the connection first
    const test = await testImapConnection(imapHost, imapPort || 993, imapUser, imapPass);
    if (!test.success) {
      res.status(400).json({ error: `IMAP connection failed: ${test.error}` }); return;
    }

    const id = uuidv4().substring(0, 12);
    const db = await getDatabase();
    db.run(
      `INSERT INTO email_accounts (id, company_id, added_by, label, email, imap_host, imap_port, imap_user, imap_pass)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, companyId, userId, label || email, email, imapHost, imapPort || 993, imapUser, imapPass]
    );
    saveDatabase();

    console.log(`📧 Email account added: ${email} → company ${companyId}`);
    res.json({
      success: true,
      account: { id, label: label || email, email, imapHost, imapPort: imapPort || 993, enabled: true }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/email-accounts/test - Test IMAP connection without saving
router.post('/test', async (req: Request, res: Response): Promise<void> => {
  try {
    const { imapHost, imapPort, imapUser, imapPass } = req.body;
    if (!imapHost || !imapUser || !imapPass) {
      res.status(400).json({ error: 'IMAP host, username, and password are required' }); return;
    }
    const result = await testImapConnection(imapHost, imapPort || 993, imapUser, imapPass);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/email-accounts/:id/scan - Trigger email scan
router.post('/:id/scan', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) { res.status(400).json({ error: 'Company ID required' }); return; }

    const userId = req.user!.userId;
    if (!(await verifyMembership(userId, companyId))) {
      res.status(403).json({ error: 'Not a member of this company' }); return;
    }

    const db = await getDatabase();
    const results = db.exec(
      'SELECT id, company_id, email, imap_host, imap_port, imap_user, imap_pass, label, last_scan_at FROM email_accounts WHERE id = ? AND company_id = ?',
      [req.params.id, companyId]
    );

    if (results.length === 0 || results[0].values.length === 0) {
      res.status(404).json({ error: 'Email account not found' }); return;
    }

    const row = results[0].values[0] as any[];
    const account = {
      id: row[0], company_id: row[1], email: row[2], imap_host: row[3],
      imap_port: row[4], imap_user: row[5], imap_pass: row[6],
      label: row[7], last_scan_at: row[8]
    };

    console.log(`🔍 Starting email scan for ${account.email}...`);
    const scanResult = await scanEmailAccount(account, userId);

    res.json({ success: true, result: scanResult });
  } catch (err: any) {
    console.error('Scan error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/email-accounts/:id/rescan - Clear history and rescan (for re-processing)
router.post('/:id/rescan', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) { res.status(400).json({ error: 'Company ID required' }); return; }

    const userId = req.user!.userId;
    if (!(await verifyAdmin(userId, companyId))) {
      res.status(403).json({ error: 'Only admins can rescan' }); return;
    }

    const db = await getDatabase();

    // Clear processed emails for this account
    db.run('DELETE FROM processed_emails WHERE email_account_id = ?', [req.params.id]);
    // Reset last_scan_at to scan last 30 days again
    db.run('UPDATE email_accounts SET last_scan_at = NULL WHERE id = ? AND company_id = ?', [req.params.id, companyId]);
    saveDatabase();

    // Now get account and scan
    const results = db.exec(
      'SELECT id, company_id, email, imap_host, imap_port, imap_user, imap_pass, label, last_scan_at FROM email_accounts WHERE id = ? AND company_id = ?',
      [req.params.id, companyId]
    );
    if (results.length === 0 || results[0].values.length === 0) {
      res.status(404).json({ error: 'Email account not found' }); return;
    }

    const row = results[0].values[0] as any[];
    const account = {
      id: row[0], company_id: row[1], email: row[2], imap_host: row[3],
      imap_port: row[4], imap_user: row[5], imap_pass: row[6],
      label: row[7], last_scan_at: null
    };

    console.log(`🔄 Rescan starting for ${account.email} (history cleared)...`);
    const scanResult = await scanEmailAccount(account, userId);

    res.json({ success: true, result: scanResult });
  } catch (err: any) {
    console.error('Rescan error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/email-accounts/:id - Remove an email account (admin only)
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) { res.status(400).json({ error: 'Company ID required' }); return; }

    const userId = req.user!.userId;
    if (!(await verifyAdmin(userId, companyId))) {
      res.status(403).json({ error: 'Only admins can remove email accounts' }); return;
    }

    const db = await getDatabase();
    db.run('DELETE FROM processed_emails WHERE email_account_id = ?', [req.params.id]);
    db.run('DELETE FROM email_accounts WHERE id = ? AND company_id = ?', [req.params.id, companyId]);
    saveDatabase();

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/email-accounts/:id/history - Get scan history
router.get('/:id/history', async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) { res.status(400).json({ error: 'Company ID required' }); return; }

    const db = await getDatabase();
    const results = db.exec(
      `SELECT id, subject, sender, email_date, status, receipt_id, error, processed_at
       FROM processed_emails
       WHERE email_account_id = ? AND company_id = ?
       ORDER BY processed_at DESC
       LIMIT 50`,
      [req.params.id, companyId]
    );

    const history = results.length > 0
      ? results[0].values.map((row: any[]) => ({
          id: row[0], subject: row[1], sender: row[2], emailDate: row[3],
          status: row[4], receiptId: row[5], error: row[6], processedAt: row[7]
        }))
      : [];

    res.json({ history });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
