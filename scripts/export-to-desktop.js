/**
 * Экспорт club.db в CSV на рабочий стол для импорта в Access.
 * Запуск: node scripts/export-to-desktop.js
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'db', 'club.db');

// Папка на рабочем столе (рядом с проектом кп3)
const desktopFolder = path.join(__dirname, '..', '..', '..', 'club_export_Access');
if (!fs.existsSync(desktopFolder)) {
  fs.mkdirSync(desktopFolder, { recursive: true });
}

const db = new Database(dbPath, { readonly: true });

const tables = ['users', 'revenue', 'shifts', 'computers', 'workers', 'clients', 'events', 'bookings'];

function escapeCsv(val) {
  if (val == null) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

for (const table of tables) {
  try {
    const rows = db.prepare(`SELECT * FROM ${table}`).all();
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    const header = columns.join(',');
    const lines = [header];
    for (const row of rows) {
      lines.push(columns.map((c) => escapeCsv(row[c])).join(','));
    }
    const csvPath = path.join(desktopFolder, `${table}.csv`);
    fs.writeFileSync(csvPath, lines.join('\n'), 'utf8');
    console.log(`OK: ${table}.csv (${rows.length} записей)`);
  } catch (e) {
    console.log(`Пропуск ${table}:`, e.message);
  }
}

// Копируем схему (SQL) в ту же папку
const schemaSrc = path.join(__dirname, '..', 'db', 'SCHEMA.sql');
const schemaDst = path.join(desktopFolder, 'SCHEMA_club.sql');
if (fs.existsSync(schemaSrc)) {
  fs.copyFileSync(schemaSrc, schemaDst);
  console.log('OK: SCHEMA_club.sql скопирован');
}

db.close();
console.log('\nГотово. Папка:', desktopFolder);
console.log('В Access: Файл → Внешние данные → Импорт текстового файла → выберите нужный .csv');
