import * as THREE from 'three';
import { OrbitControls } from './OrbitControls.js';
import { installCameraNavigation } from './camera-navigation.js';
import { applyStandingPose, applySeatedPose, applyWorkingPose } from './avatar-pose.js';
import { chooseActivity, createPlaceReservations, createCrowdGrid, canTraverseOffice, toiletAccess, shuffledDeskSlots } from './office-activities.js';
import { drawGameDisplay } from './game-display.js';
const $ = id => document.getElementById(id);
const colors = { admin: '#596dad', approver: '#ab825c', editor: '#5c9d91', viewer: '#a081a8', user: '#708a5c' };
let renderer, controls, camera, scene, room, navigation, ambient, sun, desks = [], avatars = new Map(), users = [], filter = 'all', selected = null, paused = matchMedia('(prefers-reduced-motion: reduce)').matches, capacity = 0, lastTime = 0, simTime = 0;
const host = $('scene');
const places=createPlaceReservations(),crowd=createCrowdGrid(),workPlaces=createPlaceReservations();
const lowPower=matchMedia('(pointer: coarse)').matches||(navigator.hardwareConcurrency||8)<=4;
const frameInterval=1000/(lowPower?20:30);
let pingBall,gameScreen;
let gameDisplayFrame=-1,gameDisplayPlaying=null;
let dirty=true,lastDraw=0,placeSlots={},peopleSignature='';
const materials = new Map();
function mat(color) { if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: .78 })); return materials.get(color); }
const boxGeometry = new THREE.BoxGeometry(1, 1, 1), sphereGeometry = new THREE.SphereGeometry(1, 12, 10);
const shadowGeometry=new THREE.CircleGeometry(1,16),shadowMaterial=new THREE.MeshBasicMaterial({color:'#152b20',transparent:true,opacity:.12,depthWrite:false});
function box(parent, x, y, z, w, h, d, color) { const mesh = new THREE.Mesh(boxGeometry, mat(color)); mesh.position.set(x,y,z); mesh.scale.set(w,h,d); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh; }
function ball(parent,x,y,z,r,color) { const mesh = new THREE.Mesh(sphereGeometry, mat(color)); mesh.position.set(x,y,z); mesh.scale.setScalar(r); mesh.castShadow=true; parent.add(mesh); return mesh; }
function label(parent, text, x, y, z, width = 4, color = '#4a6757') {
  const canvas = document.createElement('canvas'); canvas.width=768; canvas.height=128;
  const ctx = canvas.getContext('2d'); const dark=document.documentElement.dataset.theme==='dark'; ctx.fillStyle = dark?'#253c34ee':'#ffffffee'; ctx.beginPath(); ctx.roundRect(0,0,768,128,28); ctx.fill(); ctx.fillStyle=dark?'#d4e5dc':color; ctx.font='600 45px system-ui'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(text,384,64,730);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map:texture, depthTest:false })); sprite.userData.label={text,width,color}; sprite.position.set(x,y,z); sprite.scale.set(width,width/6,1); parent.add(sprite); return sprite;
}
function updateLabel(sprite,text,force=false) {
  const info=sprite.userData.label;
  if(!info||(!force&&info.text===text))return;
  info.text=text;
  const canvas=sprite.material.map.image,ctx=canvas.getContext('2d'),dark=document.documentElement.dataset.theme==='dark';
  if(info.kind==='activity') {
    ctx.clearRect(0,0,768,256);ctx.fillStyle=dark?'#253c34f5':'#fffffff5';ctx.beginPath();ctx.roundRect(0,0,768,225,28);ctx.fill();
    ctx.beginPath();ctx.moveTo(360,224);ctx.lineTo(384,250);ctx.lineTo(408,224);ctx.fill();
    ctx.fillStyle=dark?'#accdbb':'#60766b';ctx.font='600 24px system-ui';ctx.textAlign='center';ctx.fillText('LATEST RECORDED ACTIVITY',384,38);
    ctx.fillStyle=dark?'#eef7f1':'#263d31';ctx.font='500 34px system-ui';
    const lines=[];let line='';for(const word of text.split(' ')){const next=line?line+' '+word:word;if(ctx.measureText(next).width>690&&line){lines.push(line);line=word;}else line=next;}if(line)lines.push(line);
    lines.slice(0,3).forEach((value,index)=>ctx.fillText(value,384,88+index*43));sprite.material.map.needsUpdate=true;return;
  }
  ctx.clearRect(0,0,768,128);ctx.fillStyle=dark?'#253c34ee':'#ffffffee';ctx.beginPath();ctx.roundRect(0,0,768,128,28);ctx.fill();ctx.fillStyle=dark?'#d4e5dc':info.color;ctx.font='600 45px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,384,64,730);sprite.material.map.needsUpdate=true;
}
function plant(parent,x,z) { box(parent,x,.3,z,.55,.6,.55,'#c6b59e'); box(parent,x,.95,z,.12,1,.12,'#6b7860'); for (let i=0;i<5;i++) ball(parent,x+Math.sin(i*2)*.25,1.4+(i%2)*.25,z+Math.cos(i*2)*.25,.38,'#749471'); }
function chair(parent,x,z,color='#718379') { box(parent,x,.67,z,.83,.16,.8,color); box(parent,x,1.13,z+.35,.83,.95,.16,color); box(parent,x,.3,z,.13,.6,.13,'#425449'); box(parent,x,.08,z,.8,.08,.6,'#425449'); }
function dispose(group) { group.traverse(o => { if(o.isSprite){o.material.map.dispose();o.material.dispose();}if(o.isInstancedMesh)o.dispose();if(o.userData.ownedDisplay){o.material.map.dispose();o.material.dispose();o.geometry.dispose();} }); group.removeFromParent(); }
function batchFurniture(group) {
  const batches=new Map();
  for(const mesh of [...group.children]) {
    if(!mesh.isMesh)continue;
    const key=`${mesh.geometry.uuid}:${mesh.material.uuid}`;
    if(!batches.has(key))batches.set(key,[]);
    mesh.updateMatrix();batches.get(key).push(mesh);
  }
  for(const meshes of batches.values()) {
    const batch=new THREE.InstancedMesh(meshes[0].geometry,meshes[0].material,meshes.length);
    meshes.forEach((mesh,index)=>{batch.setMatrixAt(index,mesh.matrix);mesh.removeFromParent();});
    batch.castShadow=batch.receiveShadow=true;batch.computeBoundingSphere();group.add(batch);
  }
}
function waitingPosition(index,front=camera.userData.front||13) {return {x:-13.4+(index%18)*.95,z:front-1.5-Math.floor(index/18)*1.15};}
function buildRoom(count) {
  if (room) dispose(room); room = new THREE.Group(); scene.add(room); desks=[];
  const rows = Math.ceil(count/6), depth = Math.max(26,rows*3.6+8+Math.max(0,Math.ceil(count/18)-5)*1.15), front=depth/2;
  box(room,5,-.3,0,44,.6,depth,'#c2cbbd'); box(room,5,.01,0,43.6,.06,depth-.4,'#e6e3d8');
  box(room,5,1.8,-front,44,3.6,.25,'#e1e9df'); box(room,-17,1.8,0,.25,3.6,depth,'#e1e9df');
  for(let x=-14;x<15;x+=5) { box(room,x,2.05,-front+.15,3.9,2,.12,'#b9d6d1'); box(room,x,2.05,-front+.24,.09,2,.12,'#f7faf4'); }
  box(room,10,.055,-6,10,.05,11,'#d9e1d1'); box(room,10,.06,4.7,10,.06,8,'#d9dedf'); box(room,10,.06,10.8,10,.06,4,'#e9ddd0');
  for(let i=0;i<count;i++) {
    const x=-13+(i%6)*3, z=-front+3+Math.floor(i/6)*3.6; desks.push({x,z});
    box(room,x,1.15,z,2.25,.15,1.25,'#c7a880');
    for (const dx of [-.9,.9]) for(const dz of [-.43,.43]) box(room,x+dx,.55,z+dz,.09,1.1,.09,'#f5f6ee');
    chair(room,x,z+1.1);
    box(room,x,1.26,z, .72,.06,.49,'#45534d'); const screen=box(room,x,1.53,z-.21,.72,.51,.04,'#3b4d47'); screen.rotation.x=-.12;
    box(room,x,1.54,z-.18,.62,.39,.015,'#a1c4bf'); box(room,x+.76,1.32,z+.12,.16,.25,.16,'#f8f7ed');
  }
  label(room,'AREA KERJA',-5,4,-front+1,5);
  box(room,11,1.05,-9,7,.2,1.6,'#b39b7d'); box(room,11,.5,-9,7,1,1.5,'#f5f1e6');
  box(room,13,1.65,-9,1,.9,.8,'#3e514b'); box(room,13,1.65,-8.57,.5,.4,.02,'#a3bdad');
  box(room,8.5,1.22,-9,.7,.12,.7,'#e6b578');
  for(let z of [-5,-1]) {box(room,10,1.05,z,3,.16,1.7,'#c8af89');chair(room,9,z+1,'#bba879');chair(room,11,z+1,'#bba879');}
  label(room,'KAFETARIA · COFFEE BAR',10,3.2,-10,5);
  for(let x of [8,12]) {box(room,x,.35,4,2.5,.5,1.2,'#839d92');box(room,x,1.1,4.5,2.5,.95,.22,'#839d92');box(room,x,.65,4,2.2,.16,.9,'#b8c6b8');}
  box(room,10,.5,6,2.6,.12,1.2,'#bda37e'); box(room,10,.25,6,.2,.5,.2,'#647467'); label(room,'LOUNGE · RECHARGE',10,3.2,3,5);
  box(room,10,1.15,9,10,2.3,.15,'#d1c1ae');
  for(let x of [8,12]) {box(room,x,1.05,12,3,2.1,.12,'#c4b69f');box(room,x,.4,11,.8,.7,1,'#fafaf3');box(room,x,.76,11,.85,.13,.85,'#fdfdf7');box(room,x,1,11.4,.7,.65,.3,'#fafaf3');}
  box(room,10,1,10.6,.13,2,3,'#d1c1ae');label(room,'TOILET',10,3.1,10,3);
  for(const [x,z] of [[-15,-front+1],[15,-front+1],[15,1],[15,7],[-15,front-1],[5,front-1]]) plant(room,x,z);
  label(room,'THE COMMONS',-5,.5,front-1,6);
  box(room,21,.07,0,10,.06,23,'#d3dce4');
  label(room,'COMMAND CENTER',21,3.5,-10,5);
  for(const x of [18.5,21,23.5]) {
    box(room,x,2.35,-8,2.2,1.4,.15,'#263c4c');box(room,x,2.35,-7.9,2,1.2,.02,'#71b6ba');
    for(let i=0;i<4;i++)box(room,x-.7+i*.45,2.15,-7.87,.22,.25+i*.14,.02,'#d3edba');
    box(room,x,1.05,-6,2.1,.15,1,'#65798c');chair(room,x,-5);
  }
  label(room,'PLAYSTATION / GAME LOUNGE',21,3.4,0,5);
  box(room,21,1.9,1,4,2.1,.16,'#253448');
  box(room,23.5,.8,1.5,.3,.8,.6,'#f1f3fa');box(room,23.5,.8,1.18,.09,.7,.02,'#253448');
  for(const x of [20,22])chair(room,x,4,'#7687a5');
  label(room,'PINGPONG',21,3.3,8,4);
  box(room,21,1,9,2.4,.15,3.6,'#347e99');box(room,21,1.09,9,.04,.02,3.6,'#f1f5e9');box(room,21,1.28,9,2.5,.4,.04,'#d4ded9');
  for(const x of [20.1,21.9])for(const z of [7.7,10.3])box(room,x,.5,z,.12,1,.12,'#43566b');
  batchFurniture(room);
  pingBall=ball(room,21,1.5,9,.09,'#fff3d1');pingBall.visible=false;
  const gameCanvas=document.createElement('canvas');gameCanvas.width=512;gameCanvas.height=256;
  const gameTexture=new THREE.CanvasTexture(gameCanvas);gameTexture.colorSpace=THREE.SRGBColorSpace;
  gameScreen=new THREE.Mesh(new THREE.PlaneGeometry(3.7,1.8),new THREE.MeshBasicMaterial({map:gameTexture,side:THREE.DoubleSide}));
  gameScreen.position.set(21,1.9,1.1);gameScreen.userData.ownedDisplay=true;room.add(gameScreen);
  gameDisplayFrame=-1;gameDisplayPlaying=null;updateGameDisplay(0);
  workPlaces.clear();avatars.forEach(a=>{a.workDesk=null;});
  places.clear();
  placeSlots={
    brew:[{x:13,z:-7.8,key:'coffee-machine'}],
    gaming:[20,22].map((x,i)=>({x,z:4,key:`gaming-${i}`})),
    monitoring:[18.5,21,23.5].map((x,i)=>({x,z:-5,key:`monitoring-${i}`})),
    pingpong:[6.5,11.5].map((z,i)=>({x:21,z,key:`pingpong-${i}`})),
    cafe:[{x:9,z:-4},{x:11,z:-4},{x:9,z:0},{x:11,z:0}].map((p,i)=>({...p,key:`cafe-${i}`})),
    lounge:[7.4,8.6,11.4,12.6].map((x,i)=>({x,z:3.65,key:`lounge-${i}`})),
    toilet:[8,12].map((x,i)=>({x,z:11,key:`toilet-${i}`})),
    garden:[{x:14.2,z:1},{x:14.2,z:7},{x:-14.2,z:front-1}].map((p,i)=>({...p,key:`garden-${i}`})),
    waiting:Array.from({length:count},(_,i)=>({...waitingPosition(i,front),key:`waiting-${i}`})),
  };
  avatars.forEach(a=>{a.phase=-1;if(a.pos.z>front-.5){const p=waitingPosition(a.index,front);a.pos.set(p.x,0,p.z);}});
  capacity=count; camera.userData.front=front;
  if(sun){sun.shadow.camera.top=front+4;sun.shadow.camera.bottom=-front-4;sun.shadow.camera.updateProjectionMatrix();}
  if(renderer)renderer.shadowMap.needsUpdate=true;
  dirty=true;
}
function makeAvatar(user,index) {
  const group=new THREE.Group();scene.add(group);group.userData.id=user.id;
  const upper=new THREE.Group();group.add(upper);
  const seed=[...String(user.id)].reduce((n,c)=>n*31+c.charCodeAt(0),0)>>>0;
  const female=seed%2===0, style=Math.floor(seed/2)%6;
  const skin=['#d5a080','#b67e60','#efc5a4','#8f6049'][seed%4];
  const shirt=['#698ea8','#c28a70','#769a82','#a786a8','#d0b46f','#8582a0'][style];
  const hair=['#453b32','#6e4d36','#c09a60','#272d30'][Math.floor(seed/3)%4];
  const pants=['#44544d','#404d69','#867862'][Math.floor(seed/5)%3];
  const body=box(upper,0,1.12,0,.53,.62,.34,shirt); ball(upper,0,1.65,0,.25,skin);ball(upper,0,1.79,.055,.235,hair);
  // Each account has a stable visual variant, independent of its role or online state.
  group.userData.appearance={gender:female?'female':'male',outfit:style};
  if(female) {
    if(style%3===0) { box(upper,0,1.55,.18,.48,.53,.18,hair);ball(upper,0,1.77,.28,.14,hair); }
    else if(style%3===1) {box(upper,-.23,1.57,.02,.12,.4,.29,hair);box(upper,.23,1.57,.02,.12,.4,.29,hair);}
    else {ball(upper,0,1.99,.11,.13,hair);box(upper,0,1.59,.2,.34,.36,.15,hair);}
  }else {
    if(style%3===0)box(upper,0,1.88,.01,.39,.12,.36,hair);
    if(style%3===1)box(upper,0,1.52,-.18,.25,.08,.1,hair);
  }
  const eyes=[-.085,.085].map(x=>ball(upper,x,1.66,-.231,.025,'#28372f'));
  const arms=[-.34,.34].map(x=>{
    const arm=new THREE.Group();arm.position.set(x,1.38,0);upper.add(arm);
    box(arm,0,-.15,0,.14,.3,.16,shirt);
    arm.elbow=new THREE.Group();arm.elbow.position.y=-.3;arm.add(arm.elbow);
    arm.forearm=box(arm.elbow,0,-.15,0,.13,.3,.14,shirt);
    arm.hand=ball(arm.elbow,0,-.33,0,.085,skin);
    return arm;
  });
  if(style%3===0) { // Open blazer and light shirt.
    box(upper,0,1.13,-.178,.2,.56,.035,'#f3efe2');
    const left=box(upper,-.12,1.27,-.20,.09,.28,.035,shirt);left.rotation.z=-.25;
    const right=box(upper,.12,1.27,-.20,.09,.28,.035,shirt);right.rotation.z=.25;
    box(upper,0,1.16,-.21,.055,.3,.02,'#506473');
  } else if(style%3===1) { // Shirt with collar and buttons.
    for(const x of [-.08,.08])box(upper,x,1.39,-.19,.13,.09,.03,'#f4eddc');
    for(const y of [1.05,1.2,1.33])ball(upper,0,y,-.184,.018,'#eee9dd');
  } else { // Casual top with contrast stripes.
    for(const y of [1.01,1.16,1.31])box(upper,0,y,-.18,.52,.045,.025,'#d9dfd3');
  }
  const skirt=female&&style%2===0;
  const legs=[-.16,.16].map(x=>{
    const pivot=new THREE.Group();pivot.position.set(x,.82,0);group.add(pivot);
    box(pivot,0,-.17,0,.2,.34,.22,skirt?skin:pants);
    const knee=new THREE.Group();knee.position.y=-.34;pivot.add(knee);
    const shin=box(knee,0,-.19,0,.18,.38,.2,skirt?skin:pants);
    const foot=box(knee,0,-.4,-.055,.25,.14,.37,style%2?'#eceade':'#404942');
    return {pivot,knee,shin,foot};
  });
  const skirtMesh=skirt?box(group,0,.73,0,.64,.4,.41,style===0?shirt:pants):null;
  const cup=box(group,.45,1.22,-.22,.17,.22,.17,'#f9f2dc');cup.visible=false;
  const snack=ball(group,.45,1.35,-.3,.12,'#d7a163');snack.visible=false;
  const book=new THREE.Group();group.add(book);book.position.set(0,1.15,-.37);box(book,-.115,0,0,.22,.045,.29,'#eee6c9');box(book,.115,0,0,.22,.045,.29,'#eee6c9');box(book,0,-.03,0,.48,.035,.32,'#5e7f97');book.visible=false;
  const phone=new THREE.Group();group.add(phone);phone.position.set(.33,1.32,-.4);box(phone,0,0,0,.15,.25,.04,'#34494b');box(phone,0,0,-.025,.12,.2,.01,'#9cc1c7');phone.visible=false;
  const bottle=new THREE.Group();group.add(bottle);bottle.position.set(.4,1.25,-.3);box(bottle,0,0,0,.13,.33,.13,'#92bab3');box(bottle,0,.19,0,.09,.05,.09,'#e2ece4');bottle.visible=false;
  const controller=box(group,0,1.15,-.42,.42,.12,.2,'#eef1f7');controller.visible=false;
  const paddle=ball(arms[1].elbow,0,-.45,0,.16,'#c86465');paddle.scale.z=.25;paddle.visible=false;
  const chatter=label(group,'',0,3,0,2.7);chatter.visible=false;
  group.traverse(object=>{if(object.isMesh)object.castShadow=false;});
  const shadow=new THREE.Mesh(shadowGeometry,shadowMaterial);shadow.rotation.x=-Math.PI/2;shadow.position.y=.065;shadow.scale.set(.55,.4,1);group.add(shadow);
  const name=label(group,user.name,0,2.4,0,2,colors[user.role]);
  let spawn=waitingPosition(index);
  for(let offset=0;offset<capacity+18;offset++) {
    const candidate=waitingPosition((index+offset)%(capacity+18));
    if(crowd.canMove(user.id,candidate)){spawn=candidate;break;}
  }
  crowd.update(user.id,spawn);
  return {group,upper,body,arms,legs,eyes,skirtMesh,cup,snack,book,phone,bottle,controller,paddle,chatter,name,index,user,seed,state:'',pos:new THREE.Vector3(spawn.x,0,spawn.z),points:[],route:0,phase:-1,waiting:false};
}
function activity(a) { return a.user.online ? a.user.activity : `${a.waiting?'Menunggu tempat kosong':a.activityDefinition?.name||'Keliling kantor'} · simulasi`; }
function setRoute(a,phase) {
  a.arrivedAt=null;a.phase=phase;a.activityDefinition=chooseActivity(a.seed,phase);
  const pingPlayers=[...avatars.values()].filter(other=>other!==a&&!other.user.online&&other.place?.area==='pingpong');
  if(pingPlayers.length===1)a.activityDefinition={name:'Main pingpong',area:'pingpong',pose:'pingpong'};
  const area=a.activityDefinition.area,previous=a.place;
  let candidates=placeSlots[area];
  if(a.activityDefinition.pose==='walk'){
    places.release(a.user.id);const offset=(a.seed+phase)%candidates.length;candidates=[...candidates.slice(offset),...candidates.slice(0,offset)];
  }
  a.place=places.reserve(a.user.id,area,candidates);a.waiting=!a.place;
  if(!a.place)a.place=places.reserve(a.user.id,'waiting',placeSlots.waiting);
  if(!a.place){a.points=[];a.route=0;return;}
  const {x,z}=a.place;
  if(previous?.key===a.place.key&&a.pos.distanceTo(new THREE.Vector3(x,0,z))<.15){a.points=[];a.route=0;return;}
  // Two travel lanes avoid head-on crossings; keep the open front strip clear of desks.
  const lane=z>a.pos.z?3.5:4.4;
  let exitZ=a.pos.z;
  if(a.state==='online')exitZ=(desks[a.workDesk?.index??a.index]).z+2.3;
  else if(previous?.area==='cafe')exitZ+=1.0;
  else if(previous?.area==='lounge')exitZ-=1.0;
  a.points=[new THREE.Vector3(a.pos.x,0,exitZ),new THREE.Vector3(lane,0,exitZ),new THREE.Vector3(lane,0,z),new THREE.Vector3(x,0,z)];
  const entry=a.place.area==='toilet'?toiletAccess(x):null;
  if(entry)a.points=[new THREE.Vector3(a.pos.x,0,exitZ),new THREE.Vector3(lane,0,exitZ),new THREE.Vector3(lane,0,8),...entry.map(p=>new THREE.Vector3(p.x,0,p.z))];
  if(a.pos.z>9.45&&a.pos.x>6&&a.pos.x<14) {
    a.points=[...toiletAccess(a.pos.x).reverse().map(p=>new THREE.Vector3(p.x,0,p.z)),new THREE.Vector3(lane,0,8),...(entry?entry.map(p=>new THREE.Vector3(p.x,0,p.z)):[new THREE.Vector3(lane,0,z),new THREE.Vector3(x,0,z)])];
  }
  const wing=a.place.x>17;
  if(wing&&!(a.pos.z>9.45&&a.pos.x>6&&a.pos.x<14))a.points=[new THREE.Vector3(a.pos.x,0,exitZ),new THREE.Vector3(lane,0,exitZ),new THREE.Vector3(lane,0,7),new THREE.Vector3(17.2,0,7),new THREE.Vector3(17.2,0,z),new THREE.Vector3(x,0,z)];
  if(a.pos.x>17)a.points=[new THREE.Vector3(17.2,0,a.pos.z),new THREE.Vector3(17.2,0,7),...(wing?[new THREE.Vector3(17.2,0,z),new THREE.Vector3(x,0,z)]:[new THREE.Vector3(lane,0,7),...(entry?entry.map(p=>new THREE.Vector3(p.x,0,p.z)):[new THREE.Vector3(lane,0,z),new THREE.Vector3(x,0,z)])])];
  if(wing&&a.pos.z>9.45&&a.pos.x>6&&a.pos.x<14)a.points=[...toiletAccess(a.pos.x).reverse().map(p=>new THREE.Vector3(p.x,0,p.z)),new THREE.Vector3(17.2,0,8),new THREE.Vector3(17.2,0,z),new THREE.Vector3(x,0,z)];
  a.route=0;
}
function tickAvatar(a,dt,t) {
  const online=a.user.online;
  a.cup.visible=a.snack.visible=a.book.visible=a.phone.visible=a.bottle.visible=a.controller.visible=a.paddle.visible=a.chatter.visible=false;a.group.rotation.z=0;a.group.position.y=0;
  if(online) {
    places.release(a.user.id);a.place=null;a.waiting=false;
    if(!a.workDesk){
      const candidates=shuffledDeskSlots(desks,a.lastWorkDesk);
      a.workDesk=workPlaces.reserve(a.user.id,'work',candidates.filter(slot=>crowd.canMove(a.user.id,slot)));
      if(!a.workDesk)a.workDesk=workPlaces.reserve(a.user.id,'work',candidates);
      a.lastWorkDesk=a.workDesk.key;
    }
    applyWorkingPose(a,desks[a.workDesk.index],t);
  } else {
    const phase=Math.floor((t+a.index*13)/32)+a.index;
    if(a.state==='online') { const desk=desks[a.workDesk?.index??a.index]; a.pos.set(desk.x,0,desk.z+1.1); }
    if(a.phase===-1||a.state==='online'||(a.phase!==phase&&!a.points[a.route]&&a.arrivedAt!==null&&t-a.arrivedAt>=12))setRoute(a,phase);
    workPlaces.release(a.user.id);a.workDesk=null;
    const target=a.points[a.route]; let walking=false;
    if(target) {
      const delta=target.clone().sub(a.pos),distance=delta.length();
      if(distance<.12){a.route++;}else {
        walking=true;delta.normalize();const next=a.pos.clone().addScaledVector(delta,Math.min(distance,dt*1.7));
        if(canTraverseOffice(a.pos,next)&&crowd.canMove(a.user.id,next)){a.pos.copy(next);a.blockedTime=0;}
        else {
          a.blockedTime=(a.blockedTime||0)+dt;
          if(a.blockedTime>.8){const side=a.pos.clone().add(new THREE.Vector3(delta.z,0,-delta.x).multiplyScalar(dt*1.2));if(canTraverseOffice(a.pos,side)&&crowd.canMove(a.user.id,side))a.pos.copy(side);}
        }
        a.group.rotation.y=Math.atan2(-delta.x,-delta.z);
      }
    }
    applyStandingPose(a,walking?Math.sin(t*7)*.45:0);
    a.arms.forEach((arm,i)=>{arm.rotation.x=walking?Math.sin(t*7+i*Math.PI)*.35:0;});
    if(!a.points[a.route]) {
      if(a.arrivedAt===null)a.arrivedAt=t;
      const pose=a.waiting?'wait':a.activityDefinition?.pose;
      if(a.place?.area==='cafe'||a.place?.area==='lounge'||a.place?.area==='gaming'||a.place?.area==='monitoring')applySeatedPose(a);
      if(pose==='coffee'||pose==='eat'||pose==='water'){a.cup.visible=pose==='coffee';a.snack.visible=pose==='eat';a.bottle.visible=pose==='water';a.arms[1].rotation.x=1.2+Math.sin(t*2)*.13;a.arms[1].elbow.rotation.x=1.2;}
      if(pose==='brew'){a.cup.visible=true;a.arms[1].rotation.x=1.1+Math.sin(t*3)*.2;a.arms[1].elbow.rotation.x=.6;}
      if(pose==='game'){a.controller.visible=true;a.arms.forEach((arm,i)=>{arm.rotation.x=.95+Math.sin(t*8+i)*.05;arm.elbow.rotation.x=.8;});}
      if(pose==='monitor'){a.arms.forEach((arm,i)=>{arm.rotation.x=1.2+Math.sin(t*6+i)*.06;arm.elbow.rotation.x=.4;});}
      if(pose==='pingpong'){a.group.rotation.y=a.place.z<9?Math.PI:0;a.paddle.visible=true;a.arms[1].rotation.x=.8+Math.sin(t*4+(a.place.z<9?0:Math.PI))*.65;a.arms[1].elbow.rotation.x=.7;}
      if(pose==='chat'||pose==='chatDrink'){a.chatter.visible=true;updateLabel(a.chatter,['Apa kabar?','Rehat sebentar yuk!','Sudah ngopi?'][Math.floor(t/4+a.seed)%3]);a.arms[0].rotation.z=-.3-Math.sin(t*2)*.2;if(pose==='chatDrink'){a.cup.visible=true;a.arms[1].rotation.x=1.2;a.arms[1].elbow.rotation.x=1;}}
      if(pose==='sleep')a.eyes.forEach(eye=>{eye.scale.y=.005;});
      if(pose==='read'){a.book.visible=true;a.arms.forEach(arm=>{arm.rotation.x=.9;arm.elbow.rotation.x=.6;});}
      if(pose==='phone'){a.phone.visible=true;a.arms[1].rotation.x=1.1;a.arms[1].elbow.rotation.x=.9;}
      if(pose==='stretch')a.arms.forEach((arm,i)=>{arm.rotation.z=(i?1:-1)*(2.2+Math.sin(t*1.5)*.3);});
      if(pose==='chat'){a.arms[1].rotation.x=.6+Math.sin(t*2)*.25;a.arms[1].elbow.rotation.x=.7;}
      if(pose==='garden'){a.bottle.visible=true;a.arms[1].rotation.x=.9+Math.sin(t*1.5)*.1;}
      if(pose==='toilet') {a.group.userData.pose='toilet';a.group.userData.place=a.place.key;a.group.position.copy(a.pos);a.group.visible=false;a.state='offline';crowd.update(a.user.id,a.pos,false);return;}
    }
  }
  a.group.visible=true;a.group.position.x=a.pos.x;a.group.position.z=a.pos.z;a.state=online?'online':'offline';
  if(online)a.name.rotation.z=0;
  crowd.update(a.user.id,a.pos,a.group.visible);
  a.group.userData.pose=online?'working':a.waiting?'waiting':a.points[a.route]?'walking':a.activityDefinition?.pose;
  a.group.userData.place=a.workDesk?.key||a.place?.key||`desk-${a.index}`;
}
function updateGameDisplay(time) {
  if(!gameScreen)return;
  const playing=[...avatars.values()].some(a=>!a.user.online&&!a.waiting&&a.activityDefinition?.pose==='game'&&!a.points[a.route]);
  const frame=playing?Math.floor(time*8):0;
  if(frame===gameDisplayFrame&&playing===gameDisplayPlaying)return;
  drawGameDisplay(gameScreen.material.map.image,playing,time);
  gameScreen.material.map.needsUpdate=true;gameScreen.userData.playing=playing;
  gameDisplayFrame=frame;gameDisplayPlaying=playing;
}
function renderPeople() {
  const query=$('search').value.toLowerCase();
  const signature=JSON.stringify([query,filter,users.map(u=>[u.id,u.role,u.name,u.online,avatars.has(u.id)?activity(avatars.get(u.id)):u.activity])]);
  if(signature===peopleSignature)return;
  peopleSignature=signature;$('people').replaceChildren();
  for(const user of users) {
    if(!`${user.name} ${user.role}`.toLowerCase().includes(query)||filter==='online'&&!user.online||filter==='offline'&&user.online)continue;
    const a=avatars.get(user.id), button=document.createElement('button');button.className='person';button.setAttribute('aria-label',`${user.name}: ${activity(a)}`);
    const icon=document.createElement('span');icon.className='avatar';icon.style.background=colors[user.role];icon.textContent=user.role.slice(0,2).toUpperCase();
    const content=document.createElement('span'),name=document.createElement('strong'),desc=document.createElement('small');name.textContent=user.name;desc.textContent=`${user.role.toUpperCase()} · ${activity(a)}`;content.append(name,desc);
    const dot=document.createElement('i');dot.className=`dot ${user.online?'green':'amber'}`;button.append(icon,content,dot);button.onclick=()=>focusUser(user.id);$('people').append(button);
  }
  if(!users.length)$('people').textContent='Belum ada akun terdaftar.';
  if(selected!==null)showDetail();
}
function showDetail() {const a=avatars.get(selected);if(!a){selected=null;$('detail').textContent='Pilih anggota untuk melihat aktivitasnya.';return;}$('detail').textContent=`${a.user.name} · ${a.user.online?'Sesi aktif':'Tanpa sesi'}\n${activity(a)}`;}
function focusUser(id) {selected=id;const a=avatars.get(id);if(!a)return;showDetail();controls.target.set(a.pos.x,0,a.pos.z);camera.position.set(a.pos.x+8,11,a.pos.z+10);controls.update();}
function view(key='all') {
  const front=camera.userData.front||13;
  const views={all:[[33,34,36],[0,0,0]],work:[[12,22,22],[-6,0,0]],cafe:[[23,17,9],[10,0,-5]],rest:[[22,15,23],[10,0,6]],gaming:[[32,14,17],[21,0,3]],monitoring:[[32,14,6],[21,0,-6]],pingpong:[[30,12,21],[21,0,9]]};const [pos,target]=views[key]||views.all;
  camera.position.fromArray(pos);controls.target.fromArray(target);if(key==='all'&&front>13){camera.position.multiplyScalar(front/13);}controls.update();
  document.querySelectorAll('[data-camera]').forEach(b=>b.classList.toggle('selected',b.dataset.camera===key));
}
function applyOfficeTheme() {
  if(!scene)return;
  const dark=document.documentElement.dataset.theme==='dark';
  scene.background.set(dark?'#19272b':'#e9efea');
  if(ambient){ambient.color.set(dark?'#c6dbef':'#ffffff');ambient.groundColor.set(dark?'#536565':'#bcc8af');ambient.intensity=dark?1.5:2.8;}
  if(sun){sun.color.set(dark?'#c1d3eb':'#fff9e8');sun.intensity=dark?1.7:3;}
  if(renderer)renderer.toneMappingExposure=dark?.8:1;
  scene.traverse(object=>{if(object.isSprite&&object.userData.label)updateLabel(object,object.userData.label.text,true);});
  dirty=true;
}
window.addEventListener('nist:theme-change',applyOfficeTheme);
async function sync() {
  try {const response=await fetch('/api/public/virtual-office',{cache:'no-store'});if(!response.ok)throw new Error();const data=await response.json();
    users=data.users;const old=capacity;if(capacity!==data.capacity){buildRoom(data.capacity);if(!old)view();}
    for(const [id,a] of avatars)if(!users.some(u=>u.id===id)){places.release(id);workPlaces.release(id);crowd.update(id,a.pos,false);dispose(a.group);avatars.delete(id);}
    users.forEach((u,i)=>{if(!avatars.has(u.id))avatars.set(u.id,makeAvatar(u,i));const a=avatars.get(u.id);a.user=u;a.index=i;updateLabel(a.name,u.name);
      if(u.online&&!a.popup){a.popup=label(a.group,'',0,3.5,0,3.8);a.popup.material.map.image.height=256;a.popup.scale.y=3.8/3;a.popup.userData.label.kind='activity';}
      if(a.popup){a.popup.visible=u.online;if(u.online)updateLabel(a.popup,u.activity);}
      tickAvatar(a,0,simTime);});updateGameDisplay(simTime);
    $('online').textContent=users.filter(u=>u.online).length;$('members').textContent=users.length;$('total').textContent=users.length;$('capacity').textContent=data.capacity;
    $('connection').textContent='● Live · '+new Date(data.updatedAt).toLocaleTimeString('id-ID');$('notice').style.display='none';renderPeople();
    dirty=true;
  }catch(_){$('connection').textContent='Koneksi terputus';$('notice').textContent='Data pengguna belum dapat diperbarui. Mencoba kembali otomatis; tampilan terakhir dipertahankan.';$('notice').style.display='block';}
}
try {
  scene=new THREE.Scene();scene.background=new THREE.Color('#e9efea');
  renderer=new THREE.WebGLRenderer({antialias:!lowPower,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio,lowPower?1:1.25));renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.type=THREE.PCFShadowMap;host.append(renderer.domElement);
  camera=new THREE.PerspectiveCamera(43,1,.1,500);controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.18;controls.maxPolarAngle=Math.PI/2.15;controls.minDistance=5;controls.maxDistance=180;
  navigation=installCameraNavigation(camera,controls,renderer.domElement,document);
  ambient=new THREE.HemisphereLight('#ffffff','#bcc8af',2.8);scene.add(ambient);sun=new THREE.DirectionalLight('#fff9e8',3);sun.position.set(-10,25,15);sun.castShadow=true;sun.shadow.mapSize.set(512,512);sun.shadow.camera.left=-25;sun.shadow.camera.right=25;sun.shadow.camera.top=30;sun.shadow.camera.bottom=-30;sun.shadow.bias=-.001;scene.add(sun);applyOfficeTheme();
  buildRoom(30);view();
  controls.addEventListener('change',()=>{dirty=true;});
  new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();dirty=true;}).observe(host);
  function frame(ms) {
    if(document.hidden||ms-lastDraw<frameInterval)return;
    const dt=lastTime?Math.min((ms-lastTime)/1000,.12):0;lastTime=ms;lastDraw=ms;
    navigation.update(dt);controls.update();
    const animated=!paused&&avatars.size>0;
    if(animated){simTime+=dt;crowd.clear();avatars.forEach(a=>crowd.update(a.user.id,a.pos,a.group.visible));avatars.forEach(a=>tickAvatar(a,dt,simTime));updateGameDisplay(simTime);const players=[...avatars.values()].filter(a=>!a.user.online&&!a.waiting&&a.activityDefinition?.pose==='pingpong'&&!a.points[a.route]);pingBall.visible=players.length===2;if(pingBall.visible)pingBall.position.set(21+Math.sin(simTime*2)*.55,1.2+Math.abs(Math.cos(simTime*4))*.6,9+Math.sin(simTime*4)*1.9);}
    if(!dirty&&!animated&&!navigation.active)return;
    renderer.render(scene,camera);dirty=false;
  }
  renderer.setAnimationLoop(frame);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){renderer.setAnimationLoop(null);}else{lastTime=lastDraw=0;dirty=true;renderer.setAnimationLoop(frame);}});
  let down;renderer.domElement.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];});renderer.domElement.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;const rect=renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);const hits=ray.intersectObjects([...avatars.values()].map(a=>a.group),true);if(hits.length){let o=hits[0].object;while(o&&o.userData.id===undefined)o=o.parent;if(o)focusUser(o.userData.id);}});
  sync();setInterval(()=>{if(!document.hidden)sync();},10000);setInterval(()=>{if(!document.hidden)renderPeople();},3000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();});
}catch(error){$('notice').style.display='block';$('notice').textContent='Tampilan 3D memerlukan WebGL 2. Gunakan browser dengan akselerasi grafis aktif.';fetch('/api/public/virtual-office').then(r=>r.json()).then(data=>{$('members').textContent=data.users.length;$('people').textContent=data.users.map(u=>`${u.name} — ${u.activity}`).join(' · ');}).catch(()=>{$('connection').textContent='Data tidak tersedia';});}
$('search').oninput=renderPeople;
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(o=>o.classList.toggle('selected',o===b));renderPeople();});
document.querySelectorAll('[data-camera]').forEach(b=>b.onclick=()=>view(b.dataset.camera));$('reset').onclick=()=>view();
function updatePause(){ $('pause').textContent=paused?'▶ Lanjutkan':'Ⅱ Jeda';$('pause').setAttribute('aria-pressed',String(paused));}updatePause();$('pause').onclick=()=>{paused=!paused;dirty=true;updatePause();};
export { camera, controls, avatars, renderer, frameInterval, gameScreen, updateGameDisplay };
