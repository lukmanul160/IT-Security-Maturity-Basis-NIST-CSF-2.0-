export function wikiAtCursor(before, after='') {
 const match=before.match(/\[\[([^\[\]\n|#]*)$/);
 if(match)return {query:match[1],length:match[0].length,closing:after.startsWith(']]')?2:0};
 if(before.endsWith('[[]]'))return {query:'',length:4,closing:0};
 return null;
}
export function wikiSuggestions(notes,query){
 const terms=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
 return notes.map(note=>({...note,path:(note.folder?note.folder+'/':'')+note.title+'.md',target:(note.folder?note.folder+'/':'')+note.title}))
  .filter(note=>terms.every(term=>note.path.toLocaleLowerCase().includes(term)))
  .sort((a,b)=>(a.title.toLocaleLowerCase().startsWith(query.toLocaleLowerCase())?0:1)-(b.title.toLocaleLowerCase().startsWith(query.toLocaleLowerCase())?0:1)||a.path.localeCompare(b.path))
  .slice(0,30);
}
