import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { getDatabase, saveDatabase } from '../database/schema';
import { authMiddleware } from '../middleware/auth';
import { initializeCompanySpreadsheet } from '../services/spreadsheet';
import { initializeCompanyStorage } from '../services/storage';
import { COMPANIES_DIR } from '../config/paths';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const router = Router();

// All company routes require authentication
router.use(authMiddleware);

// POST /api/companies — Create a new company
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name } = req.body;
    const userId = req.user!.userId;

    if (!name || !name.trim()) {
      res.status(400).json({ error: 'Company name is required' });
      return;
    }

    const db = await getDatabase();
    const id = uuidv4().substring(0, 12);
    const slug = name.trim().toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 40);

    // Ensure unique slug
    const existingSlug = await db.exec('SELECT id FROM companies WHERE slug = ?', [slug]);
    const finalSlug = existingSlug.length > 0 && existingSlug[0].values.length > 0
      ? `${slug}-${id.substring(0, 4)}`
      : slug;

    await db.run(
      'INSERT INTO companies (id, name, slug) VALUES (?, ?, ?)',
      [id, name.trim(), finalSlug]
    );

    // Creator becomes admin
    await db.run(
      'INSERT INTO company_members (user_id, company_id, role) VALUES (?, ?, ?)',
      [userId, id, 'admin']
    );
    saveDatabase();

    // Initialize company spreadsheet and storage
    await initializeCompanySpreadsheet(id);
    initializeCompanyStorage(id);

    console.log(`🏢 Company created: ${name} (${id}) by user ${userId}`);
    res.json({
      success: true,
      company: { id, name: name.trim(), slug: finalSlug, role: 'admin' },
    });
  } catch (error: any) {
    console.error('Create company error:', error);
    res.status(500).json({ error: error.message || 'Failed to create company' });
  }
});

// GET /api/companies/:id/members — List members
router.get('/:id/members', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const db = await getDatabase();

    // Verify user is a member of this company
    const membership = await db.exec(
      'SELECT role FROM company_members WHERE user_id = ? AND company_id = ?',
      [userId, id]
    );
    if (membership.length === 0 || membership[0].values.length === 0) {
      res.status(403).json({ error: 'Not a member of this company' });
      return;
    }

    // Get all members
    const members = await db.exec(
      `SELECT u.id, u.email, u.name, cm.role, cm.joined_at
       FROM company_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.company_id = ?
       ORDER BY cm.joined_at ASC`,
      [id]
    );

    const memberList = members.length > 0
      ? members[0].values.map((row: any[]) => ({
          id: row[0], email: row[1], name: row[2], role: row[3], joinedAt: row[4]
        }))
      : [];

    // Get pending invitations
    const invitations = await db.exec(
      `SELECT id, email, role, created_at FROM invitations
       WHERE company_id = ? AND accepted_at IS NULL
       ORDER BY created_at DESC`,
      [id]
    );

    const inviteList = invitations.length > 0
      ? invitations[0].values.map((row: any[]) => ({
          id: row[0], email: row[1], role: row[2], createdAt: row[3]
        }))
      : [];

    res.json({ members: memberList, pendingInvitations: inviteList });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/companies/:id/invite — Invite a member (admin only)
router.post('/:id/invite', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { email, role = 'staff' } = req.body;
    const userId = req.user!.userId;
    const db = await getDatabase();

    if (!email || !email.trim()) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    if (!['admin', 'staff'].includes(role)) {
      res.status(400).json({ error: 'Role must be admin or staff' });
      return;
    }

    // Verify user is admin of this company
    const membership = await db.exec(
      'SELECT role FROM company_members WHERE user_id = ? AND company_id = ?',
      [userId, id]
    );
    if (membership.length === 0 || membership[0].values.length === 0 ||
        membership[0].values[0][0] !== 'admin') {
      res.status(403).json({ error: 'Only admins can invite members' });
      return;
    }

    // Check if user is already a member
    const cleanEmail = email.toLowerCase().trim();
    const existingUser = await db.exec('SELECT id FROM users WHERE email = ?', [cleanEmail]);
    if (existingUser.length > 0 && existingUser[0].values.length > 0) {
      const targetUserId = existingUser[0].values[0][0] as string;
      const existingMember = await db.exec(
        'SELECT user_id FROM company_members WHERE user_id = ? AND company_id = ?',
        [targetUserId, id]
      );
      if (existingMember.length > 0 && existingMember[0].values.length > 0) {
        res.status(409).json({ error: 'User is already a member of this company' });
        return;
      }
    }

    // Check for existing pending invitation
    const existingInvite = await db.exec(
      'SELECT id FROM invitations WHERE company_id = ? AND email = ? AND accepted_at IS NULL',
      [id, cleanEmail]
    );
    if (existingInvite.length > 0 && existingInvite[0].values.length > 0) {
      res.status(409).json({ error: 'Invitation already pending for this email' });
      return;
    }

    const inviteId = uuidv4().substring(0, 12);
    const token = crypto.randomBytes(32).toString('hex');

    await db.run(
      'INSERT INTO invitations (id, company_id, email, role, token, invited_by) VALUES (?, ?, ?, ?, ?, ?)',
      [inviteId, id, cleanEmail, role, token, userId]
    );
    saveDatabase();

    // Get company name for the response
    const companyResult = await db.exec('SELECT name FROM companies WHERE id = ?', [id]);
    const companyName = companyResult.length > 0 ? companyResult[0].values[0][0] : 'Unknown';

    console.log(`📧 Invitation sent: ${cleanEmail} → ${companyName} (${role})`);
    res.json({
      success: true,
      invitation: { id: inviteId, email: cleanEmail, role, token },
      message: `Invitation created for ${cleanEmail}`,
    });
  } catch (error: any) {
    console.error('Invite error:', error);
    res.status(500).json({ error: error.message || 'Failed to create invitation' });
  }
});

