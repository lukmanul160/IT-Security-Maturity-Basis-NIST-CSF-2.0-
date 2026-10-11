const defaults = { daysBefore: 7, repeatDaily: false, startUnit: 'days', repeatEvery: 1, repeatUnit: 'days', maxDeliveries: 366 };
function localDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
// Calendar arithmetic keeps month-end reminders in the target month.
function shiftDate(value, amount, unit) {
  const date = new Date(`${value}T12:00:00Z`);
  if (unit === 'months') {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + amount);
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, last));
  } else date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
function scheduleSlot(due, options, now = new Date()) {
  const settings = { ...defaults, ...options };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due || '')) return null;
  const parsed = new Date(`${due}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== due) return null;
  const today = localDate(now);
  const start = shiftDate(due, -settings.daysBefore, settings.startUnit);
  if (today < start || (today > due && !settings.continueOverdue)) return null;
  if (!settings.repeatDaily) return start;
  let slot = start;
  for (let index = 1; ; index++) {
    // Anchor matching units to the due date so February does not shift later reminders.
    const next = settings.startUnit === settings.repeatUnit
      ? shiftDate(due, -settings.daysBefore + index * settings.repeatEvery, settings.repeatUnit)
      : shiftDate(start, index * settings.repeatEvery, settings.repeatUnit);
    if (next > today || (next > due && !settings.continueOverdue)) break;
    slot = next;
  }
  return slot;
}
function validateSchedule(data) {
  const invalid=()=>{throw Object.assign(new Error('Jadwal reminder tidak valid. Gunakan H-0 sampai H-365 hari (atau 36 bulan), interval 1–365 hari (atau 36 bulan), dan maksimum 1–366 pengiriman.'),{status:400});};
  if (!['days','months'].includes(data.startUnit) || !['days','months'].includes(data.repeatUnit)) invalid();
  if (!Number.isInteger(data.daysBefore)||data.daysBefore<0||data.daysBefore>(data.startUnit==='months'?36:365)) invalid();
  if (!Number.isInteger(data.repeatEvery)||data.repeatEvery<1||data.repeatEvery>(data.repeatUnit==='months'?36:365)) invalid();
  if (!Number.isInteger(data.maxDeliveries)||data.maxDeliveries<1||data.maxDeliveries>366||typeof data.repeatDaily!=='boolean') invalid();
  return Object.fromEntries(['daysBefore','startUnit','repeatDaily','repeatEvery','repeatUnit','maxDeliveries'].map(key=>[key,data[key]]));
}
module.exports = { localDate, scheduleSlot, validateSchedule };
