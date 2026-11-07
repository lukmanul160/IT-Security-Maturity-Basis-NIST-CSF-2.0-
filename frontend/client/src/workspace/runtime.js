// Classic-script order is declared once for production and source fixtures.
import sourceOrder from './runtime-parts.json';
import { assembleWorkspaceSource } from './runtime-source.js';
import ikasScoring from '../../../../src/shared/ikasScoring.js?raw';

const parts = import.meta.glob('./features/**/*.js', {
  eager: true, query: '?raw', import: 'default',
});

export default assembleWorkspaceSource(parts, {
  'src/shared/ikasScoring.js': ikasScoring,
}, sourceOrder);
