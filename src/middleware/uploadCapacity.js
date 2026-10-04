// Reserve capacity before multipart parsing; keep it until processing completes.
function createUploadCapacity({ maxActive = 4, maxPerUser = 2 } = {}) {
  let active = 0;
  const users = new Map();
  return (req, res, next) => {
    if (!req.is('multipart/form-data')) return next();
    const user = req.user.username;
    if (active >= maxActive || (users.get(user) || 0) >= maxPerUser) {
      res.set('Retry-After', '5');
      return res.status(429).json({ error: 'Upload lain sedang diproses. Coba lagi sebentar.' });
    }
    active++;
    users.set(user, (users.get(user) || 0) + 1);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      active--;
      const count = users.get(user) - 1;
      if (count) users.set(user, count); else users.delete(user);
    };
    res.once('finish', release);
    res.once('close', release);
    next();
  };
}
module.exports = { createUploadCapacity };
