// Directory imports read notes only; configuration files and assets are ignored.
export async function collectDirectoryFiles(directory, parent = '', { onUnreadable, onFolder = () => {} } = {}) {
  const prefix = [parent,directory.name].filter(Boolean).join('/');
  onFolder(prefix);
  const files = [];
  try { for await (const entry of directory.values()) {
    const entryPath = prefix+'/'+entry.name;
    try {
    if (entry.kind === 'directory') {
      files.push(...await collectDirectoryFiles(entry,prefix,{onUnreadable,onFolder}));
    } else if (entry.kind === 'file') {
      if (!/\.(md|txt|png|jpe?g|gif|webp)$/i.test(entry.name)) continue;
      const file = await entry.getFile();
      files.push({ name:file.name,size:file.size,webkitRelativePath:prefix+'/'+file.name,text:()=>file.text(),originalFile:file });
    }
    } catch (error) { if (!onUnreadable) throw error; onUnreadable(entryPath,error); }
  }} catch (error) { if (!onUnreadable) throw error; onUnreadable(prefix,error); }
  return files;
}
export async function readNoteImport(files, destination = '', { onSkipped = () => {}, onUnreadable, onProgress = () => {}, onReading = () => {}, readTimeoutMs = 30000, folderPaths = [] } = {}) {
  const directory = files.some(file => Boolean(file.webkitRelativePath));
  const selected = directory ? files.filter(file => {
    const supported = /\.(md|txt)$/i.test(file.name);
    if (!supported) onSkipped(file.webkitRelativePath || file.name);
    return supported;
  }) : files;
  if (!selected.length && !folderPaths.length) throw new Error('Folder tidak berisi file .md atau .txt yang dapat diimpor.');
  if (selected.length > 200 || selected.reduce((sum,file)=>sum+file.size,0) > 6000000) throw new Error('Impor maksimal 200 file catatan / total 6 MB.');
  const notes = [], folders = folderPaths.map(folder=>[destination,folder].filter(Boolean).join('/'));
  const unreadablePaths = [];
  for(const file of selected)if(file.size>1000000)throw new Error(`File ${file.name} melebihi batas 1 MB.`);
  const reads=new Array(selected.length);
  let next=0,completed=0,readFailure;
  await Promise.all(Array.from({length:Math.min(8,selected.length)},async()=>{
    while(next<selected.length){
      const index=next++,file=selected[index];
      if(readFailure){reads[index]={error:readFailure};continue;}
      onReading({completed,total:selected.length,path:file.webkitRelativePath||file.name});
      let timer;
      try{
        const text=await Promise.race([Promise.resolve().then(()=>file.text()),new Promise((_,reject)=>{
          timer=setTimeout(()=>{readFailure=new Error(`Pembacaan file melewati ${readTimeoutMs/1000} detik. Pastikan file tersedia secara lokal, lalu coba impor ulang.`);reject(readFailure);},readTimeoutMs);
        })]);
        reads[index]={text:text.replace(/^\uFEFF/,'')};
      }
      catch(error){reads[index]={error};}
      finally{clearTimeout(timer);}
      onProgress({completed:++completed,total:selected.length,path:file.webkitRelativePath||file.name});
    }
  }));
  for (const [index,file] of selected.entries()) {
    let text;
    try { if(reads[index].error)throw reads[index].error;text=reads[index].text; }
    catch (error) { const failedPath=file.webkitRelativePath || file.name; unreadablePaths.push(failedPath); if(onUnreadable)onUnreadable(failedPath,error); continue; }
    if (!directory && /\.json$/i.test(file.name)) {
      const data = JSON.parse(text);
      if (!Array.isArray(data.notes)) throw new Error('JSON harus berisi daftar notes.');
      notes.push(...data.notes);
      if (data.folders !== undefined) {
        if (!Array.isArray(data.folders)) throw new Error('Daftar folder JSON tidak valid.');
        folders.push(...data.folders);
      }
    } else if (/\.(md|txt)$/i.test(file.name)) {
      const parent = file.webkitRelativePath ? file.webkitRelativePath.split('/').slice(0,-1).join('/') : '';
      const folder = [destination,parent].filter(Boolean).join('/');
      notes.push({title:file.name.replace(/\.(md|txt)$/i,''), content:text, folder});
      if (folder) folders.push(folder);
    } else throw new Error('Pilih file .md, .txt, atau backup .json.');
  }
  if (unreadablePaths.length) throw new Error('Impor dibatalkan; belum ada file atau folder yang disimpan. File gagal dibaca: '+unreadablePaths.join(', '));
  if (notes.length > 200) throw new Error('Impor maksimal 200 catatan sekaligus.');
  if (!notes.length && !folders.length) throw new Error('Tidak ada catatan yang berhasil dibaca. Coba Pilih folder alternatif atau salin folder ke penyimpanan lokal.');
  return {notes,folders:[...new Set(folders)]};
}