// POST /api/companies/invitations/accept — Accept an invitation
router.post('/invitations/accept', async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.body;
    const userId = req.user!.userId;
    const db = await getDatabase();

    if (!token) {
      res.status(400).json({ error: 'Invitation token is required' });
      return;
    }

    // Find the invitation
    const inviteResult = await db.exec(
      `SELECT i.id, i.company_id, i.email, i.role, c.name as company_name
       FROM invitations i
       JOIN companies c ON c.id = i.company_id
       WHERE i.token = ? AND i.accepted_at IS NULL`,
      [token]
    );

    if (inviteResult.length === 0 || inviteResult[0].values.length === 0) {
      res.status(404).json({ error: 'Invalid or expired invitation' });
      return;
    }

    const [inviteId, companyId, inviteEmail, role, companyName] = inviteResult[0].values[0] as [string, string, string, string, string];

    // Verify the user's email matches the invitation
    const userEmail = req.user!.email;
    if (userEmail !== inviteEmail) {
      res.status(403).json({ error: 'This invitation is for a different email address' });
      return;
    }

    // Check if already a member
    const existingMember = await db.exec(
      'SELECT user_id FROM company_members WHERE user_id = ? AND company_id = ?',
      [userId, companyId]
    );
    if (existingMember.length > 0 && existingMember[0].values.length > 0) {
      // Mark invitation as accepted and return
      await db.run("UPDATE invitations SET accepted_at = datetime('now') WHERE id = ?", [inviteId]);
      saveDatabase();
      res.json({ success: true, company: { id: companyId, name: companyName, role } });
      return;
    }

    // Add user to company
    await db.run(
      'INSERT INTO company_members (user_id, company_id, role) VALUES (?, ?, ?)',
      [userId, companyId, role]
    );

    // Mark invitation as accepted
    await db.run("UPDATE invitations SET accepted_at = datetime('now') WHERE id = ?", [inviteId]);
    saveDatabase();

    console.log(`✅ Invitation accepted: user ${userId} → ${companyName} (${role})`);
    res.json({
      success: true,
      company: { id: companyId, name: companyName, slug: '', role },
    });
  } catch (error: any) {
    console.error('Accept invite error:', error);
    res.status(500).json({ error: error.message || 'Failed to accept invitation' });
  }
});

