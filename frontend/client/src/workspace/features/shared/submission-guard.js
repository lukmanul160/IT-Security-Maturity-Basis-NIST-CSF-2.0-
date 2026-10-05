// Lock the entire save operation, including uploads, detail writes and refreshes.
const pendingFormSubmissions = new WeakSet();
function guardFormSubmission(handler) {
  return async function (event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (pendingFormSubmissions.has(form)) return;
    pendingFormSubmissions.add(form);
    const buttons = [...form.elements].filter(control => control.type === 'submit');
    const disabled = buttons.map(button => button.disabled);
    const previousBusy = form.getAttribute('aria-busy');
    buttons.forEach(button => { button.disabled = true; });
    form.setAttribute('aria-busy', 'true');
    try {
      return await handler.call(this, event);
    } finally {
      pendingFormSubmissions.delete(form);
      buttons.forEach((button, index) => { button.disabled = disabled[index]; });
      if (previousBusy === null) form.removeAttribute('aria-busy');
      else form.setAttribute('aria-busy', previousBusy);
    }
  };
}
