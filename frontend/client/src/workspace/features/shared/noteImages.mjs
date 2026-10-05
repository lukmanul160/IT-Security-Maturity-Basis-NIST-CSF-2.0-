export const imageUrl=id=>'/api/knowledge-notes/images/'+encodeURIComponent(id);
export const isImageFile=name=>/\.(png|jpe?g|gif|webp)$/i.test(name);
function normalize(path){const result=[];for(const part of path.split('/')){if(!part||part==='.')continue;if(part==='..'){if(!result.length)return null;result.pop();}else result.push(part);}return result.join('/');}
export function resolveImage(images,target,folder=''){
 const value=target.split('|')[0].trim();
 const relative=normalize([folder,value].filter(Boolean).join('/'));
 const exact=images.find(image=>image.path===relative)||images.find(image=>image.path===normalize(value));
 if(exact)return exact;
 const matches=images.filter(image=>image.path.split('/').pop()===value);
 return matches.length===1?matches[0]:undefined;
}
const outsideCode=(content,transform)=>content.split(/(`{3,}[\s\S]*?`{3,}|~{3,}[\s\S]*?~{3,}|`+[^`]*`+)/g).map((part,index)=>index%2?part:transform(part)).join('');
export function displayImageMarkdown(content,images,folder=''){
 return outsideCode(content,part=>part.replace(/!\[\[([^\]\n]+)\]\]/g,(original,target)=>{
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
