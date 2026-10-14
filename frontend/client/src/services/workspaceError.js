export function renderWorkspaceError(root, error, reload = () => window.location.reload()) {
  root.inert=false;root.removeAttribute('aria-busy');
  const panel=document.createElement('main');panel.className='vue-bootstrap-error';
  const title=document.createElement('h1');title.textContent='Workspace gagal dimuat';
  const message=document.createElement('p');message.textContent=String(error?.message || error);
  const button=document.createElement('button');button.type='button';button.textContent='Muat ulang';button.addEventListener('click',reload);
  panel.append(title,message,button);root.replaceChildren(panel);
}
