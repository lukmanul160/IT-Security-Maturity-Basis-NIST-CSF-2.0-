export const imageUrl=id=>'/api/knowledge-notes/images/'+encodeURIComponent(id);
export const isImageFile=name=>/\.(png|jpe?g|gif|webp)$/i.test(name);
function normalize(path){const result=[];for(const part of path.split('/')){if(!part||part==='.')continue;if(part==='..'){if(!result.length)return null;result.pop();}else result.push(part);}return result.join('/');}
export function resolveImage(images,target,folder=''){
 let value=target.split('|')[0].trim().replace(/(?:\\)?[ \t]*\r?\n[ \t]*/g,' ').replaceAll('\\','/').replace(/\/ +/g,'/');
 try{value=decodeURIComponent(value);}catch{}
 const relative=normalize([folder,value].filter(Boolean).join('/'));
 const exact=images.find(image=>image.path===relative)||images.find(image=>image.path===normalize(value));
 if(exact)return exact;
 const normalized=normalize(value);
 const key=path=>path?.normalize('NFC').toLowerCase();
 const folded=images.filter(image=>key(image.path)===key(relative)||key(image.path)===key(normalized));
 if(folded.length===1)return folded[0];
 const matches=images.filter(image=>normalized&&(key(image.path)===key(normalized)||key(image.path).endsWith('/'+key(normalized))));
 return matches.length===1?matches[0]:undefined;
}
export function imageEmbedRanges(text,images,folder=''){
 const ranges=[];
 for(const match of text.matchAll(/!\[\[([^\]]+)\]\]/g)){
  const target=match[1];
  if(!isImageFile(target.split('|')[0].trim()))continue;
  const image=resolveImage(images,target,folder);
  if(!image)continue;
  const size=target.split('|')[1]||'';
  const width=/^\d+(?:x\d+)?$/.test(size)?Math.max(48,Math.min(1600,Number(size.split('x')[0]))):null;
  ranges.push({from:match.index,to:match.index+match[0].length,attrs:{src:imageUrl(image.id),alt:'gambar',width}});
 }
 return ranges;
}
const outsideCode=(content,transform)=>content.split(/(`{3,}[\s\S]*?`{3,}|~{3,}[\s\S]*?~{3,}|`+[^`]*`+)/g).map((part,index)=>index%2?part:transform(part)).join('');
// Markdown serializers escape brackets when an embed has not resolved yet.
// Restore these references before parsing them again when images become available.
export const normalizeImageReferences=content=>outsideCode(content,part=>part.replace(/!\\\[\\\[([\s\S]*?)\\\]\\\]/g,'![[$1]]'));
export function missingImageReferences(content,images,folder=''){
 const missing=new Set();
 outsideCode(normalizeImageReferences(content),part=>{for(const match of part.matchAll(/!\[\[([^\]]+)\]\]/g)){
  const path=match[1].split('|')[0].trim();
  if(isImageFile(path)&&!resolveImage(images,path,folder))missing.add(path);
 }return part;});
 return [...missing];
}
export function displayImageMarkdown(content,images,folder=''){
 return outsideCode(normalizeImageReferences(content),part=>part.replace(/!\[\[([^\]]+)\]\]/g,(original,target)=>{
  if(!isImageFile(target.split('|')[0].trim()))return original;
  const image=resolveImage(images,target,folder);const width=/^\d+(?:x\d+)?$/.test(target.split('|')[1]||'')?Math.max(48,Math.min(1600,Number(target.split('|')[1].split('x')[0]))):null;return image?'![gambar]('+imageUrl(image.id)+(width?' \"kn-width:'+width+'\"':'')+')':original;
 }).replace(/!\[([^\]\n]*)\]\(([^)\n]+)\)/g,(original,alt,target)=>{
  if(/^(?:https?:|data:|\/api\/)/i.test(target))return original;
  let path;try{path=decodeURIComponent(target.replace(/^<|>$/g,''));}catch{return original;}
  const image=resolveImage(images,path,folder);return image?'!['+alt+']('+imageUrl(image.id)+')':original;
 }));
}
export function restoreImageMarkdown(content,images){
 return outsideCode(content,part=>part.replace(/!\[([^\]\n]*)\]\(\/api\/knowledge-notes\/images\/([a-zA-Z0-9-]+)(?: \"([^\"]*)\")?\)/g,(original,alt,id,title)=>{
  const image=images.find(image=>image.id===id);const width=/(?:^| )kn-width:(\d+)(?: |$)/.exec(title||'');return image?'![['+image.path+(width?'|'+width[1]:'')+']]':original;
 }));
}
export function moveImageReferences(content,images,imageId,newPath,folder=''){
 return outsideCode(content,part=>part.replace(/!\[\[([^\]]+)\]\]/g,(original,target)=>{
  if(resolveImage(images,target,folder)?.id!==imageId)return original;
  const size=target.includes('|')?'|'+target.split('|').slice(1).join('|'):'';
  return '![['+newPath+size+']]';
 }).replace(/!\[([^\]\n]*)\]\(([^)\n]+)\)/g,(original,alt,target)=>{
  const match=/^(<[^>]+>|\S+)(.*)$/.exec(target);if(!match)return original;
  let path;try{path=decodeURIComponent(match[1].replace(/^<|>$/g,''));}catch{return original;}
  if(path===imageUrl(imageId))return original;
  if(resolveImage(images,path,folder)?.id!==imageId)return original;
  return '!['+alt+'](<'+newPath+'>'+match[2]+')';
 }));
}
