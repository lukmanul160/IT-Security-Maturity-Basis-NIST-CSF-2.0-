import { matchesNote, matchesFolder } from './noteSearch.mjs';
export function treeRows(folders, notes, expanded, search = '', scope = 'all', images = []) {
  const assets=images.map(image=>({...image,folder:image.path.split('/').slice(0,-1).join('/'),label:image.path.split('/').pop()}));
  const matchingImages=assets.filter(image=>matchesFolder(image.path,search,scope));
  const paths = new Set();
  for (const path of [...folders,...notes.map(note=>note.folder||''),...assets.map(image=>image.folder)]) {
    const parts=path.split('/').filter(Boolean);
    for(let i=1;i<=parts.length;i++) paths.add(parts.slice(0,i).join('/'));
  }
  const query=search.trim().toLowerCase();
  const matching=notes.filter(note=>matchesNote(note,search,scope));
  const rows=[];
  function walk(parent,depth) {
    for(const path of [...paths].filter(path=>path.split('/').slice(0,-1).join('/')===parent).sort((a,b)=>a.localeCompare(b))) {
      if(query && !matchesFolder(path,search,scope) && ![...paths].some(child=>child.startsWith(path+'/')&&matchesFolder(child,search,scope)) && ![...matching,...matchingImages].some(note=>note.folder===path || note.folder?.startsWith(path+'/'))) continue;
      rows.push({type:'folder',path,label:path.split('/').pop(),depth,count:[...notes,...assets].filter(n=>n.folder===path||n.folder?.startsWith(path+'/')).length});
      if(query || expanded.has(path)) walk(path,depth+1);
    }
    for(const note of matching.filter(note=>(note.folder||'')===parent).sort((a,b)=>a.title.localeCompare(b.title))) rows.push({type:'note',note,depth});
    for(const image of matchingImages.filter(image=>image.folder===parent).sort((a,b)=>a.label.localeCompare(b.label))) rows.push({type:'image',image,label:image.label,depth});
  }
  walk('',0);return rows;
}
