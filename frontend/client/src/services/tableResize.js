const MIN_WIDTH = 64, MAX_WIDTH = 2000;
const STORAGE_PREFIX = 'nist-table-widths:v1:';
const clamp = width => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(width)));
const visibleCell = cell => !cell.hidden && cell.style?.display !== 'none' && cell.ownerDocument?.defaultView?.getComputedStyle(cell).display !== 'none';

// Resolve leaf columns, including headers with rowspan/colspan.
export function tableHeaderLayout(table) {
  const grid = [], boundaries = new Map(); let count = 0;
  for (const [rowIndex, row] of [...(table.tHead?.rows || [])].entries()) {
    grid[rowIndex] ||= []; let column = 0;
    for (const cell of row.cells) {
      if (!visibleCell(cell)) continue;
      while (grid[rowIndex][column]) column++;
      const span = Math.max(1, cell.colSpan || 1), height = Math.max(1, cell.rowSpan || 1);
      for (let y = rowIndex; y < rowIndex + height; y++) {
        grid[y] ||= [];
        for (let x = column; x < column + span; x++) grid[y][x] = cell;
      }
      boundaries.set(column + span - 1, cell);
      column += span; count = Math.max(count, column);
    }
  }
  return { count, boundaries, grid };
}

export function installTableResize() {
  if (window.__NIST_TABLE_RESIZE__) return;
  window.__NIST_TABLE_RESIZE__ = true;
  const states = new WeakMap(); let scheduled = false, dragging = null;
  const canvas = document.createElement('canvas'), measure = canvas.getContext('2d');
  function identity(table) {
    if (table.dataset.resizeKey) return table.dataset.resizeKey;
    if (table.id) return `table:${table.id}`;
    const bodyId = [...table.tBodies].find(body => body.id)?.id;
    if (bodyId) return `body:${bodyId}`;
    const owner = table.parentElement?.closest('[id]');
    if (!owner) return null;
    const index = [...owner.querySelectorAll('table')].filter(row => row.parentElement.closest('[id]') === owner).indexOf(table);
    return `owner:${owner.id}:${index}`;
  }
  function savedWidths(key, count) {
    if (!key) return null;
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_PREFIX + key) || 'null');
      return value?.count === count && Array.isArray(value.widths) && value.widths.length === count && value.widths.every(width => Number.isFinite(width)) ? value.widths.map(clamp) : null;
    } catch { return null; }
  }
  function persist(state) {
    if (!state.key) return;
    try { localStorage.setItem(STORAGE_PREFIX + state.key, JSON.stringify({ count: state.widths.length, widths: state.widths })); } catch { /* Resizing still works when storage is unavailable. */ }
  }
  function apply(state) {
    state.cols.forEach((col, index) => col.style.setProperty('width', `${state.widths[index]}px`, 'important'));
    state.table.style.setProperty('width', `${state.widths.reduce((sum, width) => sum + width, 0)}px`, 'important');
    for (const [index, handle] of state.handles) handle.setAttribute('aria-valuenow', String(state.widths[index]));
  }
  function autoFit(state, index) {
    let width = MIN_WIDTH;
    for (const row of [...state.table.rows].slice(0, 201)) {
      let position = 0;
      for (const cell of row.cells) {
        if (!visibleCell(cell)) continue;
        const span = Math.max(1, cell.colSpan || 1);
        if (position === index && span === 1) {
          const style = getComputedStyle(cell);
          measure.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          const text = cell.textContent.trim().slice(0, 2000);
          const natural = Math.max(...text.split('\n').map(line => measure.measureText(line).width), 0);
          width = Math.max(width, natural + (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0) + 28);
        }
        position += span;
      }
    }
    state.widths[index] = clamp(Math.min(900, width)); apply(state); persist(state);
  }
  function finish(cancel = false) {
    if (!dragging) return;
    const current = dragging; dragging = null;
    if (cancel) { current.state.widths = current.original; apply(current.state); }
    else persist(current.state);
    document.body.classList.remove('nr-column-dragging');
    try { if (current.handle.hasPointerCapture(current.pointerId)) current.handle.releasePointerCapture(current.pointerId); } catch {}
  }
  document.addEventListener('pointermove', event => {
    if (!dragging || event.pointerId !== dragging.pointerId) return;
    event.preventDefault();
    dragging.state.widths[dragging.index] = clamp(dragging.startWidth + event.clientX - dragging.startX);
    apply(dragging.state);
  }, { passive: false });
  document.addEventListener('pointerup', event => { if (event.pointerId === dragging?.pointerId) finish(); });
  document.addEventListener('pointercancel', event => { if (event.pointerId === dragging?.pointerId) finish(true); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && dragging) { event.preventDefault(); finish(true); } }, true);
  window.addEventListener('blur', () => finish());
  function handles(state, layout) {
    state.handles = new Map();
    state.table.querySelectorAll('.nr-column-handle').forEach(handle => { if (handle.closest('table') === state.table) handle.remove(); });
    for (const [index, header] of layout.boundaries) {
      const handle = document.createElement('span');
      handle.className = 'nr-column-handle'; handle.tabIndex = 0;
      handle.setAttribute('role', 'separator'); handle.setAttribute('aria-orientation', 'vertical');
      handle.setAttribute('aria-label', `Lebar kolom: ${header.textContent.trim() || index + 1}`);
      handle.setAttribute('aria-valuemin', String(MIN_WIDTH)); handle.setAttribute('aria-valuemax', String(MAX_WIDTH));
      handle.title = 'Geser untuk mengubah lebar; klik dua kali untuk menyesuaikan isi';
      handle.dataset.columnIndex = String(index);
      if (getComputedStyle(header).position === 'static') header.classList.add('nr-column-header-static');
      header.classList.add('nr-column-header'); header.appendChild(handle); state.handles.set(index, handle);
      handle.addEventListener('pointerdown', event => {
        if (event.button !== 0 || !state.widths) return;
        event.preventDefault(); event.stopPropagation(); finish();
        dragging = { state, index, handle, startX:event.clientX, startWidth:state.widths[index], original:[...state.widths], pointerId:event.pointerId };
        handle.setPointerCapture(event.pointerId); handle.focus({ preventScroll:true }); document.body.classList.add('nr-column-dragging');
      });
      handle.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); });
      handle.addEventListener('dblclick', event => { event.preventDefault(); event.stopPropagation(); autoFit(state,index); });
      handle.addEventListener('keydown', event => {
        if (['ArrowLeft','ArrowRight'].includes(event.key)) {
          event.preventDefault(); event.stopPropagation();
          state.widths[index] = clamp(state.widths[index] + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 50 : 10));
          apply(state); persist(state);
        } else if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); autoFit(state,index); }
      });
    }
    state.headers = [...layout.boundaries.values()];
  }
  function initialize(table) {
    if (!table.tHead || table.closest('[contenteditable="true"],.tiptap') || table.dataset.tableResize === 'off') return;
    const layout = tableHeaderLayout(table); if (!layout.count || !table.getClientRects().length) return;
    let state = states.get(table);
    if (state?.cols.length === layout.count) {
      if ([...layout.boundaries.values()].some((header,index) => header !== state.headers[index]) || [...state.handles.values()].some(handle => !handle.isConnected)) { handles(state,layout); apply(state); }
      return;
    }
    if (state) { if (dragging?.state === state) finish(true); state.tools.remove(); state.group.remove(); }
    const key = identity(table);
    const widths = Array.from({length:layout.count},(_,index) => {
      const leaf = layout.grid[layout.grid.length-1]?.[index];
      return clamp((leaf?.getBoundingClientRect().width || 140) / Math.max(1,leaf?.colSpan || 1));
    });
    if (table.querySelector('#policyRegisterBody') && layout.count === 9) widths.splice(0,9,340,180,220,150,180,140,280,280,160);
    if ([...table.tBodies].some(body => body.id === 'aftBody')) {
      const defaults = [420,220,150,150,680,240];
      const allHeaders = [...table.tHead.rows[0].cells];
      widths.splice(0,widths.length,...allHeaders.map((header,index)=>({header,width:defaults[index]||180})).filter(item=>visibleCell(item.header)).map(item=>item.width));
    }
    let wrapper = table.parentElement;
    if (wrapper.querySelectorAll(':scope > table').length > 1 || (!wrapper.matches('.excel-wrap,.nr-table-scroll') && !['auto','scroll'].includes(getComputedStyle(wrapper).overflowX))) {
      const scroll = document.createElement('div'); scroll.className = 'nr-table-scroll'; wrapper.insertBefore(scroll,table); scroll.appendChild(table); wrapper = scroll;
    }
    wrapper.classList.add('nr-table-container');
    const group = table.querySelector(':scope > colgroup') || document.createElement('colgroup');
    table.querySelectorAll(':scope > colgroup').forEach(other => { if (other !== group) other.remove(); });
    group.replaceChildren(...widths.map(() => document.createElement('col'))); if (!group.parentElement) table.insertBefore(group,table.tHead);
    const tools = document.createElement('div'); tools.className = 'nr-table-tools';
    const hint = document.createElement('span'); hint.textContent = 'Geser batas kolom untuk mengatur lebar. Klik dua kali untuk menyesuaikan isi.';
    const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'button button-quiet nr-table-reset'; reset.textContent = 'Reset lebar';
    tools.append(hint,reset); wrapper.before(tools);
    state = { table,key,wrapper,group,tools,cols:[...group.children],defaultWidths:[...widths],widths:savedWidths(key,layout.count) || widths,handles:new Map() };
    states.set(table,state); table.classList.add('nr-resizable-table'); handles(state,layout); apply(state);
    reset.addEventListener('click', () => { if (dragging?.state === state) finish(true); state.widths = [...state.defaultWidths]; apply(state); try { localStorage.removeItem(STORAGE_PREFIX+state.key); } catch {} });
  }
  function scan() {
    scheduled = false;
    if (dragging && !dragging.state.table.isConnected) finish();
    document.querySelectorAll('table').forEach(initialize);
    document.querySelectorAll('.nr-table-tools').forEach(tools => { if (!tools.nextElementSibling?.querySelector('table.nr-resizable-table')) tools.remove(); });
  }
  function schedule() { if (!scheduled) { scheduled = true; requestAnimationFrame(scan); } }
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden','open']});
  window.addEventListener('resize',schedule); window.addEventListener('vue:workspace-ready',schedule);
  schedule();
}
