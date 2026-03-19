import express from 'express';
import db from '../db/init.js';
import { authMiddleware, ownerOnly } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  const { from, to } = req.query;
  let sql = 'SELECT * FROM shifts WHERE 1=1';
  const params = [];
  if (from) { sql += ' AND date >= ?'; params.push(from); }
  if (to) { sql += ' AND date <= ?'; params.push(to); }
  sql += ' ORDER BY date DESC, start_time DESC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

// Создать смену — владелец или администратор
router.post('/', authMiddleware, (req, res) => {
  const { worker_name, date, start_time, end_time, position } = req.body;
  if (!worker_name || !date || !start_time || !end_time) {
    return res.status(400).json({ error: 'Заполните обязательные поля' });
  }
  const result = db.prepare(`
    INSERT INTO shifts (worker_name, date, start_time, end_time, position)
    VALUES (?, ?, ?, ?, ?)
  `).run(worker_name, date, start_time, end_time, position || null);
  res.status(201).json({
    id: result.lastInsertRowid,
    worker_name,
    date,
    start_time,
    end_time,
    position,
  });
});

// Редактировать смену — владелец или администратор
router.put('/:id', authMiddleware, (req, res) => {
  const { worker_name, date, start_time, end_time, position } = req.body;
  db.prepare(`
    UPDATE shifts
    SET worker_name = ?, date = ?, start_time = ?, end_time = ?, position = ?
    WHERE id = ?
  `).run(
    worker_name ?? '',
    date ?? '',
    start_time ?? '',
    end_time ?? '',
    position ?? null,
    req.params.id
  );
  res.json({ ok: true });
});

// Удалить смену — только владелец
router.delete('/:id', authMiddleware, ownerOnly, (req, res) => {
  db.prepare('DELETE FROM shifts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
