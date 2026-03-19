/**
 * Просмотр содержимого базы club.db
 * Запуск: node scripts/view-db.js
 */
import db from '../db/init.js';

const tables = ['users', 'revenue', 'shifts', 'computers', 'workers', 'clients', 'bookings', 'events'];

console.log('=== Содержимое club.db ===\n');

for (const table of tables) {
  try {
    const rows = db.prepare(`SELECT * FROM ${table}`).all();
    console.log(`--- ${table} (${rows.length} записей) ---`);
    if (rows.length > 0) {
      console.table(rows);
    } else {
      console.log('  (пусто)\n');
    }
  } catch (e) {
    console.log(`--- ${table} ---`);
    console.log('  (таблица не найдена или ошибка:', e.message, ')\n');
  }
}

db.close();
console.log('Готово.');
