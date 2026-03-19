import express from 'express';
import db from '../db/init.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Статистика событий: количество стартов сессий за период (по умолчанию 24ч)
router.get('/stats/sessions', authMiddleware, (req, res) => {
  const { hours = 24 } = req.query;
  const h = Math.min(Number(hours) || 24, 24 * 31);
  const since = new Date(Date.now() - h * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const row = db.prepare(`
    SELECT COUNT(*) AS total
    FROM events
    WHERE datetime(created_at) >= ?
      AND type = 'process'
      AND (
        text LIKE 'Открыта сессия на ПК-%'
        OR text LIKE 'Симуляция: ПК-% занят%'
      )
  `).get(since);
  res.json({ total: Number(row?.total) || 0, hours: h });
});

// Список событий (последние N штук)
router.get('/', authMiddleware, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const rows = db.prepare(`
    SELECT id, type, text, meta, created_at
    FROM events
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT ?
  `).all(limit);
  res.json(rows);
});

export default router;

