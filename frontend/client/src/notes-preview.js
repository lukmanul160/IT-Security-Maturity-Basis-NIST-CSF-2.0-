// Focused browser regression entry; excluded from the production workspace build.
import { createApp, nextTick } from 'vue';
import KnowledgeNotes from './workspace/components/KnowledgeNotesView.vue';
createApp(KnowledgeNotes).mount('#app');
await nextTick();
document.documentElement.dataset.frontend = 'vue';
