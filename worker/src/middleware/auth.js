import { verify } from 'hono/jwt';

export async function requireAuth(c, next) {
  const header = c.req.header('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return c.json({ error: 'Not authenticated' }, 401);
  try {
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256');
    c.set('user', payload);
    await next();
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
}

export async function requireAdmin(c, next) {
  const user = c.get('user');
  if (user?.role !== 'admin') {
    return c.json({ error: 'Admin access required' }, 403);
  }
  await next();
}
