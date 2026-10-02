require('dotenv').config();
const readline = require('node:readline');
const { createUser } = require('../src/services/accountService');
const { pool } = require('../src/config/database');

function ask(question) {
  const input = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => input.question(question, answer => { input.close(); resolve(answer); }));
}
function password(question) {
  return new Promise((resolve, reject) => {
    let value = '';
    const wasRaw = process.stdin.isRaw;
    process.stdout.write(question);
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true); process.stdin.resume();
    const finish = () => { process.stdin.removeListener('keypress', onKey); process.stdin.setRawMode(Boolean(wasRaw)); process.stdin.pause(); process.stdout.write('\n'); };
    const onKey = (text, key = {}) => {
      if (key.ctrl && key.name === 'c') { finish(); reject(new Error('Pembuatan admin dibatalkan.')); return; }
      if (key.name === 'return' || key.name === 'enter') { finish(); resolve(value); return; }
      if (key.name === 'backspace') { if (value.length) { value = value.slice(0, -1); process.stdout.write('\b \b'); } return; }
      if (key.ctrl || key.meta || !text || /[\x00-\x1f\x7f]/.test(text)) return;
      value += text; process.stdout.write('*'.repeat(text.length));
    };
    process.stdin.on('keypress', onKey);
  });
}
async function provisionAdmin(account, create = createUser) {
  if (account.password !== account.confirmPassword) throw new Error('Konfirmasi password tidak cocok.');
  return create({ username: account.username.trim(), fullName: account.fullName.trim(), password: account.password, role: 'admin' });
}
async function main() {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) throw new Error('Jalankan setup admin dari terminal interaktif Linux/Windows setelah npm run db:setup.');
  console.log('Membuat administrator baru. Username harus belum terdaftar.');
  const username = (await ask('Username [nistadmin]: ')).trim() || 'nistadmin';
  const fullName = await ask('Nama lengkap (opsional): ');
  console.log('Password: 8–72 karakter, berisi huruf besar, huruf kecil, dan angka.');
  const secret = await password('Password: ');
  const confirmPassword = await password('Ulangi password: ');
  const user = await provisionAdmin({ username, fullName, password: secret, confirmPassword });
  console.log(`Administrator ${user.username} berhasil dibuat. Login menggunakan password yang baru dipilih.`);
}
module.exports = { provisionAdmin };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());
