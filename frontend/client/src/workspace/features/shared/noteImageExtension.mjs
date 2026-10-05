import Image from '@tiptap/extension-image';

export const imageWidth = value => {
  const width = Number(value);
  return Number.isFinite(width) && width > 0 ? Math.max(48, Math.min(1600, Math.round(width))) : null;
};
// A Markdown title carries the display width, while exports keep portable image references.
export const NoteImage = Image.extend({
  parseMarkdown(token, helpers) {
    const match = /(?:^| )kn-width:(\d+)(?: |$)/.exec(token.title || '');
    return helpers.createNode('image', { src: token.href, alt: token.text,
      title: (token.title || '').replace(/(?:^| )kn-width:\d+(?= |$)/, '').trim() || null,
      width: match ? imageWidth(match[1]) : null });
  },
  renderMarkdown(node) {
    const title = [node.attrs.title, imageWidth(node.attrs.width) ? 'kn-width:' + imageWidth(node.attrs.width) : ''].filter(Boolean).join(' ');
    const alt = String(node.attrs.alt || '').replace(/\]/g, '\\]');
    const src = node.attrs.src || '';
    return `![${alt}](${src}${title ? ' "' + title.replace(/"/g, '\\"') + '"' : ''})`;
  },
});
