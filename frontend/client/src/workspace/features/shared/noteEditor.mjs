export function formatSelection(content, start, end, kind) {
  const selected = content.slice(start,end);
  const wrappers = {bold:['**','**'],italic:['*','*'],strike:['~~','~~'],code:['`','`'],link:['[','](https://example.com)'],wiki:['[[',']]'],codeblock:['```\n','\n```']};
  if(wrappers[kind]) {
    const [before,after]=wrappers[kind], text=selected||'teks';
    return {content:content.slice(0,start)+before+text+after+content.slice(end),start:start+before.length,end:start+before.length+text.length};
  }
  const prefixes={heading:'# ',subheading:'## ',bullet:'- ',ordered:'1. ',quote:'> ',task:'- [ ] '};
  const prefix=prefixes[kind];
  if(!prefix) return {content,start,end};
  const lineStart=content.lastIndexOf('\n',start-1)+1;
  const next=content.indexOf('\n',end), lineEnd=next<0?content.length:next;
  const text=content.slice(lineStart,lineEnd).split('\n').map((line,i)=>(kind==='ordered'?`${i+1}. `:prefix)+line).join('\n');
  return {content:content.slice(0,lineStart)+text+content.slice(lineEnd),start:lineStart,end:lineStart+text.length};
}
export function inlineTokens(text) {
  const pattern=/(\[\[[^\]\n]+\]\]|`[^`]+`|\*\*[^*]+\*\*|~~[^~]+~~|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  return text.split(pattern).filter(Boolean).map(value=>{
    if(value.startsWith('[[')&&value.endsWith(']]'))return {type:'wiki',text:value.slice(2,-2).split('|').pop(),target:value.slice(2,-2).split('|')[0].split('#')[0].trim()};
    if(value.startsWith('`'))return {type:'code',text:value.slice(1,-1)};
    if(value.startsWith('**'))return {type:'bold',text:value.slice(2,-2)};
    if(value.startsWith('~~'))return {type:'strike',text:value.slice(2,-2)};
    if(value.startsWith('*'))return {type:'italic',text:value.slice(1,-1)};
    const link=value.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if(link) return {type:/^https?:\/\//i.test(link[2])?'link':'text',text:link[1],target:link[2]};
    return {type:'text',text:value};
  });
}
export function previewBlocks(content) {
  let inCode=false;
  return content.split('\n').map(line=>{
    if(line.startsWith('```')){inCode=!inCode;return {type:'separator',tokens:[]};}
    if(inCode)return {type:'codeblock',tokens:[{type:'text',text:line}]};
    const heading=line.match(/^(#{1,6})\s+(.*)$/);
    if(heading)return {type:'h'+heading[1].length,tokens:inlineTokens(heading[2])};
    const task=line.match(/^- \[([ xX])\] (.*)$/);
    if(task)return {type:'task',tokens:inlineTokens((task[1]===' '?'☐ ':'☑ ')+task[2])};
    if(/^> /.test(line))return {type:'blockquote',tokens:inlineTokens(line.slice(2))};
    if(/^- /.test(line))return {type:'p',tokens:inlineTokens('• '+line.slice(2))};
    return {type:'p',tokens:inlineTokens(line)};
  });
}
