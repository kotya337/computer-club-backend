import express from 'express';
import db from '../db/init.js';
import { authMiddleware, ownerOnly } from '../middleware/auth.js';
import { addEvent } from '../utils/events.js';

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM packages ORDER BY active DESC, price ASC, minutes ASC, name').all();
  res.json(rows);
});

router.post('/', authMiddleware, ownerOnly, (req, res) => {
  const { name, minutes, price, description, active } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Укажите название пакета' });
  const m = Math.max(1, Number(minutes) || 0);
  const pr = Math.max(0, Number(price) || 0);
  const act = active === 0 ? 0 : 1;
  const result = db.prepare(`
    INSERT INTO packages (name, minutes, price, description, active)
    VALUES (?, ?, ?, ?, ?)
  `).run(String(name).trim(), m, pr, description || null, act);
  addEvent('technical', `Добавлен пакет: ${String(name).trim()} (${m} мин за ${pr} ₽).`);
  res.status(201).json({ id: result.lastInsertRowid, name: String(name).trim(), minutes: m, price: pr, description: description || null, active: act });
});

router.put('/:id', authMiddleware, ownerOnly, (req, res) => {
  const { name, minutes, price, description, active } = req.body;
  const m = Math.max(1, Number(minutes) || 0);
  const pr = Math.max(0, Number(price) || 0);
  const act = active === 0 ? 0 : 1;
  db.prepare(`
    UPDATE packages
    SET name = ?, minutes = ?, price = ?, description = ?, active = ?
    WHERE id = ?
  `).run(String(name ?? '').trim(), m, pr, description || null, act, req.params.id);
  addEvent('technical', `Обновлён пакет #${req.params.id} (${m} мин за ${pr} ₽).`);
  res.json({ ok: true });
});

router.delete('/:id', authMiddleware, ownerOnly, (req, res) => {
  db.prepare('DELETE FROM packages WHERE id = ?').run(req.params.id);
  addEvent('technical', `Удалён пакет #${req.params.id}.`);
  res.json({ ok: true });
});

export default router;

