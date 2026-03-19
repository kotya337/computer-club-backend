import db from '../db/init.js';

// type: 'process' | 'booking' | 'equipment' | 'error' | 'technical'
export function addEvent(type, text, meta = null) {
  try {
    db.prepare('INSERT INTO events (type, text, meta) VALUES (?, ?, ?)').run(
      type,
      text,
      meta ? JSON.stringify(meta) : null,
    );
  } catch (e) {
    // Логи не должны ломать основной поток
    console.error('[events] Ошибка записи события:', e.message);
  }
}

