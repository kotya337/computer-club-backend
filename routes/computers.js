import express from 'express';
import db from '../db/init.js';
import { authMiddleware } from '../middleware/auth.js';
import { addEvent } from '../utils/events.js';

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.number, c.status, c.specs, c.zone, c.price_per_minute, c.current_client_id,
           cl.name AS client_name, cl.nickname AS client_nickname,
           cl.phone AS client_phone,
           (cl.total_paid - COALESCE(cl.total_charged, 0)) AS client_balance
    FROM computers c
    LEFT JOIN clients cl ON c.current_client_id = cl.id
    ORDER BY c.number
  `).all();
  res.json(rows);
});

router.post('/', authMiddleware, (req, res) => {
  const { number, status, specs, zone, price_per_minute } = req.body;
  if (number == null) return res.status(400).json({ error: 'Укажите номер ПК' });
  try {
    const result = db.prepare(
      'INSERT INTO computers (number, status, specs, zone, price_per_minute) VALUES (?, ?, ?, ?, ?)'
    ).run(Number(number), status || 'free', specs || null, zone || null, Number(price_per_minute) || 5);
    const pc = {
      id: result.lastInsertRowid,
      number: Number(number),
      status: status || 'free',
      specs: specs || null,
      zone: zone || null,
      price_per_minute: Number(price_per_minute) || 5,
    };
    addEvent('equipment', `Добавлен новый ПК-${pc.number} (зона: ${pc.zone || '—'})`);
    res.status(201).json(pc);
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE')
      return res.status(400).json({ error: 'Компьютер с таким номером уже есть' });
    throw e;
  }
});

router.put('/:id', authMiddleware, (req, res) => {
  const { number, status, specs, zone, price_per_minute } = req.body;
  const id = req.params.id;
  const row = db.prepare('SELECT number, status, specs, zone, price_per_minute FROM computers WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Не найден' });
  const num = number != null ? Number(number) : row.number;
  const st = status ?? row.status;
  const sp = specs !== undefined ? specs : row.specs;
  const z = zone !== undefined ? zone : row.zone;
  const pr = price_per_minute !== undefined ? Number(price_per_minute) : row.price_per_minute;
  db.prepare(
    'UPDATE computers SET number = ?, status = ?, specs = ?, zone = ?, price_per_minute = ?, current_client_id = CASE WHEN ? = \'free\' THEN NULL ELSE current_client_id END WHERE id = ?'
  ).run(num, st, sp, z, pr, st, id);
  addEvent('equipment', `Обновлены настройки ПК-${num} (статус: ${st})`);
  res.json({ ok: true });
});

router.delete('/:id', authMiddleware, (req, res) => {
  const pc = db.prepare('SELECT number FROM computers WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM computers WHERE id = ?').run(req.params.id);
  if (pc) addEvent('equipment', `Удалён ПК-${pc.number}`);
  res.json({ ok: true });
});

// Начать сессию: посадить гостя на ПК
router.post('/:id/start-session', authMiddleware, (req, res) => {
  const id = req.params.id;
  const { client_id } = req.body;
  if (!client_id) return res.status(400).json({ error: 'Укажите гостя (client_id)' });
  const pc = db.prepare('SELECT id, number, status FROM computers WHERE id = ?').get(id);
  if (!pc) return res.status(404).json({ error: 'ПК не найден' });
  if (pc.status !== 'free') return res.status(400).json({ error: 'ПК занят или отключён' });
  const client = db.prepare('SELECT id, name, nickname FROM clients WHERE id = ?').get(client_id);
  if (!client) return res.status(404).json({ error: 'Гость не найден' });
  const balance = db.prepare('SELECT (total_paid - COALESCE(total_charged, 0)) AS b FROM clients WHERE id = ?').get(client_id);
  if (balance.b <= 0) return res.status(400).json({ error: 'У гостя нулевой баланс' });
  db.prepare('UPDATE computers SET status = ?, current_client_id = ? WHERE id = ?').run('busy', client_id, id);
  const guestName = client.nickname || client.name || `id=${client.id}`;
  addEvent('process', `Открыта сессия на ПК-${pc.number}. Гость: ${guestName}.`);
  res.json({ ok: true });
});

// Завершить сессию: списать время, освободить ПК
router.post('/:id/end-session', authMiddleware, (req, res) => {
  const id = req.params.id;
  const pc = db.prepare('SELECT id, number, zone, price_per_minute, current_client_id FROM computers WHERE id = ?').get(id);
  if (!pc) return res.status(404).json({ error: 'ПК не найден' });
  if (pc.status !== 'busy' || !pc.current_client_id) {
    db.prepare('UPDATE computers SET status = ?, current_client_id = ? WHERE id = ?').run('free', null, id);
    addEvent('process', `Сессия на ПК-${pc.number} завершена.`);
    return res.json({ ok: true });
  }
  const price = Number(pc.price_per_minute) || 5;
  const client = db.prepare('SELECT total_paid, total_charged, discount_percent FROM clients WHERE id = ?').get(pc.current_client_id);
  if (!client) {
    db.prepare('UPDATE computers SET status = ?, current_client_id = ? WHERE id = ?').run('free', null, id);
    return res.json({ ok: true });
  }
  // 2 минуты: сначала пакет минут, потом баланс со скидкой
  const minutesTick = 2;
  let remainingToCover = minutesTick;
  const pkg = db.prepare(`
    SELECT id, remaining_minutes
    FROM client_packages
    WHERE client_id = ? AND remaining_minutes > 0
    ORDER BY id
    LIMIT 1
  `).get(pc.current_client_id);
  if (pkg) {
    const take = Math.min(remainingToCover, Number(pkg.remaining_minutes) || 0);
    if (take > 0) {
      db.prepare('UPDATE client_packages SET remaining_minutes = remaining_minutes - ? WHERE id = ?').run(take, pkg.id);
      db.prepare('UPDATE clients SET total_minutes = total_minutes + ? WHERE id = ?').run(take, pc.current_client_id);
      remainingToCover -= take;
    }
  }

  const balance = client.total_paid - (client.total_charged || 0);
  const discount = Math.min(100, Math.max(0, Number(client.discount_percent) || 0));
  const base = price * remainingToCover;
  const discounted = base * (100 - discount) / 100;
  const charge = remainingToCover <= 0 || balance <= 0 ? 0 : Math.min(discounted, balance);
  const zone = pc.zone || 'Зона';
  const today = new Date().toISOString().slice(0, 10);
  if (charge > 0) {
    db.prepare('UPDATE clients SET total_charged = total_charged + ?, total_minutes = total_minutes + ? WHERE id = ?')
      .run(charge, remainingToCover, pc.current_client_id);
    db.prepare('INSERT INTO revenue (date, amount, description, zone) VALUES (?, ?, ?, ?)')
      .run(today, charge, `Списание за ПК №${pc.number}`, zone);
  }
  db.prepare('UPDATE computers SET status = ?, current_client_id = ? WHERE id = ?').run('free', null, id);
  addEvent('process', `Сессия на ПК-${pc.number} завершена. Списано ${charge} ₽.`);
  res.json({ ok: true });
});

export default router;
