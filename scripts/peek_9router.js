const Database = require('better-sqlite3');
const db = new Database('/home/node/.9router/db/data.sqlite', { readonly: true });
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('TABLES:', tables.map(t => t.name).join(', '));
for (const t of tables) {
  if (/key|api|auth|user/i.test(t.name)) {
    try {
      const rows = db.prepare(`SELECT * FROM ${t.name} LIMIT 10`).all();
      console.log(`--- ${t.name} (${rows.length} rows) ---`);
      for (const r of rows) console.log(JSON.stringify(r).substring(0, 300));
    } catch (e) { console.log(t.name, 'ERR', e.message); }
  }
}
