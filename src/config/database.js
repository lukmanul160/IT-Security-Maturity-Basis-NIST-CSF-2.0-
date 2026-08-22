const { Pool } = require('pg');
const { database } = require('./env');

const poolConfig = database.url
  ? { connectionString: database.url }
  : {
      host: database.host,
      port: database.port,
      database: database.name,
      user: database.user,
      password: database.password,
    };

if (database.ssl) poolConfig.ssl = { rejectUnauthorized: false };

const pool = new Pool({ ...poolConfig, max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });
pool.on('error', error => console.error('Unexpected PostgreSQL pool error:', error.message));

async function checkDatabaseConnection() {
  const result = await pool.query('SELECT NOW() AS connected_at');
  return { connected: true, connectedAt: result.rows[0].connected_at };
}

module.exports = { pool, checkDatabaseConnection };