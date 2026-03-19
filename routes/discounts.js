import express from 'express';
import db from '../db/init.js';
import { authMiddleware, ownerOnly } from '../middleware/auth.js';
import { addEvent } from '../utils/events.js';

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM discounts ORDER BY percent DESC, name').all();
  res.json(rows);
});

router.post('/', authMiddleware, ownerOnly, (req, res) => {
  const { name, percent } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Укажите название скидки' });
  const p = Math.min(100, Math.max(0, Number(percent) || 0));
  const result = db.prepare('INSERT INTO discounts (name, percent) VALUES (?, ?)').run(String(name).trim(), p);
  addEvent('technical', `Добавлена скидка: ${String(name).trim()} (${p}%).`);
  res.status(201).json({ id: result.lastInsertRowid, name: String(name).trim(), percent: p });
});

router.put('/:id', authMiddleware, ownerOnly, (req, res) => {
  const { name, percent } = req.body;
  const p = Math.min(100, Math.max(0, Number(percent) || 0));
  db.prepare('UPDATE discounts SET name = ?, percent = ? WHERE id = ?')
    .run(String(name ?? '').trim(), p, req.params.id);
  addEvent('technical', `Обновлена скидка #${req.params.id} (${p}%).`);
  res.json({ ok: true });
});

router.delete('/:id', authMiddleware, ownerOnly, (req, res) => {
  db.prepare('DELETE FROM discounts WHERE id = ?').run(req.params.id);
  addEvent('technical', `Удалена скидка #${req.params.id}.`);
  res.json({ ok: true });
});

export default router;

