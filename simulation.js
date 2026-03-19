/**
 * Фоновая симуляция: раз в 1–2 минуты кто-то занимает свободный ПК или освобождает занятый.
 * Новые посетители получают случайные ФИО, ник, телефон и внесённую сумму 100–1000 ₽.
 */

const FIRST_NAMES = [
  'Александр', 'Дмитрий', 'Максим', 'Иван', 'Артём', 'Никита', 'Михаил', 'Даниил',
  'Егор', 'Андрей', 'Кирилл', 'Илья', 'Алексей', 'Роман', 'Сергей', 'Владимир',
  'Анастасия', 'Мария', 'Дарья', 'Анна', 'Екатерина', 'Полина', 'Виктория', 'Александра',
  'Елена', 'Ольга', 'Наталья', 'Татьяна', 'Ирина', 'Юлия',
];

const LAST_NAMES = [
  'Иванов', 'Петров', 'Сидоров', 'Козлов', 'Смирнов', 'Кузнецов', 'Попов', 'Васильев',
  'Морозов', 'Новиков', 'Фёдоров', 'Волков', 'Алексеев', 'Лебедев', 'Семёнов', 'Егоров',
  'Павлов', 'Козлов', 'Степанов', 'Николаев', 'Орлов', 'Андреев', 'Макаров', 'Михайлов',
];

const NICK_PREFIXES = ['player', 'gamer', 'pro', 'dark', 'shadow', 'storm', 'cyber', 'neo', 'x', 'max'];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[randomInt(0, arr.length - 1)];
}

function randomPhone() {
  const d = () => randomInt(0, 9);
  return `+7 (9${d()}${d()}) ${d()}${d()}${d()}-${d()}${d()}-${d()}${d()}`;
}

function randomClient(db) {
  const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
  const nickname = `${pick(NICK_PREFIXES)}_${randomInt(100, 9999)}`;
  const phone = randomPhone();
  const total_paid = randomInt(100, 1000);
  const result = db.prepare(`
    INSERT INTO clients (name, nickname, phone, total_minutes, total_paid, total_charged, discount_percent)
    VALUES (?, ?, ?, 0, ?, 0, 0)
  `).run(name, nickname, phone, total_paid);
  return result.lastInsertRowid;
}

function maybeTopUpClient(db) {
  // Иногда клиент с нулевым/отрицательным балансом пополняет счёт,
  // чтобы симуляция не "умирала" из-за нехватки средств.
  const SHOULD_TOPUP_PROB = 0.35; // шанс на пополнение за тик
  if (Math.random() >= SHOULD_TOPUP_PROB) return;

  const candidates = db.prepare(`
    SELECT
      c.id,
      COALESCE(c.nickname, c.name) AS client_name,
      (c.total_paid - COALESCE(c.total_charged, 0)) AS balance
    FROM clients c
    WHERE (c.total_paid - COALESCE(c.total_charged, 0)) <= 0
      AND c.id NOT IN (
        SELECT current_client_id
        FROM computers
        WHERE status = 'busy' AND current_client_id IS NOT NULL
      )
    LIMIT 1
  `).get();

  if (!candidates) return;

  const topupAmount = randomInt(100, 1000);
  db.prepare('INSERT INTO topups (client_id, amount, method, note) VALUES (?, ?, ?, ?)')
    .run(candidates.id, topupAmount, 'simulation', 'Пополнение в симуляции');
  db.prepare('UPDATE clients SET total_paid = total_paid + ? WHERE id = ?')
    .run(topupAmount, candidates.id);

  db.prepare('INSERT INTO events (type, text) VALUES (?, ?)').run(
    'process',
    `Симуляция: клиент "${candidates.client_name}" пополнил баланс на ${topupAmount} ₽.`
  );
}

