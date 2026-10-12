// Shared by browser and Node tests. Hierarchy and weights follow the supplied workbook.
(function(root){
  const truncate=value=>Math.floor((value+1e-10)*100)/100;
  const average=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;
  const level=value=>value===null?'INPUT BELUM LENGKAP':value<=1.5?'Level 1 - Awal':value<=2.5?'Level 2 - Berulang':value<=3.5?'Level 3 - Terdefinisi':value<=4.5?'Level 4 - Terkelola':'Level 5 - Inovatif';
  function summarize(controls,state={}) {
    const domains=new Map(),categories=new Map(),subcategories=new Map();
    for(const row of controls){
      const categoryKey=row.function+'|'+row.category;
      const subKey=categoryKey+'|'+(row.ikas?.subcategoryId||row.id.match(/^IKAS-(\d+\.\d+\.\d+)/)?.[1]||row.id);
      if(!domains.has(row.function))domains.set(row.function,{name:row.function,weight:row.ikas?.weight??({'IDENTIFIKASI':.25,'PROTEKSI':.30,'DETEKSI':.25,'PENANGGULANGAN DAN PEMULIHAN':.20}[row.function]||0),categories:[]});
      if(!categories.has(categoryKey)){const group={name:row.category,domain:row.function,subcategories:[]};categories.set(categoryKey,group);domains.get(row.function).categories.push(group);}
      if(!subcategories.has(subKey)){const group={id:subKey,controls:[]};subcategories.set(subKey,group);categories.get(categoryKey).subcategories.push(group);}
      subcategories.get(subKey).controls.push(row);
    }
    const score=row=>state.scores?.[row.id]??null;
    for(const group of subcategories.values()){
      const applicable=group.controls.filter(row=>row.applicability!=='Not applicable');
      group.complete=applicable.every(row=>Number.isInteger(score(row))&&score(row)>=0&&score(row)<=5);
      group.score=group.complete?average(applicable.map(score)):null;
    }
    for(const group of categories.values()){
      group.complete=group.subcategories.every(row=>row.complete);
      group.score=group.complete?average(group.subcategories.map(row=>row.score).filter(value=>value!==null)):null;
    }
    for(const group of domains.values()){
      const value=average(group.categories.map(row=>row.score).filter(value=>value!==null));
      group.score=value===null?null:truncate(value);group.level=level(group.score);
    }
    const complete=categories.size>0&&[...categories.values()].every(row=>row.complete)&&domains.size===4&&[...domains.values()].every(row=>row.score!==null);
    const overall=complete?truncate([...domains.values()].reduce((sum,row)=>sum+row.score*row.weight,0)):null;
    const applicable=controls.filter(row=>row.applicability!=='Not applicable');
    const scored=applicable.filter(row=>score(row)!==null).length;
    return {overall,level:level(overall),complete,scored,total:applicable.length,domains:[...domains.values()],categories:[...categories.values()]};
  }
  function normalize(source={}) {
    const notes={},attachments={};
    const idFor=key=>key.replace(/^(?:policy|practice)-/,'');
    for(const [key,value] of Object.entries(source.notes||{})){
      const id=idFor(key),text=typeof value==='string'?value:'';
      if(!Object.hasOwn(notes,id))notes[id]=text;
      else if(text&&notes[id]!==text&&!notes[id].split('\n\n').includes(text))notes[id]=[notes[id],text].filter(Boolean).join('\n\n');
    }
    for(const [key,values] of Object.entries(source.attachments||{})){
      const id=idFor(key),files=attachments[id]??=[];
      for(const file of Array.isArray(values)?values:values?[values]:[])if(!files.some(existing=>existing.path===file.path))files.push(file);
    }
    return {scores:{...source.practiceScores,...source.scores},notes,attachments,targetScores:{...source.targetScores},respondent:{...source.respondent}};
  }
  const api={summarize,level,normalize};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.IkasScoring=api;
})(typeof window!=='undefined'?window:globalThis);
