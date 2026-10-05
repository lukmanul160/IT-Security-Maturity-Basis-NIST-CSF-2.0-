export function links(content) {
  const text = content.replace(/```[\s\S]*?```/g,'').replace(/`[^`\n]*`/g,'');
  return [...new Set([...text.matchAll(/\[\[([^\]\n]+)\]\]/g)].map(match=>match[1].split('|')[0].split('#')[0].trim()).filter(Boolean))];
}
export function resolveNote(notes, target, sourceFolder = '') {
  const key=target.trim().replace(/\.(md|txt)$/i,'');
  if(key.includes('/'))return notes.find(note=>`${note.folder?note.folder+'/':''}${note.title}`.toLowerCase()===key.toLowerCase());
  const local=notes.find(note=>(note.folder||'')===sourceFolder && note.title.toLowerCase()===key.toLowerCase());
  if(local)return local;
  const candidates=notes.filter(note=>note.title.toLowerCase()===key.toLowerCase());
  return candidates.length===1 ? candidates[0] : undefined;
}
export function graph(notes) {
  return notes.flatMap(note=>links(note.content).map(title=>({source:note.id,target:resolveNote(notes,title,note.folder||'')?.id,title}))).filter(edge=>edge.target && edge.target !== edge.source);
}
