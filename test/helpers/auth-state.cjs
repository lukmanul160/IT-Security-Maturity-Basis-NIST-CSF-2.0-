/** Explicit in-memory test double. Production has no memory fallback. */
const { state } = require('../../src/services/authStateService');
const crypto = require('node:crypto');
const sessions = new Map(), attempts = new Map();
let restoring = false;
Object.assign(state, {
  restoring: async () => restoring,
  create(user) {
    if (restoring) throw Object.assign(new Error('Restore'), { status: 503 });
    this.removeUser(user.username);
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { username: user.username, role: user.role, createdAt: Date.now() });
    return token;
  },
  get(token) {
    const session = sessions.get(token);
    return !restoring && session && Date.now() - session.createdAt < 8*60*60*1000 ? session : null;
  },
  remove: token => sessions.delete(token),
  removeUser(username) { for (const [token, session] of sessions) if (session.username === username) sessions.delete(token); },
  presence(token, module) { const session = this.get(token); if (session) session.officeModule = module; },
  office() { return new Map([...sessions].filter(([token]) => this.get(token)).map(([,s]) => [s.username,{module:s.officeModule,createdAt:s.createdAt}])); },
  consume(namespace, key, limit, windowMs) {
    const id=namespace+'|'+key,now=Date.now();
    let row=attempts.get(id);
    if(!row||row.expires<=now) { row={attempts:0,expires:now+windowMs};attempts.set(id,row); }
    return {allowed:++row.attempts<=limit,retryAfter:Math.ceil((row.expires-now)/1000)};
  },
  reset: (namespace,key) => attempts.delete(namespace+'|'+key),
});
// Restore behavior is tested with a PostgreSQL lock in sharedAuth.test.js.
const auth = require('../../src/config/auth');
auth.beginDatabaseRestore = () => { if(restoring)throw Object.assign(new Error('Restore'),{status:409});restoring=true;sessions.clear();require('../../src/services/redisCacheService').invalidateDashboard(); };
auth.endDatabaseRestore = () => {restoring=false;sessions.clear();require('../../src/services/redisCacheService').invalidateDashboard();};
module.exports={state};
