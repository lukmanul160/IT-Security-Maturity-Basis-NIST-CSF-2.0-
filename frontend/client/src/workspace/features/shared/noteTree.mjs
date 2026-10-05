import { matchesNote, matchesFolder } from './noteSearch.mjs';
export function treeRows(folders, notes, expanded, search = '', scope = 'all') {
  const paths = new Set();
  for (const path of [...folders,...notes.map(note=>note.folder||'')]) {
    const parts=path.split('/').filter(Boolean);
    for(let i=1;i<=parts.length;i++) paths.add(parts.slice(0,i).join('/'));
  }
  const query=search.trim().toLowerCase();
  const matching=notes.filter(note=>matchesNote(note,search,scope));
  const rows=[];
  function walk(parent,depth) {
    for(const path of [...paths].filter(path=>path.split('/').slice(0,-1).join('/')===parent).sort((a,b)=>a.localeCompare(b))) {
      if(query && !matchesFolder(path,search,scope) && ![...paths].some(child=>child.startsWith(path+'/')&&matchesFolder(child,search,scope)) && !matching.some(note=>note.folder===path || note.folder?.startsWith(path+'/'))) continue;
      rows.push({type:'folder',path,label:path.split('/').pop(),depth,count:notes.filter(n=>n.folder===path||n.folder?.startsWith(path+'/')).length});
      if(query || expanded.has(path)) walk(path,depth+1);
    }
    for(const note of matching.filter(note=>(note.folder||'')===parent).sort((a,b)=>a.title.localeCompare(b.title))) rows.push({type:'note',note,depth});
  }
  walk('',0);return rows;
}
