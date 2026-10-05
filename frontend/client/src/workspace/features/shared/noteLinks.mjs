export function links(content) {
  const text = content.replace(/```[\s\S]*?```/g,'').replace(/`[^`\n]*`/g,'');
  return [...new Set([...text.matchAll(/\[\[([^\]\n]+)\]\]/g)].map(match=>match[1].split('|')[0].split('#')[0].trim()).filter(Boolean))];
}
export function resolveNote(notes, target) {
  const key=target.replace(/\.md$/i,'').toLowerCase();
  return notes.find(note=>`${note.folder?note.folder+'/':''}${note.title}`.toLowerCase()===key) || notes.find(note=>note.title.toLowerCase()===key);
}
export function graph(notes) {
  return notes.flatMap(note=>links(note.content).map(title=>({source:note.id,target:resolveNote(notes,title)?.id,title}))).filter(edge=>edge.target && edge.target !== edge.source);
}
