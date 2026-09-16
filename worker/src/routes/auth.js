import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import bcrypt from 'bcryptjs';
import { dbGet } from '../db/helpers.js';
import { requireAuth } from '../middleware/auth.js';

const auth = new Hono();

auth.post('/login', async (c) => {
  const { username, password } = await c.req.json().catch(() => ({}));
  if (!username || !password) {
    return c.json({ error: 'Username and password are required' }, 400);
  }

  const user = await dbGet(
    c.env.DB,
    `SELECT u.*, d.name AS department_name FROM users u
     LEFT JOIN departments d ON d.id = u.department_id
     WHERE u.username = ?`,
    username
  );
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return c.json({ error: 'Invalid username or password' }, 401);
  }

  const payload = {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    department_id: user.department_id,
    department_name: user.department_name,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
  };
  const token = await sign(payload, c.env.JWT_SECRET);
  return c.json({ token, user: payload });
});

auth.get('/me', requireAuth, (c) => c.json({ user: c.get('user') }));

export default auth;
