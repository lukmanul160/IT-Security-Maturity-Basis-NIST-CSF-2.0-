import { createApp, nextTick } from 'vue';
import App from './App.vue';
import './vue-shell.css';
import workspaceEnhancements from './workspace/generated/enhancements.js?raw';
import workspaceRuntime from './workspace/runtime.js?raw';
import { bootstrapWorkspaceRuntime } from './services/workspaceRuntime';

async function bootstrap() {
  createApp(App).mount('#app');
  await nextTick();
  await bootstrapWorkspaceRuntime({ app: workspaceRuntime, enhancements: workspaceEnhancements });
  document.documentElement.dataset.frontend = 'vue';
  window.dispatchEvent(new CustomEvent('vue:workspace-ready'));
}

bootstrap().catch(error => {
  console.error('[vue] Workspace bootstrap failed', error);
  const root = document.getElementById('app');
  if (root) root.innerHTML = `<main class="vue-bootstrap-error"><h1>Workspace gagal dimuat</h1><p>${String(error?.message || error)}</p><button type="button" onclick="location.reload()">Muat ulang</button></main>`;
});
