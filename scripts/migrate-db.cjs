/** Explicit deployment command; status shows versions only, never credentials. */
require('dotenv').config();
const { pool } = require('../src/config/database');
const { migrate } = require('../src/services/migrationService');
(async () => {
  try {
    const rows = await migrate(pool, { statusOnly: process.argv.includes('--status') });
    for (const row of rows) console.log(`${row.applied ? 'applied' : 'pending'} ${row.id}`);
  } finally { await pool.end(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