function runCharges(db) {
  const today = new Date().toISOString().slice(0, 10);
  const busy = db.prepare(`
    SELECT c.id, c.number, c.zone, c.price_per_minute, c.current_client_id
    FROM computers c
    WHERE c.status = 'busy' AND c.current_client_id IS NOT NULL
  `).all();
  const priceDefault = 5;
  for (const pc of busy) {
    const price = Number(pc.price_per_minute) || priceDefault;
    const client = db.prepare('SELECT total_paid, total_charged, discount_percent FROM clients WHERE id = ?').get(pc.current_client_id);
    if (!client) continue;
    const balance = client.total_paid - (client.total_charged || 0);
    // 2 минуты за тик: сначала списываем минуты из пакетов, остаток — с баланса (с учётом скидки)
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

    if (remainingToCover <= 0) {
      db.prepare('INSERT INTO events (type, text) VALUES (?, ?)').run(
        'process',
        `Симуляция: пакет минут использован на ПК-${pc.number} (${minutesTick} мин).`,
      );
      continue;
    }

    // теперь списание денег
    if (balance <= 0) {
      db.prepare('UPDATE computers SET status = ?, current_client_id = ? WHERE id = ?')
        .run('free', null, pc.id);
      db.prepare('INSERT INTO events (type, text) VALUES (?, ?)').run(
        'process',
        `Симуляция: ПК-${pc.number} освобождён (баланс 0).`,
      );
      console.log(`[Симуляция] ПК №${pc.number} освобождён (баланс 0)`);
      continue;
    }

    const discount = Math.min(100, Math.max(0, Number(client.discount_percent) || 0));
    const base = price * remainingToCover;
    const discounted = base * (100 - discount) / 100;
    const charge = Math.min(discounted, balance);
    const zone = pc.zone || 'Зона';
    db.prepare('UPDATE clients SET total_charged = total_charged + ?, total_minutes = total_minutes + ? WHERE id = ?')
      .run(charge, pc.current_client_id, remainingToCover);
    db.prepare('INSERT INTO revenue (date, amount, description, zone) VALUES (?, ?, ?, ?)')
      .run(today, charge, `Списание с клиента за ПК №${pc.number}`, zone);
    db.prepare('INSERT INTO events (type, text) VALUES (?, ?)').run(
      'process',
      `Симуляция: списание ${charge} ₽ за ПК-${pc.number}.`,
    );
  }
}

function runTick(db) {
  const free = db.prepare('SELECT id, number FROM computers WHERE status = ?').all('free');
  const busy = db.prepare('SELECT id, number, current_client_id FROM computers WHERE status = ?').all('busy');
  const allClients = db.prepare('SELECT id FROM clients').all();
  const busyClientIds = busy.map((b) => b.current_client_id).filter(Boolean);
  const availableClients = allClients.filter((c) => !busyClientIds.includes(c.id));

  runCharges(db);
  maybeTopUpClient(db);

  const action = Math.random() < 0.5 ? 'seat' : 'free';

  if (action === 'seat' && free.length > 0) {
    const computer = pick(free);
    const useExisting = availableClients.length > 0 && Math.random() < 0.5;
    let clientId;
    if (useExisting) {
      clientId = pick(availableClients).id;
    } else {
      clientId = randomClient(db);
    }
    db.prepare('UPDATE computers SET status = ?, current_client_id = ? WHERE id = ?')
      .run('busy', clientId, computer.id);
    db.prepare('INSERT INTO events (type, text) VALUES (?, ?)').run(
      'process',
      `Симуляция: ПК-${computer.number} занят, клиент id=${clientId}.`,
    );
    console.log(`[Симуляция] ПК №${computer.number} занят, клиент id=${clientId}`);
  } else if (action === 'free' && busy.length > 0) {
    const computer = pick(busy);
    db.prepare('UPDATE computers SET status = ?, current_client_id = ? WHERE id = ?')
      .run('free', null, computer.id);
    db.prepare('INSERT INTO events (type, text) VALUES (?, ?)').run(
      'process',
      `Симуляция: ПК-${computer.number} освобождён.`,
    );
    console.log(`[Симуляция] ПК №${computer.number} освобождён`);
  }
}

function scheduleNext(db) {
  const ms = randomInt(60, 120) * 1000;
  setTimeout(() => {
    try {
      runTick(db);
    } catch (e) {
      console.error('[Симуляция] Ошибка:', e.message);
      try {
        db.prepare('INSERT INTO events (type, text) VALUES (?, ?)').run(
          'error',
          `Симуляция: ошибка ${e.message}`,
        );
      } catch {
        // ignore
      }
    }
    scheduleNext(db);
  }, ms);
}

export function startSimulation(db) {
  console.log('[Симуляция] Запуск фоновой симуляции посетителей (интервал 1–2 мин).');
  scheduleNext(db);
}
