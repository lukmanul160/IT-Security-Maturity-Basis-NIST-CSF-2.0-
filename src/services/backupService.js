const fs = require('fs').promises;
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { database } = require('../config/env');
const { backupRoot } = require('../config/paths');
const { pool } = require('../config/database');
const { beginDatabaseRestore, endDatabaseRestore } = require('../config/auth');

const execFileAsync = promisify(execFile);
const backupNamePattern = /^nist-basis-\d{8}T\d{6}Z\.(dump|json)$/;
const restoreNamePattern = /^nist-basis-\d{8}T\d{6}Z\.(dump|json)$/;

async function ensureBackupRoot() {
  await fs.mkdir(backupRoot, { recursive: true });
}

async function resolvePgTool(name) {
  const configured = process.env[name === 'pg_dump' ? 'PG_DUMP_PATH' : 'PG_RESTORE_PATH'];
  if (configured) return configured;
  if (process.platform === 'win32') {
    const root = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PostgreSQL');
    const versions = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    versions.sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
    for (const version of versions.filter(entry => entry.isDirectory())) {
      const executable = path.join(root, version.name, 'bin', `${name}.exe`);
      try { await fs.access(executable); return executable; } catch {}
    }
  }
  return name;
}

function pgDumpArguments(outputPath) {
  if (database.url) return ['--dbname', database.url, '--format=custom', '--file', outputPath];
  return ['--host', database.host, '--port', String(database.port), '--username', database.user, '--dbname', database.name, '--format=custom', '--file', outputPath];
}

async function createBackup() {
  await ensureBackupRoot();
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const fileName = `nist-basis-${timestamp}.dump`;
  const filePath = path.join(backupRoot, fileName);
  const environment = { ...process.env };
  if (!database.url && database.password) environment.PGPASSWORD = database.password;
  try {
    await execFileAsync(await resolvePgTool('pg_dump'), pgDumpArguments(filePath), { env: environment, windowsHide: true, maxBuffer: 1024 * 1024 });
    const stats = await fs.stat(filePath);
    return { fileName, format: 'PostgreSQL custom dump', scope: 'Seluruh schema, tabel, data, sequence, view, fungsi, index, dan constraint database aplikasi', size: stats.size, createdAt: stats.mtime.toISOString() };
  } catch (error) {
    await fs.rm(filePath, { force: true });
    if (error.code === 'ENOENT') {
      const unavailable = new Error('Backup lengkap memerlukan pg_dump. Install PostgreSQL client tools atau atur PG_DUMP_PATH; snapshot JSON tidak dibuat karena tidak mencakup struktur database.');
      unavailable.status = 503;
      throw unavailable;
    }
    const failure = new Error(error.stderr?.trim() || 'Database backup failed');
    failure.status = 500;
    throw failure;
  }
}

function pgRestoreArguments(filePath) {
  if (database.url) return ['--dbname', database.url, '--clean', '--if-exists', '--single-transaction', filePath];
  return ['--host', database.host, '--port', String(database.port), '--username', database.user, '--dbname', database.name, '--clean', '--if-exists', '--single-transaction', filePath];
}

async function restoreJsonSnapshot(filePath) {
  const snapshot = JSON.parse(await fs.readFile(filePath, 'utf8'));
  if (!snapshot || snapshot.format !== 'PostgreSQL data snapshot' || !snapshot.tables || typeof snapshot.tables !== 'object') {
    const error = new Error('Invalid database snapshot');
    error.status = 400;
    throw error;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL session_replication_role = replica');
    const tableNames = Object.keys(snapshot.tables).filter(name => /^[A-Za-z0-9_]+$/.test(name));
    if (tableNames.length) await client.query(`TRUNCATE TABLE ${tableNames.map(name => `"${name}"`).join(', ')} RESTART IDENTITY CASCADE`);
    for (const tableName of tableNames) {
      const rows = Array.isArray(snapshot.tables[tableName]) ? snapshot.tables[tableName] : [];
      for (const row of rows) {
        const columns = Object.keys(row).filter(column => /^[A-Za-z0-9_]+$/.test(column));
        if (!columns.length) continue;
        const values = columns.map(column => row[column]);
        const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
        await client.query(`INSERT INTO "${tableName}" (${columns.map(column => `"${column}"`).join(', ')}) VALUES (${placeholders})`, values);
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function restoreBackup(file) {
  if (!file?.path || !restoreNamePattern.test(file.originalname)) {
    const error = new Error('Only valid NIST Basis .dump or .json backups can be restored');
    error.status = 400;
    throw error;
  }
  const environment = { ...process.env };
  if (!database.url && database.password) environment.PGPASSWORD = database.password;
  let restoreStarted = false;
  try {
    beginDatabaseRestore();
    restoreStarted = true;
    if (path.extname(file.originalname).toLowerCase() === '.json') {
      await restoreJsonSnapshot(file.path);
    } else {
      await execFileAsync(await resolvePgTool('pg_restore'), pgRestoreArguments(file.path), { env: environment, windowsHide: true, maxBuffer: 1024 * 1024 });
    }
    return { restored: true, fileName: file.originalname };
  } catch (error) {
    if (error.code === 'ENOENT') {
      const unavailable = new Error('pg_restore is not installed or is not available in PATH');
      unavailable.status = 503;
      throw unavailable;
    }
    const failure = new Error(error.stderr?.trim() || error.message || 'Database restore failed');
    failure.status = error.status || 500;
    throw failure;
  } finally {
    if (restoreStarted) endDatabaseRestore();
    await fs.rm(file.path, { force: true });
  }
}

async function listBackups() {
  await ensureBackupRoot();
  const entries = await fs.readdir(backupRoot, { withFileTypes: true });
  const files = await Promise.all(entries.filter(entry => entry.isFile() && backupNamePattern.test(entry.name)).map(async entry => {
    const stats = await fs.stat(path.join(backupRoot, entry.name));
    return { fileName: entry.name, size: stats.size, createdAt: stats.mtime.toISOString() };
  }));
  return files.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

async function readBackup(fileName) {
  if (!backupNamePattern.test(fileName)) {
    const error = new Error('Invalid backup filename');
    error.status = 400;
    throw error;
  }
  return path.join(backupRoot, fileName);
}

async function deleteBackup(fileName) {
  const filePath = await readBackup(fileName);
  await fs.rm(filePath, { force: true });
}

module.exports = { ensureBackupRoot, createBackup, listBackups, readBackup, deleteBackup, restoreBackup };
