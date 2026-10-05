<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { graph } from '../features/shared/noteLinks.mjs';
import { matchesNote } from '../features/shared/noteSearch.mjs';
const props=defineProps({notes:{type:Array,default:()=>[]},selectedId:[String,Number]});
const emit=defineEmits(['open']);
const canvas=ref(null), query=ref(''), local=ref(false), orphans=ref(true), paused=ref(false), hover=ref(''), zoom=ref(1), selected=ref(props.selectedId||''), labels=ref(true);
const allEdges=computed(()=>graph(props.notes));
const nodes=computed(()=>{
  const connected=new Set(allEdges.value.flatMap(e=>[e.source,e.target]));
  const neighborhood=new Set([selected.value,...allEdges.value.filter(e=>e.source===selected.value||e.target===selected.value).flatMap(e=>[e.source,e.target])]);
  return props.notes.filter(n=>matchesNote(n,query.value) && (orphans.value||connected.has(n.id)) && (!local.value||neighborhood.has(n.id)));
});
const edges=computed(()=>{const ids=new Set(nodes.value.map(n=>n.id));return allEdges.value.filter(e=>ids.has(e.source)&&ids.has(e.target));});
const colors=['#a78bfa','#60a5fa','#34d399','#fbbf24','#f472b6','#fb923c'];
const groups=computed(()=>[...new Set(nodes.value.map(n=>n.folder||'Vault'))].sort());
const color=note=>colors[groups.value.indexOf(note.folder||'Vault')%colors.length];
let positions=new Map(), camera={x:0,y:0}, gesture=null, frame=0, observer, width=800,height=550,ticks=0;
const degrees=computed(()=>{const result=new Map();for(const edge of edges.value){result.set(edge.source,(result.get(edge.source)||0)+1);result.set(edge.target,(result.get(edge.target)||0)+1);}return result;});
const degree=id=>degrees.value.get(id)||0;
function rebuild(){
 const keep=new Map();nodes.value.forEach((note,i)=>{const angle=i*2.3999632297,radius=35*Math.sqrt(i+1);keep.set(note.id,positions.get(note.id)||{x:Math.cos(angle)*radius,y:Math.sin(angle)*radius,vx:0,vy:0});});positions=keep;ticks=0;
}
watch(nodes,rebuild,{immediate:true});
watch(()=>props.selectedId,id=>{if(id)selected.value=id;});
function fit(){
 const values=[...positions.values()];if(!values.length){zoom.value=1;camera={x:0,y:0};return;}
 const minX=Math.min(...values.map(p=>p.x)),maxX=Math.max(...values.map(p=>p.x)),minY=Math.min(...values.map(p=>p.y)),maxY=Math.max(...values.map(p=>p.y));
 camera={x:(minX+maxX)/2,y:(minY+maxY)/2};zoom.value=Math.min(2,Math.max(.15,Math.min((width-90)/(maxX-minX+100),(height-90)/(maxY-minY+100))));
}
function physics(){
 if(paused.value||ticks++>500)return;
 const list=[...positions.entries()];
 for(let i=0;i<list.length;i++){
  const [id,a]=list[i];a.vx-=a.x*.0004;a.vy-=a.y*.0004;
  // Bound repulsion work for larger vaults while retaining all visible nodes.
  const stride=Math.max(1,Math.ceil(list.length/250));
  for(let j=i+1;j<list.length;j+=stride){const b=list[j][1],dx=a.x-b.x||.1,dy=a.y-b.y||.1,d2=Math.max(100,dx*dx+dy*dy),force=110/d2;a.vx+=dx*force;a.vy+=dy*force;b.vx-=dx*force;b.vy-=dy*force;}
 }
 for(const edge of edges.value){const a=positions.get(edge.source),b=positions.get(edge.target);if(!a||!b)continue;const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1,f=(d-115)*.004;a.vx+=dx/d*f;a.vy+=dy/d*f;b.vx-=dx/d*f;b.vy-=dy/d*f;}
 for(const [id,p] of positions){if(gesture?.id===id)continue;p.vx*=.82;p.vy*=.82;p.x+=Math.max(-8,Math.min(8,p.vx));p.y+=Math.max(-8,Math.min(8,p.vy));}
}
const screen=p=>({x:(p.x-camera.x)*zoom.value+width/2,y:(p.y-camera.y)*zoom.value+height/2});
const world=p=>({x:(p.x-width/2)/zoom.value+camera.x,y:(p.y-height/2)/zoom.value+camera.y});
function draw(){
 frame=requestAnimationFrame(draw);if(!canvas.value||!canvas.value.getClientRects().length)return;
 physics();const ctx=canvas.value.getContext('2d');const dpr=Math.min(window.devicePixelRatio||1,2);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.fillStyle='#171721';ctx.fillRect(0,0,width,height);
 const neighbors=new Set([hover.value,...edges.value.filter(e=>e.source===hover.value||e.target===hover.value).flatMap(e=>[e.source,e.target])]);
 for(const edge of edges.value){const a=screen(positions.get(edge.source)),b=screen(positions.get(edge.target));ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle=hover.value&&(edge.source===hover.value||edge.target===hover.value)?'#c4b5fd':'#414152';ctx.lineWidth=hover.value&&(edge.source===hover.value||edge.target===hover.value)?1.8:1;ctx.stroke();}
 for(const note of nodes.value){const p=screen(positions.get(note.id)),r=(5+Math.min(7,degree(note.id)))*Math.sqrt(zoom.value);ctx.globalAlpha=hover.value&&!neighbors.has(note.id)?.25:1;ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fillStyle=note.id===selected.value?'#f5f3ff':color(note);ctx.fill();if(note.id===selected.value){ctx.strokeStyle='#a78bfa';ctx.lineWidth=3;ctx.stroke();}if(labels.value||hover.value===note.id){ctx.fillStyle='#d4d4df';ctx.font=`${Math.max(10,Math.min(14,12*zoom.value))}px system-ui`;ctx.textAlign='center';ctx.fillText(note.title,p.x,p.y+r+17);}}
 ctx.globalAlpha=1;
}
function coordinates(event){const rect=canvas.value.getBoundingClientRect();return {x:event.clientX-rect.left,y:event.clientY-rect.top};}
function hit(p){return [...nodes.value].reverse().find(note=>{const s=screen(positions.get(note.id));return Math.hypot(s.x-p.x,s.y-p.y)<Math.max(13,(8+degree(note.id))*Math.sqrt(zoom.value));});}
function down(event){if(event.button!==0)return;const p=coordinates(event),node=hit(p);gesture={id:node?.id,start:p,last:p,moved:false};if(node)selected.value=node.id;canvas.value.setPointerCapture(event.pointerId);}
function move(event){const p=coordinates(event);if(!gesture){hover.value=hit(p)?.id||'';canvas.value.style.cursor=hover.value?'pointer':'grab';return;}if(Math.hypot(p.x-gesture.start.x,p.y-gesture.start.y)>4)gesture.moved=true;
 if(gesture.id){Object.assign(positions.get(gesture.id),world(p),{vx:0,vy:0});ticks=0;}else{camera.x-=(p.x-gesture.last.x)/zoom.value;camera.y-=(p.y-gesture.last.y)/zoom.value;}gesture.last=p;
}
function up(event){if(!gesture)return;const action=gesture;gesture=null;if(canvas.value.hasPointerCapture(event.pointerId))canvas.value.releasePointerCapture(event.pointerId);if(action.id&&!action.moved)emit('open',props.notes.find(n=>n.id===action.id));}
function cancel(){gesture=null;}
function zoomAt(factor,p={x:width/2,y:height/2}){const before=world(p);zoom.value=Math.max(.15,Math.min(4,zoom.value*factor));camera.x=before.x-(p.x-width/2)/zoom.value;camera.y=before.y-(p.y-height/2)/zoom.value;}
function key(event){if(['+','=','-','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter'].includes(event.key))event.preventDefault();if(event.key==='+'||event.key==='=')zoomAt(1.15);if(event.key==='-')zoomAt(1/1.15);if(event.key==='ArrowLeft')camera.x-=40/zoom.value;if(event.key==='ArrowRight')camera.x+=40/zoom.value;if(event.key==='ArrowUp')camera.y-=40/zoom.value;if(event.key==='ArrowDown')camera.y+=40/zoom.value;if(event.key==='Enter'){const note=props.notes.find(n=>n.id===selected.value);if(note)emit('open',note);}}
function resize(){const rect=canvas.value.getBoundingClientRect();if(!rect.width)return;width=rect.width;height=rect.height;const dpr=Math.min(window.devicePixelRatio||1,2);canvas.value.width=Math.round(width*dpr);canvas.value.height=Math.round(height*dpr);}
function exportPng(){const anchor=document.createElement('a');anchor.download='knowledge-graph.png';anchor.href=canvas.value.toDataURL('image/png');anchor.click();}
onMounted(()=>{observer=new ResizeObserver(resize);observer.observe(canvas.value);resize();fit();draw();});
onBeforeUnmount(()=>{cancelAnimationFrame(frame);observer?.disconnect();});
</script>
<template>
<div class="knowledge-graph">
 <div class="graph-tools"><input v-model="query" aria-label="Cari dalam graf" placeholder="Cari catatan / folder / #tag"><label><input v-model="local" type="checkbox"> Graf lokal</label><label><input v-model="orphans" type="checkbox"> Tanpa hubungan</label><label><input v-model="labels" type="checkbox"> Label</label></div>
 <div class="canvas-wrap"><canvas ref="canvas" tabindex="0" aria-label="Graf catatan interaktif. Drag simpul untuk memindahkan, drag latar untuk pan, roda mouse untuk zoom. Enter membuka catatan terpilih." @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="cancel" @pointerleave="hover=''" @wheel.prevent="zoomAt(Math.exp(-$event.deltaY*.001),coordinates($event))" @keydown="key"/>
 <div v-if="!nodes.length" class="graph-empty">Tidak ada catatan yang cocok dengan filter.</div>
 <div class="zoom-tools"><button aria-label="Zoom keluar" @click="zoomAt(1/1.2)">−</button><span>{{ Math.round(zoom*100) }}%</span><button aria-label="Zoom masuk" @click="zoomAt(1.2)">+</button><button @click="fit">Fit</button><button @click="paused=!paused">{{ paused?'Lanjutkan':'Jeda' }}</button><button @click="exportPng">PNG</button></div></div>
 <div class="graph-info">{{ nodes.length }} catatan · {{ edges.length }} hubungan. Drag simpul / latar · Scroll untuk zoom · Klik untuk membuka</div>
 <div class="graph-legend"><span v-for="(group,i) in groups" :key="group"><i :style="{background:colors[i%colors.length]}"/>{{ group }}</span></div>
 <details class="graph-accessible"><summary>Buka catatan dari graf</summary><button v-for="note in nodes" :key="note.id" @click="emit('open',note)">{{ note.title }}</button></details>
