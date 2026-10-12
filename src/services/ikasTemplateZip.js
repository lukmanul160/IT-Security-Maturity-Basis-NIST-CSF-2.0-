const zlib=require('node:zlib');
const crc32=require('crc-32');
function entries(buffer){
  let end=-1;
  for(let offset=buffer.length-22;offset>=Math.max(0,buffer.length-65557);offset--)if(buffer.readUInt32LE(offset)===0x06054b50&&offset+22+buffer.readUInt16LE(offset+20)===buffer.length){end=offset;break;}
  if(end<0)throw Error('Workbook ZIP tidak valid.');
  const count=buffer.readUInt16LE(end+10),centralOffset=buffer.readUInt32LE(end+16),rows=[];let offset=centralOffset,total=0;
  if(count===65535||centralOffset===0xffffffff)throw Error('Workbook ZIP64 tidak didukung.');
  for(let index=0;index<count;index++){
    if(buffer.readUInt32LE(offset)!==0x02014b50)throw Error('Direktori ZIP tidak valid.');
    const size=46+buffer.readUInt16LE(offset+28)+buffer.readUInt16LE(offset+30)+buffer.readUInt16LE(offset+32);
    const header=buffer.subarray(offset,offset+size),local=header.readUInt32LE(42),compressed=header.readUInt32LE(20),length=header.readUInt32LE(24);
    const name=header.subarray(46,46+header.readUInt16LE(28)).toString('utf8');
    if(header.readUInt16LE(8)&1)throw Error('Workbook terenkripsi tidak didukung.');
    total+=length;if(total>64*1024*1024)throw Error('Workbook terlalu besar setelah diekstrak.');
    if(buffer.readUInt32LE(local)!==0x04034b50)throw Error('Entry ZIP tidak valid.');
    const start=local+30+buffer.readUInt16LE(local+26)+buffer.readUInt16LE(local+28),payload=buffer.subarray(start,start+compressed);
    const method=header.readUInt16LE(10);
    const content=method===0?payload:method===8?zlib.inflateRawSync(payload,{maxOutputLength:64*1024*1024}):null;
    if(!content||content.length!==length||(crc32.buf(content)>>>0)!==header.readUInt32LE(16))throw Error('Entry ZIP rusak.');
    rows.push({name,header,local,start,method,content});offset+=size;
  }
  const sorted=[...rows].sort((a,b)=>a.local-b.local);sorted.forEach((row,index)=>row.raw=buffer.subarray(row.local,sorted[index+1]?.local??centralOffset));
  return {rows,sorted,end:buffer.subarray(end),prefix:buffer.subarray(0,sorted[0]?.local??0)};
}
function patch(buffer,changes){
  const zip=entries(buffer),locals=[zip.prefix],headers=new Map();let offset=zip.prefix.length;
  for(const row of zip.sorted){
    const central=Buffer.from(row.header);central.writeUInt32LE(offset,42);let raw=row.raw;
    if(changes.has(row.name)){
      const content=Buffer.from(changes.get(row.name),'utf8'),compressed=row.method===0?content:zlib.deflateRawSync(content),checksum=crc32.buf(content)>>>0;
      const local=Buffer.from(buffer.subarray(row.local,row.start)),flags=central.readUInt16LE(8)&~8;
      local.writeUInt16LE(flags,6);local.writeUInt32LE(checksum,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(content.length,22);
      central.writeUInt16LE(flags,8);central.writeUInt32LE(checksum,16);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(content.length,24);
      raw=Buffer.concat([local,compressed]);
    }
    locals.push(raw);headers.set(row.name,central);offset+=raw.length;
  }
  const directory=Buffer.concat(zip.rows.map(row=>headers.get(row.name))),end=Buffer.from(zip.end);
  end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,directory,end]);
}
module.exports={entries,patch};
