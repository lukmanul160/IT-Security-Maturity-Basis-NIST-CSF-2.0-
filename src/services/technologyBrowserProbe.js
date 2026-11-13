/** Build a bounded, data-only DOM/JS observation expression for project-owned rules. No eval of rule text. */
function collect(plan) {
  let remaining = 150000,
    truncated = false;
  const keep = (key, value, target) => {
    if (value === undefined || value === null) return;
    const text =
      typeof value === 'string'
        ? value.slice(0, 1000)
        : typeof value === 'number' || typeof value === 'boolean'
          ? String(value)
          : 'true';
    remaining -= key.length + text.length + 20;
    if (remaining < 0) {
      truncated = true;
      return;
    }
    Object.defineProperty(target, key, { value: text, enumerable: true, configurable: true });
  };
  const property = (root, path) => {
    const parts = path
      .replace(/\[(?:['"]([^'"]+)['"]|(\d+))\]/g, (_, quoted, index) => '.' + (quoted || index))
      .split('.');
    if (parts[0] === 'window') parts.shift();
    if (
      parts.length > 12 ||
      parts.some((key) => !/^[\w$]+$/.test(key) || ['__proto__', 'prototype', 'constructor'].includes(key))
    )
      return;
    try {
      let value = root;
      for (const key of parts) {
        if (value === undefined || value === null) return;
        value = value[key];
      }
      return value;
    } catch {
      return;
    }
  };
  const js = {},
    dom = {},
    meta = {},
    scriptSrc = [],
    inlineScripts = [];
  for (const key of plan.js) {
    if (remaining < 0) break;
    keep(key, property(window, key), js);
  }
  for (const rule of plan.dom) {
    if (remaining < 0) break;
    let elements;
    try {
      elements = document.querySelectorAll(rule.selector);
    } catch {
      continue;
    }
    if (!elements.length) continue;
    remaining -= rule.selector.length;
    const matches = [];
    for (let index = 0; index < Math.min(10, elements.length) && remaining >= 0; index++) {
      const node = elements[index],
        attributes = {},
        properties = {},
        record = { attributes, properties };
      for (const key of rule.attributes)
        if (node.hasAttribute(key)) keep(key, node.getAttribute(key), attributes);
      for (const key of rule.properties) keep(key, property(node, key), properties);
      keep('text', node.textContent, record);
      matches.push(record);
    }
    Object.defineProperty(dom, rule.selector, { value: matches, enumerable: true });
  }
  for (const node of document.querySelectorAll('meta[name],meta[property]')) {
    if (remaining < 0) break;
    const key = (node.getAttribute('name') || node.getAttribute('property') || '').toLowerCase();
    keep(key, node.getAttribute('content'), meta);
  }
  for (const node of document.querySelectorAll('script[src]')) {
    if (scriptSrc.length >= 100 || remaining < 0) break;
    const value = node.src.slice(0, 2048);
    remaining -= value.length;
    scriptSrc.push(value);
  }
  for (const node of document.querySelectorAll('script:not([src])')) {
    if (remaining < 0 || inlineScripts.length >= 50) break;
    const value = (node.textContent || '').slice(0, 4096);
    remaining -= value.length;
    inlineScripts.push(value);
  }
  // React often has no window.React export in production; inspect bounded DOM property names, not fibers.
  let react = false,
    angular = false;
  const elements = document.querySelectorAll('*');
  for (let index = 0; index < Math.min(2000, elements.length); index++) {
    const keys = Object.getOwnPropertyNames(elements[index]);
    if (
      keys.some(
        (key) =>
          /^__(?:reactFiber|reactContainer|reactInternalInstance)\$/.test(key) ||
          key === '_reactRootContainer',
      )
    )
      react = true;
    if (keys.includes('__ngContext__')) angular = true;
    if (react && angular) break;
  }
  return { js, dom, meta, scriptSrc, inlineScripts, react, angular, truncated };
}
function expression(plan) {
  return '(' + collect.toString() + ')(' + JSON.stringify(plan) + ')';
}
module.exports = { expression };
