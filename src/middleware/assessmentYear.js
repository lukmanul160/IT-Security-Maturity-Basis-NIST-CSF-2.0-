const service = require('../services/assessmentPeriodService');
const permissions = require('../services/permissionService');
const fail = (message,status=400) => Object.assign(new Error(message),{status});
function describe(path, method) {
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  let framework, kind, code, id, category, reset = false, evidenceOnly = false, importing = false, permission;
  if (parts[0] === 'assessment') {
    framework='csf';kind='assessment';reset=parts[1]==='reset';permission='assessment';
    if(parts.length>(reset?2:1)||(parts[1]&&!reset))return null;
  } else if(parts[0]==='privacy'&&parts[1]==='assessment') {
    framework='privacy';kind='assessment';reset=parts[2]==='reset';permission='privacy-assessment';
    if(parts.length>(reset?3:2)||(parts[2]&&!reset))return null;
  } else if(['csf','privacy'].includes(parts[0])) {
    framework=parts[0];kind='controls';code=parts[1];permission=framework;if(parts.length>2)return null;
  } else if(parts[0]==='frameworks'&&['csf','privacy','iso27001','iso27001-soa'].includes(parts[1])) {
    framework=parts[1];kind=parts[2];
    if(kind==='assessment'&&framework==='iso27001'&&parts[3]==='reset'&&parts.length===4){kind='iso-reset';reset=true;}
    else if(kind==='controls'){code=parts[3];evidenceOnly=parts[4]==='evidence';if(parts.length>5||(parts[4]&&!evidenceOnly))return null;}
    else if(kind==='targets'){category=parts[3];if(parts.length>4)return null;}
    else if(kind==='objectives'&&framework==='iso27001'){id=parts[3];if(parts.length>4)return null;}
    else return null;
    permission=['iso27001','iso27001-soa'].includes(framework)?framework:kind==='targets'?service.permissions[framework][0]:'framework';
  } else if(parts[0]==='assessment-gaps'&&['csf','privacy','iso27001','iso27001-soa'].includes(parts[1])) {
    framework=parts[1];kind='gaps';importing=parts[2]==='import';code=importing?undefined:parts[2];id=parts[3];
    if(parts.length>4||(importing&&id))return null;
    permission=framework==='csf'?'assessment':framework==='privacy'?'privacy-assessment':framework;
  } else return null;
  let allowed;
  if(reset)allowed=['POST'];
  else if(kind==='assessment')allowed=['GET','PUT'];
  else if(kind==='targets')allowed=category?['PUT']:['GET'];
  else if(kind==='gaps')allowed=importing?['POST']:id?['PUT','DELETE']:code?['POST']:['GET'];
  else if(kind==='controls')allowed=evidenceOnly?['PUT']:code?['PUT','DELETE']:['GET','POST'];
  else if(kind==='objectives')allowed=id?['PUT','DELETE']:['GET','POST'];
  const action=reset||method==='DELETE'?'delete':method==='GET'?'read':kind==='gaps'?'update':method==='POST'?'create':'update';
  return {framework,owner:framework==='iso27001-soa'?'iso27001':framework,kind,code,id,category,reset,evidenceOnly,import:importing,permission,action,allowed};
}
async function assessmentYear(req,res,next) {
  if(req.query.assessmentYear===undefined)return next();
  const descriptor=describe(req.path,req.method);
  if(!descriptor)return next(fail('Endpoint ini tidak mendukung tahun assessment.',404));
  if(!descriptor.allowed.includes(req.method))return next(fail('Metode assessment tidak tersedia.',405));
  const year=service.validateYear(req.query.assessmentYear);
  if(!await permissions.has(req.user?.role,descriptor.permission,descriptor.action))return res.status(403).json({error:'Akses assessment tidak diizinkan.'});
  if(descriptor.kind==='iso-reset'&&!await permissions.has(req.user?.role,'iso27001-soa','delete'))return res.status(403).json({error:'Izin Delete SOA diperlukan untuk reset ISO 27001/SOA.'});
  if(descriptor.kind==='objectives'&&((req.query.year!==undefined&&Number(req.query.year)!==year)||(['POST','PUT'].includes(req.method)&&Number(req.body?.year)!==year)))return next(fail('Tahun sasaran harus sesuai tahun assessment.'));
  await service.ensureStore();
  const period=await service.period(descriptor.owner,year);
  if(period.legacy){
    if(descriptor.kind==='objectives'&&descriptor.id){
      const row=(await require('../config/database').pool.query('SELECT objective_year FROM information_security_objectives WHERE id=$1',[descriptor.id])).rows[0];
      if(!row||Number(row.objective_year)!==year)return next(fail('Sasaran tidak ditemukan pada tahun assessment ini.',404));
    }
    return next();
  }
  const result=await service.execute(descriptor.owner,year,descriptor,req.method,req.body,req.user,req.query);
  res.set('Cache-Control','no-store');
  if(result===null)return res.status(204).end();
  return res.status(req.method==='POST'&&!descriptor.import?201:200).json(result);
}
module.exports={assessmentYear,describe};
