import express from 'express';
import db from '../db/init.js';
import { authMiddleware } from '../middleware/auth.js';
import { addEvent } from '../utils/events.js';

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  const { date } = req.query;
  let rows;
  if (date) {
    rows = db.prepare(`
      SELECT b.id, b.computer_id, b.client_id, b.date, b.start_time, b.end_time,
             c.number AS computer_number,
             cl.name AS client_name, cl.nickname AS client_nickname
      FROM bookings b
      JOIN computers c ON c.id = b.computer_id
      JOIN clients cl ON cl.id = b.client_id
      WHERE b.date = ?
      ORDER BY b.date, b.start_time
    `).all(date);
  } else {
    rows = db.prepare(`
      SELECT b.id, b.computer_id, b.client_id, b.date, b.start_time, b.end_time,
             c.number AS computer_number,
             cl.name AS client_name, cl.nickname AS client_nickname
      FROM bookings b
      JOIN computers c ON c.id = b.computer_id
      JOIN clients cl ON cl.id = b.client_id
      ORDER BY b.date DESC, b.start_time DESC
      LIMIT 200
    `).all();
  }
  res.json(rows);
});

router.post('/', authMiddleware, (req, res) => {
  const { computer_id, client_id, date, start_time, end_time } = req.body;
  if (!computer_id || !client_id || !date || !start_time || !end_time) {
    return res.status(400).json({ error: 'Укажите ПК, гостя, дату, время начала и конца' });
  }
  const computer = db.prepare('SELECT id, number, status FROM computers WHERE id = ?').get(computer_id);
  if (!computer) return res.status(404).json({ error: 'ПК не найден' });
  if (computer.status === 'repair' || computer.status === 'disabled' || computer.status === 'offline') {
    return res.status(400).json({ error: 'Нельзя создать бронь: ПК недоступен (ремонт/отключен)' });
  }
  const client = db.prepare('SELECT id, name, nickname FROM clients WHERE id = ?').get(client_id);
  if (!client) return res.status(404).json({ error: 'Гость не найден' });
  const result = db.prepare(`
    INSERT INTO bookings (computer_id, client_id, date, start_time, end_time)
    VALUES (?, ?, ?, ?, ?)
  `).run(computer_id, client_id, date, start_time, end_time);
  const booking = {
    id: result.lastInsertRowid,
    computer_id,
    client_id,
    date,
    start_time,
    end_time,
  };
  const guestName = client.nickname || client.name || `id=${client.id}`;
  addEvent('booking', `Создана бронь. ПК-${computer.number}, ${date} ${start_time}–${end_time}, гость: ${guestName}.`);
  res.status(201).json(booking);
});

router.delete('/:id', authMiddleware, (req, res) => {
  const row = db.prepare(`
    SELECT b.id, b.date, b.start_time, b.end_time,
           c.number AS computer_number,
           cl.name AS client_name, cl.nickname AS client_nickname
    FROM bookings b
    JOIN computers c ON c.id = b.computer_id
    JOIN clients cl ON cl.id = b.client_id
    WHERE b.id = ?
  `).get(req.params.id);
  const result = db.prepare('DELETE FROM bookings WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Бронь не найдена' });
  if (row) {
    const guestName = row.client_nickname || row.client_name || '';
    addEvent('booking', `Отменена бронь. ПК-${row.computer_number}, ${row.date} ${row.start_time}–${row.end_time}${guestName ? `, гость: ${guestName}` : ''}.`);
  }
  res.json({ ok: true });
});

export default router;
