import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'club.db');
const db = new Database(dbPath);

// Таблица пользователей (владелец и администраторы)
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    login TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('owner', 'admin')),
    name TEXT
  );
`);

// Таблица выручки (доход по дням/сменам; zone — зона для списаний с посетителей)
db.exec(`
  CREATE TABLE IF NOT EXISTS revenue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT,
    zone TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);
try { db.exec('ALTER TABLE revenue ADD COLUMN zone TEXT'); } catch (_) {}

// Таблица смен работников
db.exec(`
  CREATE TABLE IF NOT EXISTS shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    worker_name TEXT NOT NULL,
    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    position TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Компьютеры: зона, цена за минуту, кто сейчас за ним
db.exec(`
  CREATE TABLE IF NOT EXISTS computers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number INTEGER NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'free' CHECK(status IN ('free', 'busy', 'repair', 'disabled')),
    specs TEXT,
    zone TEXT,
    price_per_minute REAL DEFAULT 5,
    current_client_id INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);
try { db.exec('ALTER TABLE computers ADD COLUMN current_client_id INTEGER'); } catch (_) {}
try { db.exec('ALTER TABLE computers ADD COLUMN zone TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE computers ADD COLUMN price_per_minute REAL'); } catch (_) {}

// Миграция статусов ПК: maintenance -> repair, добавляем disabled
const computersTableSql = db.prepare(`
  SELECT sql
  FROM sqlite_master
  WHERE type = 'table' AND name = 'computers'
`).get()?.sql || '';

if (computersTableSql.includes("'maintenance'") && !computersTableSql.includes("'repair'")) {
  try {
    db.exec('BEGIN');
    db.exec('ALTER TABLE computers RENAME TO computers_old');
    db.exec(`
      CREATE TABLE computers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        number INTEGER NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'free' CHECK(status IN ('free', 'busy', 'repair', 'disabled')),
        specs TEXT,
        zone TEXT,
        price_per_minute REAL DEFAULT 5,
        current_client_id INTEGER,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
    db.exec(`
      INSERT INTO computers (id, number, status, specs, zone, price_per_minute, current_client_id, created_at)
      SELECT
        id,
        number,
        CASE
          WHEN status = 'maintenance' THEN 'repair'
          WHEN status = 'offline' THEN 'disabled'
          ELSE status
        END AS status,
        specs,
        zone,
        price_per_minute,
        current_client_id,
        created_at
      FROM computers_old
    `);
    db.exec('DROP TABLE computers_old');
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw e;
  }
}

// Работники (должность, телефон и т.д.)
db.exec(`
  CREATE TABLE IF NOT EXISTS workers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    position TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Клиенты: внесённая сумма (total_paid), списано за время (total_charged); баланс = total_paid - total_charged
db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    nickname TEXT,
    phone TEXT,
    total_minutes INTEGER NOT NULL DEFAULT 0,
    total_paid REAL NOT NULL DEFAULT 0,
    total_charged REAL NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);
try { db.exec('ALTER TABLE clients ADD COLUMN total_charged REAL'); } catch (_) {}
try { db.exec('ALTER TABLE clients ADD COLUMN discount_percent INTEGER'); } catch (_) {}
try { db.exec('ALTER TABLE clients ADD COLUMN blacklisted INTEGER'); } catch (_) {}
try { db.exec('ALTER TABLE clients ADD COLUMN blacklist_reason TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE clients ADD COLUMN blacklisted_at TEXT'); } catch (_) {}
db.prepare('UPDATE clients SET discount_percent = COALESCE(discount_percent, 0)').run();
db.prepare('UPDATE clients SET blacklisted = COALESCE(blacklisted, 0)').run();

// Скидки (справочник)
db.exec(`
  CREATE TABLE IF NOT EXISTS discounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    percent INTEGER NOT NULL CHECK(percent >= 0 AND percent <= 100),
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Пакеты (предоплаченные минуты)
db.exec(`
  CREATE TABLE IF NOT EXISTS packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    minutes INTEGER NOT NULL CHECK(minutes > 0),
    price REAL NOT NULL CHECK(price >= 0),
    description TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Купленные пакеты клиента (остаток минут)
db.exec(`
  CREATE TABLE IF NOT EXISTS client_packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    package_id INTEGER NOT NULL,
    remaining_minutes INTEGER NOT NULL,
    purchased_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (package_id) REFERENCES packages(id)
  );
`);

// Пополнения баланса клиента
db.exec(`
  CREATE TABLE IF NOT EXISTS topups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    amount REAL NOT NULL CHECK(amount > 0),
    method TEXT,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id)
  );
`);

// События / логи (для Dashboard и раздела "Логи и контроль")
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    text TEXT NOT NULL,
    meta TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Бронирования: ПК, гость, дата, время начала/конца
db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    computer_id INTEGER NOT NULL,
    client_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (computer_id) REFERENCES computers(id),
    FOREIGN KEY (client_id) REFERENCES clients(id)
  );
`);

// Создаём тестовых пользователей, если их ещё нет
const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get();
if (userCount.c === 0) {
  const ownerHash = bcrypt.hashSync('owner123', 10);
  const adminHash = bcrypt.hashSync('admin123', 10);
  db.prepare(`
    INSERT INTO users (login, password_hash, role, name)
    VALUES ('owner', ?, 'owner', 'Владелец'),
           ('admin', ?, 'admin', 'Администратор')
  `).run(ownerHash, adminHash);

  // Тестовые данные выручки за последние дни
  const today = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const date = d.toISOString().slice(0, 10);
    const amount = Math.round(5000 + Math.random() * 15000);
    db.prepare('INSERT INTO revenue (date, amount, description) VALUES (?, ?, ?)')
      .run(date, amount, `Доход за ${date}`);
  }
}

// 10 компьютеров в клубе (если ещё нет): зона + цена за минуту
const computerCount = db.prepare('SELECT COUNT(*) as c FROM computers').get();
if (computerCount.c === 0) {
  for (let n = 1; n <= 10; n++) {
    const zone = n <= 5 ? 'Игровая' : 'Стандарт';
    const price = n <= 5 ? 8 : 5;
    db.prepare('INSERT INTO computers (number, status, specs, zone, price_per_minute) VALUES (?, ?, ?, ?, ?)')
      .run(n, 'free', n <= 5 ? 'Игровой ПК' : 'Стандартный ПК', zone, price);
  }
}
// Проставить зону и цену существующим ПК, у которых их ещё нет
db.prepare(`UPDATE computers SET zone = COALESCE(zone, CASE WHEN number <= 5 THEN 'Игровая' ELSE 'Стандарт' END), price_per_minute = COALESCE(price_per_minute, 5)`).run();

export default db;
