/** Shared fixed-window limits; endpoint namespaces are stable across replicas. */
const { state } = require('../services/authStateService');
function createLoginRateLimit({limit=30,windowMs=15*60*1000,namespace='login-ip',key}={}) {
 return async(req,res,next)=>{
  const peer=key?key(req):req.ip||req.socket?.remoteAddress||'unknown';
  const record=await state.consume(namespace,peer,limit,windowMs);
  if(!record.allowed){res.set('Retry-After',String(record.retryAfter));return res.status(429).json({error:'Terlalu banyak percobaan login. Coba lagi nanti.'});}
  return next();
 };
}
module.exports={createLoginRateLimit};
