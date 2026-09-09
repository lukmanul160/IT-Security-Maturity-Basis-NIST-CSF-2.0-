function runClassicScript(source, label) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.async = false;
    script.textContent = `${source}\n//# sourceURL=${label}`;
    script.addEventListener('error', () => reject(new Error(`Failed to run ${label}`)), { once: true });
    document.body.appendChild(script);
    resolve();
  });
}

export async function bootstrapWorkspaceRuntime({ app, enhancements }) {
  if (window.__NIST_WORKSPACE_RUNTIME__) return;
  window.__NIST_WORKSPACE_RUNTIME__ = true;
  await runClassicScript(app, 'vue-workspace-runtime.js');
  await runClassicScript(enhancements, 'vue-workspace-enhancements.js');
}
