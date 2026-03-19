import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db/init.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'cyberclub-secret-key-2024';

router.post('/login', (req, res) => {
  const { login, password } = req.body;
  if (!login || !password) {
    return res.status(400).json({ error: 'Введите логин и пароль' });
  }
  const user = db.prepare('SELECT * FROM users WHERE login = ?').get(login);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }
  const token = jwt.sign(
    { id: user.id, login: user.login, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.json({
    token,
    user: {
      id: user.id,
      login: user.login,
      role: user.role,
      name: user.name,
    },
  });
});

export default router;
