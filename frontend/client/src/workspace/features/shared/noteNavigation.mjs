import { resolveNote } from './noteLinks.mjs';
export const noteUrl = id => '/app#knowledge-note='+encodeURIComponent(String(id));
export function noteIdFromHash(hash) {
  const match = /^#knowledge-note=([^&]+)$/.exec(hash);
  if (!match) return null;
  try { return decodeURIComponent(match[1]); } catch { return null; }
}
export function wikiLinkRanges(text, notes) {
  const ranges=[];
  const code=[...text.matchAll(/`+[^`]*`+/g)].map(match=>[match.index,match.index+match[0].length]);
  for (const match of text.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
    if(code.some(([from,to])=>match.index>=from&&match.index<to))continue;
    const target=match[1].split('|')[0].split('#')[0].trim();
    const note=resolveNote(notes,target);
    if(note)ranges.push({from:match.index,to:match.index+match[0].length,id:String(note.id),href:noteUrl(note.id)});
  }
  return ranges;
}
