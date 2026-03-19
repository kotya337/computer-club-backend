-- ============================================================
-- База club.db — схема (структура таблиц)
-- Подключение: backend/db/init.js (библиотека better-sqlite3)
-- Файл базы: backend/db/club.db (создаётся автоматически)
-- ============================================================

-- Подключение в коде (init.js):
--   const dbPath = path.join(__dirname, 'club.db');
--   const db = new Database(dbPath);
--   export default db;

-- ------------------------------------------------------------
-- Пользователи (вход в админку)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner', 'admin')),
  name TEXT
);

-- ------------------------------------------------------------
-- Выручка (доходы по дням, списания с гостей)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS revenue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  amount REAL NOT NULL,
  description TEXT,
  zone TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- Смены работников
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  worker_name TEXT NOT NULL,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  position TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- Компьютеры (ПК в клубе)
-- current_client_id — кто сейчас сидит за ПК (сессия)
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- Работники (справочник: имя, должность, телефон)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  position TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- Клиенты (гости клуба)
-- Баланс = total_paid - total_charged
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- События / логи (Dashboard, раздел «Логи и контроль»)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  text TEXT NOT NULL,
  meta TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- Бронирования (ПК + гость + дата и время)
-- ------------------------------------------------------------
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
