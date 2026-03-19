import express from 'express';
import db from '../db/init.js';
import { authMiddleware, ownerOnly } from '../middleware/auth.js';
import { addEvent } from '../utils/events.js';

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  const rows = db.prepare(`
    SELECT
      c.*,
      COALESCE(c.discount_percent, 0) AS discount_percent,
      COALESCE((SELECT SUM(remaining_minutes) FROM client_packages cp WHERE cp.client_id = c.id), 0) AS package_minutes_left
    FROM clients c
    ORDER BY c.name
  `).all();
  res.json(rows);
});

router.post('/', authMiddleware, ownerOnly, (req, res) => {
  const { name, nickname, phone, total_minutes, total_paid, discount_percent } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Укажите ФИО клиента' });
  const result = db.prepare(`
    INSERT INTO clients (name, nickname, phone, total_minutes, total_paid, discount_percent)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    name.trim(),
    nickname?.trim() || null,
    phone?.trim() || null,
    Number(total_minutes) || 0,
    Number(total_paid) || 0,
    Math.min(100, Math.max(0, Number(discount_percent) || 0))
  );
  res.status(201).json({
    id: result.lastInsertRowid,
    name: name.trim(),
    nickname: nickname?.trim() || null,
    phone: phone?.trim() || null,
    total_minutes: Number(total_minutes) || 0,
    total_paid: Number(total_paid) || 0,
    discount_percent: Math.min(100, Math.max(0, Number(discount_percent) || 0)),
  });
});

router.put('/:id', authMiddleware, ownerOnly, (req, res) => {
  const { name, nickname, phone, total_minutes, total_paid, discount_percent } = req.body;
  db.prepare(`
    UPDATE clients
    SET name = ?, nickname = ?, phone = ?, total_minutes = ?, total_paid = ?, discount_percent = ?
    WHERE id = ?
  `).run(
    name ?? '',
    nickname ?? null,
    phone ?? null,
    Number(total_minutes) ?? 0,
    Number(total_paid) ?? 0,
    Math.min(100, Math.max(0, Number(discount_percent) || 0)),
    req.params.id
  );
  res.json({ ok: true });
});

// Пополнение баланса клиента (владелец или администратор)
router.post('/:id/topup', authMiddleware, (req, res) => {
  const { amount, method, note } = req.body;
  const id = req.params.id;
  const a = Number(amount);
  if (!a || a <= 0) return res.status(400).json({ error: 'Укажите сумму пополнения' });
  const client = db.prepare('SELECT id, name, nickname, total_paid FROM clients WHERE id = ?').get(id);
  if (!client) return res.status(404).json({ error: 'Клиент не найден' });
  db.prepare('INSERT INTO topups (client_id, amount, method, note) VALUES (?, ?, ?, ?)')
    .run(id, a, method || null, note || null);
  db.prepare('UPDATE clients SET total_paid = total_paid + ? WHERE id = ?').run(a, id);
  const guestName = client.nickname || client.name || `id=${client.id}`;
  addEvent('process', `Пополнение баланса. Гость: ${guestName}. +${a} ₽.`);
  res.json({ ok: true });
});

// Списать пакет минут клиенту (покупка пакета) — владелец или администратор
router.post('/:id/buy-package', authMiddleware, (req, res) => {
  const clientId = req.params.id;
  const { package_id } = req.body;
  if (!package_id) return res.status(400).json({ error: 'Укажите package_id' });
  const pkg = db.prepare('SELECT id, name, minutes, price FROM packages WHERE id = ? AND active = 1').get(package_id);
  if (!pkg) return res.status(404).json({ error: 'Пакет не найден' });
  const client = db.prepare('SELECT id, name, nickname FROM clients WHERE id = ?').get(clientId);
  if (!client) return res.status(404).json({ error: 'Клиент не найден' });

  // Записываем покупку пакета и считаем деньги как выручку за сегодня
  db.prepare('INSERT INTO client_packages (client_id, package_id, remaining_minutes) VALUES (?, ?, ?)')
    .run(clientId, pkg.id, pkg.minutes);
  const today = new Date().toISOString().slice(0, 10);
  db.prepare('INSERT INTO revenue (date, amount, description, zone) VALUES (?, ?, ?, ?)')
    .run(today, Number(pkg.price) || 0, `Покупка пакета: ${pkg.name}`, 'Пакеты');

  const guestName = client.nickname || client.name || `id=${client.id}`;
  addEvent('process', `Покупка пакета. Гость: ${guestName}. Пакет: ${pkg.name} (${pkg.minutes} мин).`);
  res.json({ ok: true });
});

// Чёрный список: бан / разбан (владелец или администратор)
router.post('/:id/blacklist', authMiddleware, (req, res) => {
  const id = req.params.id;
  const { blacklisted, reason } = req.body;
  const client = db.prepare('SELECT id, name, nickname FROM clients WHERE id = ?').get(id);
  if (!client) return res.status(404).json({ error: 'Клиент не найден' });

  const ban = blacklisted ? 1 : 0;
  const ts = ban ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null;
  db.prepare('UPDATE clients SET blacklisted = ?, blacklist_reason = ?, blacklisted_at = ? WHERE id = ?')
    .run(ban, ban ? (reason || null) : null, ts, id);

  const guestName = client.nickname || client.name || `id=${client.id}`;
  addEvent(
    'process',
    ban
      ? `Гость добавлен в чёрный список: ${guestName}.${reason ? ` Причина: ${reason}` : ''}`
      : `Гость удалён из чёрного списка: ${guestName}.`,
  );
  res.json({ ok: true });
});

router.delete('/:id', authMiddleware, ownerOnly, (req, res) => {
  db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
