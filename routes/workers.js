import express from 'express';
import db from '../db/init.js';
import { authMiddleware, ownerOnly } from '../middleware/auth.js';

const router = express.Router();

// Просматривать список работников может любой авторизованный пользователь
router.get('/', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM workers ORDER BY name').all();
  res.json(rows);
});

// Добавлять работников может только владелец
router.post('/', authMiddleware, ownerOnly, (req, res) => {
  const { name, position, phone, email, notes } = req.body;
  if (!name || !position) return res.status(400).json({ error: 'Укажите имя и должность' });
  const result = db.prepare(`
    INSERT INTO workers (name, position, phone, email, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    name,
    position,
    phone || null,
    email || null,
    notes || null
  );
  res.status(201).json({
    id: result.lastInsertRowid,
    name,
    position,
    phone: phone || null,
    email: email || null,
    notes: notes || null,
  });
});

// Редактировать работников может только владелец
router.put('/:id', authMiddleware, ownerOnly, (req, res) => {
  const { name, position, phone, email, notes } = req.body;
  db.prepare(`
    UPDATE workers
    SET name = ?, position = ?, phone = ?, email = ?, notes = ?
    WHERE id = ?
  `).run(
    name ?? '',
    position ?? '',
    phone ?? null,
    email ?? null,
    notes ?? null,
    req.params.id
  );
  res.json({ ok: true });
});

// Удалять работников может только владелец
router.delete('/:id', authMiddleware, ownerOnly, (req, res) => {
  db.prepare('DELETE FROM workers WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
