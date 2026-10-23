const groups = {
  danger: ['Belum dilaporkan','Belum selesai','Belum diisi','Belum lengkap','Belum dimulai','Belum ditugaskan','Tidak lengkap','Tidak memenuhi','Tidak tercapai','Ditolak','Terlambat','Lewat tenggat','Kedaluwarsa','Gagal','Terbuka','Draf','Draft','Open','Not started','Not reported','Unreported','Not submitted','Not completed','Incomplete','Not assigned','Not assessed','Unassessed','Pending','Rejected','Overdue','Expired','Failed','Blocked','Review required','Review due','Pending / pengesahan belum lengkap'],
  warning: ['Dalam proses','Sedang berjalan','Sedang diproses','Menunggu persetujuan','Menunggu verifikasi','Perlu ditinjau','Dalam peninjauan','Sebagian','In progress','In process','In treatment','Ongoing','Under review','In review','Pending approval','Pending verification','Pending closure','Monitoring','Assessed','Approved with conditions','Due soon','Needs attention','Planned','Scheduled','Direncanakan','Dijadwalkan','Menunggu','Waiting','Diajukan','Ditinjau','Realisasi','Reviewed','Realizing','Menunggu review / persetujuan','Bersyarat','Assigned','Ditugaskan'],
  success: ['Sudah dilaporkan','Telah dilaporkan','Selesai','Sudah selesai','Sudah diisi','Telah diisi','Lengkap','Tercapai','Memenuhi','Disetujui','Diterima','Terverifikasi','Ditutup','Aktif','Complete','Completed','Done','Closed','Legacy closed','Reported','Submitted','Filled','Approved','Accepted','Verified','Resolved','Final','Active','Implemented','Compliant','Achieved','Up to date','Public link active','Tautan publik aktif'],
  neutral: ['Tidak berlaku','Tidak diterapkan','Dibatalkan','Nonaktif','N/A','Not applicable','Not required','Cancelled','Canceled','Inactive','Disabled','Offboarded','Terminated','Archived','Public link inactive','Tautan publik nonaktif']
};
const normalize = value => String(value ?? '').trim().toLocaleLowerCase().replace(/[_–—-]+/g,' ').replace(/\s+/g,' ');
const tones = new Map(Object.entries(groups).flatMap(([tone, labels]) => labels.map(label => [normalize(label), tone])));
export function statusTone(value) {
  const text = normalize(value);
  if (/^(?:100|[0-9]{1,2})(?:[.,][0-9]+)?%$/.test(text)) {
    const percent = Number(text.replace('%','').replace(',','.'));
    if (percent <= 100) return percent === 100 ? 'success' : percent === 0 ? 'danger' : 'warning';
  }
  return tones.get(text) || null;
}

const badgeSelector = '[data-status-color],.status-badge,.status-chip,.gap-status,.certification-card-status,[class*="status-pill"],[class*="status-tag"],.compliance-overdue,.risk-workflow-status,[data-workflow-status],[class*="status"],.badge,.ra-badge,.status-color-badge,.pill';
const excluded = '.policy-word-editor,.statement-word-editor,.ProseMirror,[contenteditable="true"],textarea,option,script,style';
const headerPattern = /status|workflow|approval|completion|kelengkapan|pengisian|persetujuan|tahap|hasil|decision|keputusan|progress|progres|penyelesaian/;
function paint(node, tone) {
  if (tone) {
    if (node.dataset.statusTone !== tone) node.dataset.statusTone = tone;
  } else if (node.hasAttribute('data-status-tone')) node.removeAttribute('data-status-tone');
}
// Badge wrappers are limited to plain-text cells; existing rich cells keep their markup.
export function refreshStatusColors(root = document) {
  for (const node of root.querySelectorAll(badgeSelector)) {
    if (!node.closest(excluded)) {
      const text = node.textContent.trim();
      const badge = node.matches('[data-status-color],.status-badge,.status-chip,.gap-status,.certification-card-status,.ra-badge,.status-color-badge');
      const semanticTone = node.matches('.status-danger,.status-alert,.ra-rejected,.ra-pending') ? 'danger'
        : node.matches('.status-warning,.ra-conditional') ? 'warning'
        : node.matches('.status-ok,.ra-approved') ? 'success' : null;
      const otherScale = /^(?:very low|low|medium|high|very high|critical|rendah|sedang|tinggi|kritis|applicable|not applicable)$/i.test(text);
      paint(node, statusTone(text) || semanticTone || (!otherScale && badge && text && text.length <= 60 ? 'neutral' : null));
    }
  }
  for (const table of root.querySelectorAll('table')) {
    const headerRows = table.tHead?.rows;
    if (!headerRows?.length) continue;
    const grid = [];
    for (let r=0;r<headerRows.length;r++) {
      grid[r] ||= [];
      let column=0;
      for (const cell of headerRows[r].cells) {
        while (grid[r][column] !== undefined) column++;
        for (let y=r;y<r+cell.rowSpan;y++) {
          grid[y] ||= [];
          for (let x=column;x<column+cell.colSpan;x++) grid[y][x] = normalize(cell.textContent);
        }
        column += cell.colSpan;
      }
    }
    const headers = grid[headerRows.length-1];
    for (const body of table.tBodies) for (const row of body.rows) {
      let index=0;
      for (const cell of row.cells) {
        const isStatus = headerPattern.test(headers[index] || '');
        index += cell.colSpan;
        if (cell.colSpan !== 1 || cell.closest(excluded)) continue;
        const controls = cell.querySelector('button,input,select,textarea,a');
        if (isStatus && !controls) {
          const tone = statusTone(cell.textContent);
          const label = cell.textContent.trim();
          const cellTone = tone || (label && label.length <= 60 && !/[0-9]/.test(label) && label !== '-' ? 'neutral' : null);
          paint(cell, cellTone);
          if (cellTone && cell.childNodes.length === 1 && cell.firstChild.nodeType === 3) {
            const badge = cell.ownerDocument.createElement('span');
            badge.className = 'status-color-badge';
            badge.appendChild(cell.firstChild);
            cell.appendChild(badge);
          }
          // Some workflow cells contain a stage and a separate assessment status.
          for (const child of cell.querySelectorAll('span,strong,small')) {
            if (child.children.length) continue;
            paint(child, statusTone(child.textContent) || (child.textContent.trim() === label ? cellTone : null));
          }
        } else paint(cell, null);
      }
    }
  }
  for (const select of root.querySelectorAll('select')) {
    if (select.closest(excluded)) continue;
    const context = [select.name, select.id, select.getAttribute('aria-label'), select.closest('label')?.firstChild?.textContent].join(' ');
    if (/status|workflow|approval|completion|kelengkapan|persetujuan|tahap|hasil/i.test(context)) {
      paint(select, statusTone(select.selectedOptions[0]?.textContent));
    }
  }
}
export function installStatusColors(root = document) {
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; refreshStatusColors(root); });
  };
  const observer = new MutationObserver(schedule);
  observer.observe(root.body || root, { childList: true, subtree: true, characterData: true });
  root.addEventListener('change', schedule);
  window.addEventListener('nist:language-change', schedule);
  refreshStatusColors(root);
  return () => { observer.disconnect(); root.removeEventListener('change',schedule); window.removeEventListener('nist:language-change',schedule); };
}
