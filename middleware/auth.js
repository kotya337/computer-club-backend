import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'cyberclub-secret-key-2024';

export function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Недействительный токен' });
  }
}

// Только владелец
export function ownerOnly(req, res, next) {
  if (req.user?.role !== 'owner') {
    return res.status(403).json({ error: 'Доступ только для владельца' });
  }
  next();
}
