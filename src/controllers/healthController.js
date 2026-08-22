const { checkDatabaseConnection } = require('../config/database');
const { nodeEnv } = require('../config/env');

async function database(req, res) {
  try {
    const result = await checkDatabaseConnection();
    res.status(200).json({ status: 'ok', database: 'postgresql', ...result });
  } catch (error) {
    res.status(503).json({ status: 'error', database: 'postgresql', connected: false, message: nodeEnv === 'production' ? 'Database connection failed' : error.message });
  }
}

module.exports = { database };