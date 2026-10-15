// Canvas shortcuts must leave text editing and modal forms to the browser.
export function canvasShortcut(event) {
  if (event.defaultPrevented || event.isComposing || event.altKey || event.target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]')) return null;
  const key = event.key.toLowerCase(), command = event.ctrlKey || event.metaKey;
  if (command) return ({z: event.shiftKey ? 'redo' : 'undo', y:'redo', s:'save', d:'duplicate', c:'copy', v:'paste'})[key] || null;
  if (key === 'delete' || key === 'backspace') return 'delete';
  if (key === 'escape') return 'escape';
  return ({arrowleft:'left', arrowright:'right', arrowup:'up', arrowdown:'down'})[key] || null;
}
