/* Copyright (c) 2026 Lukmanul Hakim (lukmanul160@gmail.com). */
import { createApp, nextTick } from 'vue';
import App from './App.vue';
import './vue-shell.css';
import './styles/workspace-theme.css';
import './styles/workspace-sidebar.css';
import './styles/module-transfer.css';
import workspaceEnhancements from './workspace/generated/enhancements.js?raw';
import workspaceRuntime from './workspace/runtime.js';
import { bootstrapWorkspaceRuntime } from './services/workspaceRuntime';

async function bootstrap() {
  createApp(App).mount('#app');
  await nextTick();
  window.NistI18n?.mount();
  await bootstrapWorkspaceRuntime({ app: workspaceRuntime, enhancements: workspaceEnhancements });
  document.documentElement.dataset.frontend = 'vue';
  window.NistI18n?.refresh();
  window.dispatchEvent(new CustomEvent('vue:workspace-ready'));
  document.getElementById('governanceLoading')?.remove();
}

bootstrap().catch(error => {
  console.error('[vue] Workspace bootstrap failed', error);
  document.getElementById('governanceLoading')?.remove();
  const root = document.getElementById('app');
  if (root) root.innerHTML = `<main class="vue-bootstrap-error"><h1>Workspace gagal dimuat</h1><p>${String(error?.message || error)}</p><button type="button" onclick="location.reload()">Muat ulang</button></main>`;
});
