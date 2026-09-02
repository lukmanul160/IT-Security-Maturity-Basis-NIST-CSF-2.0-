const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');

const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/;
const validRoles = ['admin', 'approver', 'editor', 'viewer', 'user'];

function validatePassword(password) {
  if (typeof password !== 'string' || !passwordPattern.test(password)) throw Object.assign(new Error('Password harus 8-72 karakter dan mengandung huruf besar, huruf kecil, serta angka'), { status: 400 });
}

function publicUser(row) {
  return { id: row.id, username: row.username, fullName: row.full_name || '', role: row.role, createdAt: row.created_at, updatedAt: row.updated_at };
}

async function getByUsername(username) {
  const result = await pool.query('SELECT id, username, full_name, password_hash, role, created_at, updated_at FROM app_users WHERE username = $1', [username]);
  return result.rows[0] || null;
}

async function getProfile(username) {
  const user = await getByUsername(username);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
  return publicUser(user);
}

async function listUsers() {
  const result = await pool.query('SELECT id, username, full_name, role, created_at, updated_at FROM app_users ORDER BY username');
  return result.rows.map(publicUser);
}

async function updateProfile(username, data) {
  const user = await getByUsername(username);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
  const fullName = typeof data.fullName === 'string' ? data.fullName.trim() : user.full_name || '';
  if (fullName.length > 120) throw Object.assign(new Error('Nama maksimal 120 karakter'), { status: 400 });
  let passwordHash = user.password_hash;
  if (data.newPassword !== undefined || data.confirmPassword !== undefined || data.currentPassword !== undefined) {
    if (typeof data.currentPassword !== 'string' || !(await bcrypt.compare(data.currentPassword, user.password_hash))) throw Object.assign(new Error('Password saat ini salah'), { status: 400 });
    if (data.newPassword !== data.confirmPassword) throw Object.assign(new Error('Konfirmasi password tidak cocok'), { status: 400 });
    validatePassword(data.newPassword);
    passwordHash = await bcrypt.hash(data.newPassword, 12);
  }
  const result = await pool.query('UPDATE app_users SET full_name = $1, password_hash = $2, updated_at = NOW() WHERE id = $3 RETURNING id, username, full_name, role, created_at, updated_at', [fullName, passwordHash, user.id]);
  return publicUser(result.rows[0]);
}

async function updatePassword(username, data) {
  const user = await getByUsername(username);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
  if (typeof data.currentPassword !== 'string' || !(await bcrypt.compare(data.currentPassword, user.password_hash))) throw Object.assign(new Error('Password saat ini salah'), { status: 400 });
  if (data.newPassword !== data.confirmPassword) throw Object.assign(new Error('Konfirmasi password tidak cocok'), { status: 400 });
  validatePassword(data.newPassword);
  const passwordHash = await bcrypt.hash(data.newPassword, 12);
  await pool.query('UPDATE app_users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, user.id]);
  return getProfile(username);
}

async function createUser(data) {
  if (typeof data.username !== 'string' || !/^[a-zA-Z0-9._-]{3,50}$/.test(data.username.trim())) throw Object.assign(new Error('Username harus 3-50 karakter alfanumerik'), { status: 400 });
  validatePassword(data.password);
  if (!validRoles.includes(data.role || 'user')) throw Object.assign(new Error('Role tidak valid'), { status: 400 });
  const passwordHash = await bcrypt.hash(data.password, 12);
  try {
    const result = await pool.query('INSERT INTO app_users (username, full_name, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, full_name, role, created_at, updated_at', [data.username.trim(), typeof data.fullName === 'string' ? data.fullName.trim() : '', passwordHash, data.role || 'user']);
    return publicUser(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') throw Object.assign(new Error('Username sudah digunakan'), { status: 409 });
    throw error;
  }
}

async function updateUser(id, data) {
  const existing = await pool.query('SELECT id, username, full_name, role FROM app_users WHERE id = $1', [id]);
  if (!existing.rowCount) throw Object.assign(new Error('User not found'), { status: 404 });
  const fields = [];
  const values = [];
  if (data.fullName !== undefined) { if (typeof data.fullName !== 'string' || data.fullName.trim().length > 120) throw Object.assign(new Error('Nama maksimal 120 karakter'), { status: 400 }); fields.push('full_name'); values.push(data.fullName.trim()); }
  if (data.role !== undefined) { if (!validRoles.includes(data.role)) throw Object.assign(new Error('Role tidak valid'), { status: 400 }); fields.push('role'); values.push(data.role); }
  if (data.password !== undefined) { validatePassword(data.password); fields.push('password_hash'); values.push(await bcrypt.hash(data.password, 12)); }
  if (!fields.length) throw Object.assign(new Error('Tidak ada data untuk diubah'), { status: 400 });
  fields.push('updated_at'); values.push(new Date()); values.push(id);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
  const result = await pool.query(`UPDATE app_users SET ${assignments} WHERE id = $${values.length} RETURNING id, username, full_name, role, created_at, updated_at`, values);
  return publicUser(result.rows[0]);
}

async function deleteUser(id, currentUsername) {
  const existing = await pool.query('SELECT username FROM app_users WHERE id = $1', [id]);
  if (!existing.rowCount) throw Object.assign(new Error('User not found'), { status: 404 });
  if (existing.rows[0].username === currentUsername) throw Object.assign(new Error('Akun yang sedang digunakan tidak dapat dihapus'), { status: 400 });
  await pool.query('DELETE FROM app_users WHERE id = $1', [id]);
}

module.exports = { getByUsername, getProfile, listUsers, updateProfile, updatePassword, createUser, updateUser, deleteUser };
