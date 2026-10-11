const crypto = require('node:crypto');
const { Pool } = require('pg');
const { pool } = require('../config/database');
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
  return value;
}
// Use a separate small pool so holding a lock never starves business transactions.
let lockPool;
function defaultDatabase() {
  if (!lockPool) {
    lockPool=new Pool({...pool.options,password:pool.options.password,max:4});
    lockPool.on('error',error=>console.error('[mutation-guard] Lock connection closed:',error.message));
  }
  return lockPool;
}
function createMutationGuard({ db }={}) {
  const pending=new Set();let active=0;
  return async (req,res,next)=> {
    if (!['POST','PUT','PATCH','DELETE'].includes(req.method)) return next();
    const database=db || defaultDatabase();
    // Updates/deletes lock the resource, including requests with different payloads.
    // Multipart creates lock the endpoint until all upload and database work finishes.
    const body=req.method==='POST' && req.is('application/json') ? JSON.stringify(stable(req.body || {})) : '';
    const identity=`${req.method==='POST'?req.user.username:'shared-resource'}:${req.method==='POST'?'POST':'WRITE'}:${req.originalUrl.split('?')[0]}:${body}`;
    const busy=()=>res.status(409).set('Retry-After','1').json({error:'Operasi pada data ini masih diproses. Tunggu hingga selesai sebelum mencoba kembali.',code:'MUTATION_PENDING'});
    if (pending.has(identity)) return busy();
    if (active>=4) return res.status(429).set('Retry-After','1').json({error:'Beberapa operasi masih diproses. Coba lagi setelah selesai.',code:'MUTATION_CAPACITY'});
    pending.add(identity);active++;
    let cleaned=false;
    const cleanup=()=>{if(cleaned)return;cleaned=true;pending.delete(identity);active--;};
    const digest=crypto.createHash('sha256').update(identity).digest();
    const keys=[digest.readInt32BE(0),digest.readInt32BE(4)];
    let client;
    try {
      client=await database.connect();
      const result=await client.query('SELECT pg_try_advisory_lock($1::int,$2::int) AS acquired',keys);
      if (!result.rows[0].acquired) {
        client.release();client=null;
        cleanup();return busy();
      }
      let released=false;
      const release=()=> {
        if (released) return;released=true;
        client.query('SELECT pg_advisory_unlock($1::int,$2::int)',keys).then(()=>client.release(),()=>client.release(true)).finally(cleanup);
      };
      const originalEnd=res.end;
      res.end=function(...args) { try {return originalEnd.apply(this,args);} finally {release();} };
      res.once('finish',release);
      // A disconnected browser does not mean the mutation has stopped. Keep the
      // lock until the handler ends its response or the database session closes.
      return next();
    } catch(error) {client?.release(true);cleanup();return next(error);}
  };
}
module.exports={createMutationGuard};
