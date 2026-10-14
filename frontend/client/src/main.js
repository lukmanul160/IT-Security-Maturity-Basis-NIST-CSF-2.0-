import './styles/personnel-certificate.css';
import './styles/assessment-gaps.css';
import './styles/upload-progress.css';
import { installUploadProgress } from './services/uploadProgress';
import { installMutationGuard } from './services/mutationGuard';
import { installTableResize } from './services/tableResize';
import { renderWorkspaceError } from './services/workspaceError';
import './styles/table-resize.css';
/* Copyright (c) 2026 Lukmanul Hakim (lukmanul160@gmail.com). */
import { createApp, nextTick } from 'vue';
import App from './App.vue';
import './vue-shell.css';
import './styles/workspace-theme.css';
import './styles/workspace-sidebar.css';
import './styles/module-transfer.css';
import './styles/risk-dashboard.css';
import './styles/risk-acceptance-dashboard.css';
import './styles/governance-dashboard.css';
import workspaceEnhancements from './workspace/generated/enhancements.js?raw';
import workspaceRuntime from './workspace/runtime.js';
import { bootstrapWorkspaceRuntime } from './services/workspaceRuntime';

async function bootstrap() {
  installUploadProgress();
  installMutationGuard();
  createApp(App).mount('#app');
  await nextTick();
  window.NistI18n?.mount();
  await bootstrapWorkspaceRuntime({ app: workspaceRuntime, enhancements: workspaceEnhancements });
  installTableResize();
  document.documentElement.dataset.frontend = 'vue';
  window.NistI18n?.refresh();
  window.dispatchEvent(new CustomEvent('vue:workspace-ready'));
  document.getElementById('governanceLoading')?.remove();
}

bootstrap().catch(error => {
  console.error('[vue] Workspace bootstrap failed', error);
  document.getElementById('governanceLoading')?.remove();
  const root = document.getElementById('app');
  if (root) renderWorkspaceError(root,error);
});
