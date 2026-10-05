import { links } from './noteLinks.mjs';

const aliases = { title:'title',judul:'title',file:'file',filename:'file',content:'content',isi:'content',folder:'folder',path:'file',tag:'tag',link:'link',tautan:'link' };
export const searchScopes = [['all','Semua'],['file','Nama file / jalur'],['title','Judul'],['content','Isi catatan'],['folder','Folder'],['tag','Tag'],['link','Tautan']];
export function parseQuery(query) {
  return [...query.matchAll(/(-?)(?:(title|judul|file|filename|content|isi|folder|path|tag|link|tautan):)?("[^"]*"|[^\s"]+)/gi)]
    .map(match=>({exclude:match[1]==='-',field:aliases[match[2]?.toLowerCase()]||'all',value:match[3].replace(/^"|"$/g,'').toLowerCase()})).filter(term=>term.value);
}
export function noteFields(note) {
  const title=note.title||'',content=note.content||'',folder=note.folder||'';
  return {title,file:`${folder?folder+'/':''}${title}.md`,content,folder,
    tag:[...content.matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu)].map(match=>'#'+match[1]).join(' '),link:links(content).join(' ')};
}
function fieldsFor(term,scope) { return term.field!=='all'?[term.field]:scope!=='all'?[scope]:['title','file','content','folder','tag','link']; }
function matchedFields(fields,term,scope) { return fieldsFor(term,scope).filter(field=>(fields[field]||'').toLowerCase().includes(term.value)); }
export function matchesNote(note,query,scope='all') {
  const fields=noteFields(note);
  return parseQuery(query).every(term=>term.exclude?!matchedFields(fields,term,scope).length:Boolean(matchedFields(fields,term,scope).length));
}
export function matchesFolder(path,query,scope='all') {
  if(!query.trim())return true;
  if(!['all','folder','file'].includes(scope))return false;
  const fields={folder:path,file:path};
  return parseQuery(query).every(term=>term.exclude?!matchedFields(fields,term,scope).length:Boolean(matchedFields(fields,term,scope).length));
}
export function highlight(text,query) {
  const lower=text.toLowerCase(),ranges=[];
  for(const term of parseQuery(query).filter(term=>!term.exclude)) {
    let position=0;
    while(position<text.length){const start=lower.indexOf(term.value,position);if(start<0)break;ranges.push([start,start+term.value.length]);position=start+term.value.length;}
  }
  ranges.sort((a,b)=>a[0]-b[0]);const merged=[];
  for(const range of ranges){const previous=merged.at(-1);if(previous&&range[0]<=previous[1])previous[1]=Math.max(previous[1],range[1]);else merged.push([...range]);}
  const chunks=[];let index=0;
  for(const [start,end] of merged){if(start>index)chunks.push({text:text.slice(index,start),match:false});chunks.push({text:text.slice(start,end),match:true});index=end;}
  if(index<text.length)chunks.push({text:text.slice(index),match:false});return chunks;
}
export function searchNotes(notes,query,scope='all') {
  const terms=parseQuery(query),weights={title:8,file:5,folder:3,tag:4,link:3,content:1};
  return notes.flatMap(note=>{
    const fields=noteFields(note),found=terms.map(term=>({term,fields:matchedFields(fields,term,scope)}));
    if(!found.every(item=>item.term.exclude?!item.fields.length:item.fields.length))return [];
    const positive=found.filter(item=>!item.term.exclude);
    const matched=[...new Set(positive.flatMap(item=>item.fields))];
    const score=positive.reduce((sum,item)=>sum+Math.max(0,...item.fields.map(field=>weights[field])),0);
    const body=fields.content.replace(/\s+/g,' ');
    const hits=positive.filter(item=>item.fields.includes('content')).map(item=>body.toLowerCase().indexOf(item.term.value)).filter(index=>index>=0);
    const start=Math.max(0,(hits.length?Math.min(...hits):0)-45),end=Math.min(body.length,start+150);
    const snippet=(start?'…':'')+body.slice(start,end)+(end<body.length?'…':'');
    return [{note,path:fields.file,matched,score,snippet}];
  }).sort((a,b)=>b.score-a.score||a.path.localeCompare(b.path));
}