// DELETE /api/companies/:id/members/:userId — Remove a member (admin only)
router.delete('/:id/members/:memberId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, memberId } = req.params;
    const userId = req.user!.userId;
    const db = await getDatabase();

    // Verify user is admin
    const membership = await db.exec(
      'SELECT role FROM company_members WHERE user_id = ? AND company_id = ?',
      [userId, id]
    );
    if (membership.length === 0 || membership[0].values.length === 0 ||
        membership[0].values[0][0] !== 'admin') {
      res.status(403).json({ error: 'Only admins can remove members' });
      return;
    }

    // Can't remove yourself
    if (memberId === userId) {
      res.status(400).json({ error: 'Cannot remove yourself from the company' });
      return;
    }

    await db.run(
      'DELETE FROM company_members WHERE user_id = ? AND company_id = ?',
      [memberId, id]
    );
    saveDatabase();

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/companies/:id/logo — Upload company logo (admin only)
router.post('/:id/logo', upload.single('logo'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const db = await getDatabase();

    // Verify admin
    const membership = await db.exec(
      'SELECT role FROM company_members WHERE user_id = ? AND company_id = ?',
      [userId, id]
    );
    if (membership.length === 0 || membership[0].values.length === 0 ||
        membership[0].values[0][0] !== 'admin') {
      res.status(403).json({ error: 'Only admins can upload logos' }); return;
    }

    if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }

    const ext = path.extname(req.file.originalname).toLowerCase() || '.png';
    const filename = `logo${ext}`;
    const companyDir = path.join(COMPANIES_DIR, String(id));
    if (!fs.existsSync(companyDir)) fs.mkdirSync(companyDir, { recursive: true });

    // Delete old logo if exists
    const oldResult = await db.exec('SELECT logo_filename FROM companies WHERE id = ?', [id]);
    if (oldResult.length > 0 && oldResult[0].values[0][0]) {
      const oldPath = path.join(companyDir, oldResult[0].values[0][0] as string);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    fs.writeFileSync(path.join(companyDir, filename), req.file.buffer);
    await db.run('UPDATE companies SET logo_filename = ? WHERE id = ?', [filename, id]);
    saveDatabase();

    console.log(`🖼️ Logo uploaded for company ${id}: ${filename}`);
    res.json({ success: true, logoFilename: filename });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/companies/:id/logo — Serve company logo
router.get('/:id/logo', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const db = await getDatabase();
    const result = await db.exec('SELECT logo_filename FROM companies WHERE id = ?', [id]);
    if (result.length === 0 || !result[0].values[0][0]) {
      res.status(404).json({ error: 'No logo found' }); return;
    }
    const filename = result[0].values[0][0] as string;
    const logoPath = path.join(COMPANIES_DIR, String(id), filename);
    if (!fs.existsSync(logoPath)) { res.status(404).json({ error: 'Logo file missing' }); return; }
    res.sendFile(logoPath);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/companies/:id/logo-shape — Update logo display shape
router.put('/:id/logo-shape', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { shape } = req.body;
    const userId = req.user!.userId;
    const db = await getDatabase();

    const membership = await db.exec(
      'SELECT role FROM company_members WHERE user_id = ? AND company_id = ?',
      [userId, id]
    );
    if (membership.length === 0 || membership[0].values.length === 0 ||
        membership[0].values[0][0] !== 'admin') {
      res.status(403).json({ error: 'Only admins can change logo settings' }); return;
    }

    if (!['landscape', 'square', 'portrait'].includes(shape)) {
      res.status(400).json({ error: 'Shape must be landscape, square, or portrait' }); return;
    }

    await db.run('UPDATE companies SET logo_shape = ? WHERE id = ?', [shape, id]);
    saveDatabase();
    res.json({ success: true, shape });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
