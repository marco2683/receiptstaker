import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, saveDatabase } from '../database/schema';
import { generateToken, authMiddleware } from '../middleware/auth';

const router = Router();

// POST /api/auth/signup
router.post('/signup', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      res.status(400).json({ error: 'Email, password, and name are required' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    const db = await getDatabase();

    // Check if email already exists
    const existing = await db.exec('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (existing.length > 0 && existing[0].values.length > 0) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const id = uuidv4().substring(0, 12);
    const passwordHash = await bcrypt.hash(password, 12);

    await db.run(
      'INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)',
      [id, email.toLowerCase().trim(), passwordHash, name.trim()]
    );
    saveDatabase();

    // Check for any pending invitations for this email
    const invites = await db.exec(
      'SELECT id, company_id, role, token FROM invitations WHERE email = ? AND accepted_at IS NULL',
      [email.toLowerCase().trim()]
    );

    const token = generateToken({ id, email: email.toLowerCase().trim() });

    console.log(`✅ New user registered: ${email} (${id})`);
    res.json({
      success: true,
      token,
      user: { id, email: email.toLowerCase().trim(), name: name.trim() },
      pendingInvites: invites.length > 0 ? invites[0].values.map((row: any[]) => ({
        id: row[0], companyId: row[1], role: row[2], token: row[3]
      })) : [],
    });
  } catch (error: any) {
    console.error('Signup error:', error);
    res.status(500).json({ error: error.message || 'Failed to register' });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const db = await getDatabase();
    const results = await db.exec(
      'SELECT id, email, password_hash, name FROM users WHERE email = ?',
      [email.toLowerCase().trim()]
    );

    if (results.length === 0 || results[0].values.length === 0) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const [id, userEmail, passwordHash, name] = results[0].values[0] as [string, string, string, string];
    const passwordValid = await bcrypt.compare(password, passwordHash);

    if (!passwordValid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Get user's companies
    const companies = await db.exec(
      `SELECT c.id, c.name, c.slug, cm.role, c.logo_filename, c.logo_shape
       FROM company_members cm
       JOIN companies c ON c.id = cm.company_id
       WHERE cm.user_id = ?`,
      [id]
    );

    const companyList = companies.length > 0
      ? companies[0].values.map((row: any[]) => ({
          id: row[0], name: row[1], slug: row[2], role: row[3], logoFilename: row[4] || null, logoShape: row[5] || 'square'
        }))
      : [];

    const token = generateToken({ id, email: userEmail });

    console.log(`✅ User logged in: ${userEmail}`);
    res.json({
      success: true,
      token,
      user: { id, email: userEmail, name },
      companies: companyList,
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message || 'Failed to login' });
  }
});

// GET /api/auth/me — Get current user info + companies
router.get('/me', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDatabase();
    const userId = req.user!.userId;

    const userResult = await db.exec(
      'SELECT id, email, name FROM users WHERE id = ?', [userId]
    );
    if (userResult.length === 0 || userResult[0].values.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const [id, email, name] = userResult[0].values[0] as [string, string, string];

    // Get companies
    const companies = await db.exec(
      `SELECT c.id, c.name, c.slug, cm.role, c.logo_filename, c.logo_shape
       FROM company_members cm
       JOIN companies c ON c.id = cm.company_id
       WHERE cm.user_id = ?`,
      [userId]
    );

    const companyList = companies.length > 0
      ? companies[0].values.map((row: any[]) => ({
          id: row[0], name: row[1], slug: row[2], role: row[3], logoFilename: row[4] || null, logoShape: row[5] || 'square'
        }))
      : [];

    res.json({
      user: { id, email, name },
      companies: companyList,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
