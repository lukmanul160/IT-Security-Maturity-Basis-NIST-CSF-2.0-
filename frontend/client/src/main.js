import './styles/local-fonts.css';
import '../../public/styles.css';
import '../../public/modern.css';
import '../../public/legacy-before-tailwind.css';
import '../../public/tailwind.css';
import '../../public/legacy-after-tailwind.css';
import '../../public/theme.css';
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
import { canvasShortcut } from './services/canvasInteraction.mjs';
window.NistCanvasShortcut = canvasShortcut;
import App from './App.vue';
import './vue-shell.css';
import './styles/workspace-theme.css';
import './styles/workspace-sidebar.css';
import './styles/office-design.css';
import './styles/statements.css';
import './styles/policy-word-editor.css';
import './styles/module-transfer.css';
import './styles/risk-dashboard.css';
import './styles/risk-acceptance-dashboard.css';
import './styles/governance-dashboard.css';
import './styles/status-colors.css';
import './styles/tprm-guide.css';
import { installStatusColors } from './services/statusColors.mjs';
import { bootstrapWorkspaceRuntime } from './services/workspaceRuntime';
window.NistProgressExcel = () => import('./services/moduleProgressWorkbook.mjs');
window.NistStatementEditor = () => import('./services/statementWordEditor.js');

async function bootstrap() {
  const runtimeReady=Promise.all([import('./workspace/runtime.js'),import('./workspace/generated/enhancements.js?raw')]);
  installUploadProgress();
  installMutationGuard();
  createApp(App).mount('#app');
  await nextTick();
  window.NistI18n?.mount();
  document.getElementById('governanceLoading')?.remove();
  const root=document.getElementById('app');root.inert=true;root.setAttribute('aria-busy','true');
  // Let the localized page paint before the legacy feature setup occupies the main thread.
  await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
  const [{default:workspaceRuntime},{default:workspaceEnhancements}]=await runtimeReady;
  await bootstrapWorkspaceRuntime({ app: workspaceRuntime, enhancements: workspaceEnhancements });
  installTableResize();
  installStatusColors();
  document.documentElement.dataset.frontend = 'vue';
  window.NistI18n?.refresh();
  window.dispatchEvent(new CustomEvent('vue:workspace-ready'));
  root.inert=false;root.removeAttribute('aria-busy');
}

bootstrap().catch(error => {
  console.error('[vue] Workspace bootstrap failed', error);
  document.getElementById('governanceLoading')?.remove();
  const root = document.getElementById('app');
  if (root) renderWorkspaceError(root,error);
});
