const fs = require('node:fs/promises');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const workspaceSourceDirectory = path.join(projectRoot, 'frontend', 'client', 'src', 'workspace');
const workspaceSourcePath = path.join(workspaceSourceDirectory, 'source.html');
const workspaceRuntimePath = path.join(workspaceSourceDirectory, 'runtime.js');
const generatedDirectory = path.join(workspaceSourceDirectory, 'generated');
const publicDirectory = path.join(projectRoot, 'frontend', 'public');
const styleContents = source => [...source.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/gi)]
  .map(match => match[1].trim())
  .filter(Boolean)
  .join('\n\n');

async function prepareVueClient() {
  const html = await fs.readFile(workspaceSourcePath, 'utf8');
  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) throw new Error('Workspace source does not contain a body element');

  const body = bodyMatch[1];
  const appScript = /<script\s+src=["']app\.js[^>]*><\/script>/i.exec(body);
  if (!appScript) throw new Error('Workspace runtime marker was not found');

  const layoutMarkup = body.slice(0, appScript.index).trim();
  let workspaceMarkup = layoutMarkup;
  let componentMarkup = layoutMarkup;
  const componentNames = [];
  for (const match of layoutMarkup.matchAll(/<!-- workspace-component:(\w+) -->/g)) {
    const name = match[1];
    const component = await fs.readFile(path.join(workspaceSourceDirectory, 'components', `${name}.vue`), 'utf8');
    const template = component.match(/<template>([\s\S]*)<\/template>/)?.[1]?.trim();
    if (!template) throw new Error(`Missing component template: ${name}`);
    workspaceMarkup = workspaceMarkup.replace(match[0], template.replace(' v-pre', ''));
    componentMarkup = componentMarkup.replace(match[0], `<${name} />`);
    componentNames.push(name);
  }
  const layoutComponent = `<script setup>\n${componentNames.map(name => `import ${name} from '../components/${name}.vue';`).join('\n')}\n</script>\n<template><div class="vue-workspace-host">${componentMarkup}</div></template>\n`;
  const scriptsAfterApp = body.slice(appScript.index + appScript[0].length);
  const enhancements = [...scriptsAfterApp.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1].trim())
    .filter(Boolean)
    .join('\n\n');
  const tailwindLinkIndex = html.search(/<link\b[^>]*href=["'](?:\.\/)?tailwind\.css["'][^>]*>/i);
  if (tailwindLinkIndex < 0) throw new Error('Tailwind stylesheet marker was not found');
  const stylesBeforeTailwind = styleContents(html.slice(0, tailwindLinkIndex));
  const stylesAfterTailwind = styleContents(html.slice(tailwindLinkIndex));

  if (!workspaceMarkup.includes('id="mainContent"')) throw new Error('Workspace markup is incomplete');
  if (!enhancements.includes('addFilterToolbar')) throw new Error('Workspace enhancements are incomplete');
  await fs.access(workspaceRuntimePath);

  await fs.mkdir(generatedDirectory, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(generatedDirectory, 'WorkspaceLayout.vue'), layoutComponent),
    fs.writeFile(path.join(generatedDirectory, 'template.html'), `${workspaceMarkup}\n`),
    fs.writeFile(path.join(generatedDirectory, 'enhancements.js'), `${enhancements}\n`),
    fs.writeFile(path.join(publicDirectory, 'legacy-before-tailwind.css'), `${stylesBeforeTailwind}\n`),
    fs.writeFile(path.join(publicDirectory, 'legacy-after-tailwind.css'), `${stylesAfterTailwind}\n`),
    fs.rm(path.join(generatedDirectory, 'inline.css'), { force: true }),
  ]);

  console.log('Vue workspace sources prepared from frontend/client/src/workspace/source.html');
}

prepareVueClient().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
