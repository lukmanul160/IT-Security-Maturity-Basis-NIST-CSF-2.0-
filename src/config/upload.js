/**
 * Konfigurasi aplikasi: upload.
 * Pisahkan konfigurasi instalasi dari data bisnis. Jangan log kredensial atau menjadikan .env sebagai fixture pengujian.
 * Peta fungsi dan dependency: docs/source-catalog.json.
 */
const MAX_FILE_SIZE_MB = 100;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

module.exports = { MAX_FILE_SIZE_MB, MAX_FILE_SIZE_BYTES };
