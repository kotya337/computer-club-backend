import express from 'express';
import db from '../db/init.js';
import { authMiddleware, ownerOnly } from '../middleware/auth.js';
import { addEvent } from '../utils/events.js';

const router = express.Router();

// Все авторизованные видят список выручки
router.get('/', authMiddleware, (req, res) => {
  const { from, to } = req.query;
  let sql = 'SELECT * FROM revenue WHERE 1=1';
  const params = [];
  if (from) { sql += ' AND date >= ?'; params.push(from); }
  if (to) { sql += ' AND date <= ?'; params.push(to); }
  sql += ' ORDER BY date DESC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

// Сводка для графика (агрегат по дням) — только владелец
router.get('/summary', authMiddleware, ownerOnly, (req, res) => {
  const { from, to } = req.query;
  let sql = `
    SELECT date, SUM(amount) as total
    FROM revenue
    WHERE 1=1
  `;
  const params = [];
  if (from) { sql += ' AND date >= ?'; params.push(from); }
  if (to) { sql += ' AND date <= ?'; params.push(to); }
  sql += ' GROUP BY date ORDER BY date';
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

// Добавить запись о выручке — только владелец
router.post('/', authMiddleware, ownerOnly, (req, res) => {
  const { date, amount, description, zone } = req.body;
  if (!date || amount == null) {
    return res.status(400).json({ error: 'Укажите дату и сумму' });
  }
  const result = db.prepare(
    'INSERT INTO revenue (date, amount, description, zone) VALUES (?, ?, ?, ?)'
  ).run(date, Number(amount), description || '', zone || null);
  addEvent('process', `Ручная запись выручки: ${Number(amount)} ₽ за ${date}${zone ? `, зона: ${zone}` : ''}.`);
  res.status(201).json({ id: result.lastInsertRowid, date, amount, description, zone });
});

// Статистика: общий доход и по зонам (последние 24ч или период)
router.get('/stats', authMiddleware, ownerOnly, (req, res) => {
  const { hours = 24 } = req.query;
  const h = Math.min(Number(hours) || 24, 24 * 31);
  const since = new Date(Date.now() - h * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const rows = db.prepare(`
    SELECT zone, SUM(amount) AS total
    FROM revenue
    WHERE datetime(created_at) >= ?
    GROUP BY zone
    ORDER BY total DESC
  `).all(since);
  const total = rows.reduce((s, r) => s + r.total, 0);
  res.json({ total, byZone: rows });
});

// Доход по часам (для графика динамики)
router.get('/by-hour', authMiddleware, ownerOnly, (req, res) => {
  const { hours = 24 } = req.query;
  const h = Math.min(Number(hours) || 24, 24 * 7);
  const since = new Date(Date.now() - h * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const rows = db.prepare(`
    SELECT strftime('%Y-%m-%d %H:00', created_at) AS hour, SUM(amount) AS total
    FROM revenue
    WHERE datetime(created_at) >= ?
    GROUP BY hour
    ORDER BY hour
  `).all(since);
  res.json(rows);
});

// Удалить запись — только владелец
router.delete('/:id', authMiddleware, ownerOnly, (req, res) => {
  db.prepare('DELETE FROM revenue WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