</div>
</template>
<style scoped>
.knowledge-graph{background:#171721;color:#dedee8;border-radius:8px;overflow:hidden}.graph-tools{display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:12px;background:#22222e;font-size:12px}.graph-tools>input{flex:1;min-width:150px;background:#171721;border:1px solid #414152;border-radius:5px;color:white;padding:8px}.graph-tools label{display:flex;align-items:center;gap:5px}.canvas-wrap{position:relative}canvas{display:block;width:100%;height:560px;touch-action:none;cursor:grab}canvas:focus-visible{outline:2px solid #a78bfa;outline-offset:-2px}.zoom-tools{position:absolute;right:12px;bottom:12px;display:flex;align-items:center;gap:5px;background:#22222edb;padding:6px;border-radius:7px;font-size:11px}.knowledge-graph button{background:#30303e;color:#e4e4ec;border:1px solid #4a4a5a;border-radius:4px;padding:5px 8px;cursor:pointer}.graph-info{font-size:11px;padding:12px;color:#aaaabb}.graph-legend{display:flex;gap:12px;flex-wrap:wrap;padding:0 12px 12px;font-size:11px}.graph-legend i{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:5px}.graph-empty{position:absolute;top:45%;width:100%;text-align:center;pointer-events:none;color:#aaaabb}.graph-accessible{padding:8px 12px;font-size:12px}.graph-accessible button{margin:5px}@media(max-width:650px){canvas{height:420px}.zoom-tools{right:4px;bottom:4px}}
</style>
