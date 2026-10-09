const dimensions=['confidentiality','integrity','availability'];
function assess(data){
 if(!data||typeof data!=='object'||Array.isArray(data)||![...dimensions,'likelihood'].every(key=>Number.isInteger(data[key])&&data[key]>=1&&data[key]<=5))throw Object.assign(new Error('Assessment CIA dan kemungkinan kejadian harus bernilai 1-5.'),{status:400});
 const impact=Math.max(...dimensions.map(key=>data[key])),score=impact*data.likelihood;
 return Object.fromEntries([...dimensions.map(key=>[key,data[key]]),['likelihood',data.likelihood],['impact',impact],['score',score],['level',score<=4?'low':score<=12?'medium':'high']]);
}
module.exports={assess};
