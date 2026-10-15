window.NistReminderSchedule = {
  refresh(prefix) {
    const field=suffix=>document.getElementById(prefix+suffix);
    const out=field('SchedulePreview');if(!out)return;
    const days=Number(field('Days').value),every=Number(field('RepeatEvery').value),max=Number(field('MaxDeliveries').value);
    const repeat=field(prefix==='policySmtp'?'Repeat':'RepeatDaily').checked;
    field('Days').max=field('StartUnit').value==='months'?'36':'365';
    field('RepeatEvery').max=field('RepeatUnit').value==='months'?'36':'365';
    const unit=value=>value==='months'?'bulan':'hari';
    let text=`Mulai H-${days} ${unit(field('StartUnit').value)}. `;
    text+=repeat?`Ulangi setiap ${every} ${unit(field('RepeatUnit').value)}, maksimal ${max} kali sampai hari H.`:'Kirim satu kali.';
    if (field('Unlimited')) {
      const unlimited=field('Unlimited').checked;
      field('MaxDeliveries').disabled=unlimited||field('Days').disabled;
      text= `Mulai H-${days} ${unit(field('StartUnit').value)}. ` + (repeat ? `Ulangi setiap ${every} ${unit(field('RepeatUnit').value)}, ${unlimited?'tanpa batas jumlah':`maksimal ${max} kali`}, ${field('ContinueOverdue').checked?'sampai Sudah dilaporkan termasuk setelah tenggat':'sampai hari H'}.` : 'Kirim satu kali sampai hari H.');
    }
    if(repeat&&field('StartUnit').value==='days'&&field('RepeatUnit').value==='days'&&every>0&&days>=0){
      const slots=Array.from({length:Math.min(Math.floor(days/every)+1,max,15)},(_,i)=>days-i*every).map(n=>n===0?'H':'H-'+n);
      text+=' Jadwal: '+slots.join(', ')+(Math.min(Math.floor(days/every)+1,max)>15?', …':'')+'.';
    }
    out.textContent=text;
  }
};
for(const prefix of ['policySmtp','aftReminder','crReminder']){
  for(const suffix of ['Days','StartUnit',prefix==='policySmtp'?'Repeat':'RepeatDaily','RepeatEvery','RepeatUnit','MaxDeliveries','Unlimited','ContinueOverdue']){
    const input=document.getElementById(prefix+suffix);input?.addEventListener('input',()=>window.NistReminderSchedule.refresh(prefix));input?.addEventListener('change',()=>window.NistReminderSchedule.refresh(prefix));
  }
  document.getElementById(prefix+'Preset30')?.addEventListener('click',()=>{
    for(const [suffix,value] of [['Days',30],['StartUnit','days'],['RepeatEvery',5],['RepeatUnit','days'],['MaxDeliveries',7]])document.getElementById(prefix+suffix).value=value;
    document.getElementById(prefix+(prefix==='policySmtp'?'Repeat':'RepeatDaily')).checked=true;
    if(prefix==='crReminder'){document.getElementById(prefix+'Unlimited').checked=false;document.getElementById(prefix+'ContinueOverdue').checked=false;}
    window.NistReminderSchedule.refresh(prefix);
  });
  window.NistReminderSchedule.refresh(prefix);
}
