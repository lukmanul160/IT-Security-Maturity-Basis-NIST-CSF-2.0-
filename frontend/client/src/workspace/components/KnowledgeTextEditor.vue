<script setup>
import { watch, ref, computed } from 'vue';
import { useEditor, EditorContent } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { TableKit } from '@tiptap/extension-table';
import DOMPurify from 'dompurify';
import { wikiAtCursor, wikiSuggestions } from '../features/shared/wikiCompletion.mjs';

const props=defineProps({modelValue:{type:String,default:''},editable:Boolean,readonly:Boolean,notes:{type:Array,default:()=>[]}});
const emit=defineEmits(['update:modelValue','save']);
const completion=ref(null),selected=ref(0),dismissed=ref('');
const matches=computed(()=>wikiSuggestions(props.notes,completion.value?.query||''));
function updateCompletion(instance){
 const {selection}=instance.state;
 if(!props.editable||props.readonly||!instance.isFocused||!selection.empty||instance.isActive('codeBlock')||instance.isActive('code')){completion.value=null;return;}
 const position=selection.$from,found=wikiAtCursor(position.parent.textBetween(0,position.parentOffset,'\n','\ufffc'),position.parent.textBetween(position.parentOffset,position.parent.content.size,'\n','\ufffc'));
 if(!found){completion.value=null;dismissed.value='';return;}
 const from=selection.from-found.length,to=selection.from+found.closing,key=from+':'+found.query;
 if(dismissed.value===key){completion.value=null;return;}
 const coords=instance.view.coordsAtPos(selection.from);
 if(completion.value?.key!==key)selected.value=0;
 completion.value={...found,from,to,key,left:Math.max(8,Math.min(coords.left,window.innerWidth-340)),top:Math.max(8,Math.min(coords.bottom+6,window.innerHeight-280))};
}
function choose(note){if(!completion.value||!props.editable)return;const {from,to}=completion.value;completion.value=null;editor.value.chain().focus().insertContentAt({from,to},{type:'text',text:'[['+note.target+']]'}).run();}
function handleKey(event){
 if(!completion.value||event.isComposing)return false;
 if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();selected.value=(selected.value+(event.key==='ArrowDown'?1:-1)+Math.max(matches.value.length,1))%Math.max(matches.value.length,1);return true;}
 if(event.key==='Escape'){event.preventDefault();dismissed.value=completion.value.key;completion.value=null;return true;}
 if(['Enter','Tab'].includes(event.key)&&matches.value.length){event.preventDefault();choose(matches.value[selected.value]||matches.value[0]);return true;}return false;
}
const safeUrl=url=>/^https?:\/\//i.test(url);
// Preserve Obsidian links outside fenced/inline code when Markdown escapes brackets.
function markdownContent(instance){return instance.getMarkdown().split(/(`{3,}[\s\S]*?`{3,}|~{3,}[\s\S]*?~{3,}|`+[^`]*`+)/g).map((part,index)=>index%2?part:part.replace(/\\\[\\\[([^\n]*?)\\\]\\\]/g,'[[$1]]')).join('');}
const editor=useEditor({
 extensions:[StarterKit.configure({underline:false,link:{openOnClick:false,autolink:false,linkOnPaste:false,isAllowedUri:safeUrl,HTMLAttributes:{target:'_blank',rel:'noopener noreferrer'}}}),TaskList,TaskItem.configure({nested:true}),TableKit.configure({table:{resizable:false}}),Markdown],
 content:props.modelValue,contentType:'markdown',editable:props.editable&&!props.readonly,
 editorProps:{attributes:{'aria-label':'Isi catatan','role':'textbox','aria-multiline':'true'},transformPastedHTML:html=>DOMPurify.sanitize(html,{FORBID_TAGS:['img','iframe','script','style','object','embed'],FORBID_ATTR:['style']}),handleKeyDown:(_view,event)=>{if(handleKey(event))return true;if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();emit('save');return true;}return false;}},
 onUpdate:({editor})=>emit('update:modelValue',markdownContent(editor)),
 onSelectionUpdate:({editor})=>updateCompletion(editor),
 onTransaction:({editor})=>updateCompletion(editor),
 onFocus:({editor})=>updateCompletion(editor),
 onBlur:()=>{completion.value=null;},
});
watch(()=>props.modelValue,value=>{if(editor.value&&markdownContent(editor.value)!==value)editor.value.commands.setContent(value,{contentType:'markdown',emitUpdate:false});});
watch(()=>[props.editable,props.readonly],()=>editor.value?.setEditable(props.editable&&!props.readonly,false));
const buttons=[['bold','Bold'],['italic','Italic'],['strike','Coret'],['heading1','H1'],['heading2','H2'],['bulletList','Bullet'],['orderedList','Numbering'],['taskList','Checklist'],['indent','Indent'],['outdent','Outdent'],['blockquote','Kutipan'],['code','Code'],['codeBlock','Blok kode'],['link','Tautan'],['wiki','Tautan catatan'],['undo','Undo'],['redo','Redo']];
function active(kind){return editor.value?.isActive(kind.startsWith('heading')?'heading':kind,kind.startsWith('heading')?{level:Number(kind.at(-1))}:undefined)||false;}
function format(kind){
 if(!props.editable||!editor.value)return;
 const chain=editor.value.chain().focus();
 const commands={bold:'toggleBold',italic:'toggleItalic',strike:'toggleStrike',bulletList:'toggleBulletList',orderedList:'toggleOrderedList',taskList:'toggleTaskList',blockquote:'toggleBlockquote',code:'toggleCode',codeBlock:'toggleCodeBlock',undo:'undo',redo:'redo'};
 if(commands[kind])chain[commands[kind]]().run();
 else if(kind.startsWith('heading'))chain.toggleHeading({level:Number(kind.at(-1))}).run();
 else if(kind==='indent'||kind==='outdent'){const item=editor.value.isActive('taskItem')?'taskItem':'listItem';chain[kind==='indent'?'sinkListItem':'liftListItem'](item).run();}
 else if(kind==='wiki')chain.insertContent({type:'text',text:'[['}).run();
 else if(kind==='link'){const url=window.prompt('URL tautan (https:// atau http://)',editor.value.getAttributes('link').href||'https://');if(url===null)return;if(!url.trim())chain.extendMarkRange('link').unsetLink().run();else if(safeUrl(url.trim()))chain.extendMarkRange('link').setLink({href:url.trim()}).run();else window.alert('Gunakan tautan http:// atau https://.');}
}
</script>
<template>
 <div class="knowledge-text-editor" :class="{'is-readonly':readonly}">
  <div v-if="!readonly" class="toolbar formatting" role="toolbar" aria-label="Format teks"><button v-for="[kind,label] in buttons" :key="kind" :data-format="kind" :disabled="!editable" :aria-pressed="active(kind)" @mousedown.prevent @click="format(kind)">{{ label }}</button></div>
  <EditorContent :editor="editor" />
  <div v-if="completion" class="wiki-suggestions" :style="{left:completion.left+'px',top:completion.top+'px'}" role="listbox" aria-label="Cari tautan catatan">
   <strong>{{ completion.query?'Hasil pencarian: '+completion.query:'Pilih catatan yang sudah ada' }}</strong>
   <button v-for="(note,index) in matches" :key="note.id" role="option" :aria-selected="index===selected" :class="{'wiki-selected':index===selected}" @mousedown.prevent @click="choose(note)"><span data-no-translate>{{ note.title }}</span><small data-no-translate>{{ note.path }}</small></button>
   <p v-if="!matches.length">Tidak ada catatan yang cocok.</p><small>↑ ↓ pilih · Enter / Tab sisipkan · Esc tutup</small>
  </div>
  <small v-if="!readonly" class="editor-help">Numbering: Enter untuk nomor berikutnya, Tab / Shift+Tab untuk tingkat daftar. Ctrl+B / Ctrl+I untuk format; Ctrl+S untuk simpan.</small>
 </div>
</template>
<style scoped>
.knowledge-text-editor :deep(.tiptap){min-height:460px;padding:18px;border:1px solid #d8dce8;border-radius:8px;outline:none;line-height:1.7;overflow-wrap:anywhere;color:#243248;background:white}
.knowledge-text-editor :deep(.tiptap:focus){border-color:#8b5cf6;box-shadow:0 0 0 2px #8b5cf620}
.knowledge-text-editor :deep(p){margin:0 0 .7em;color:inherit}
.knowledge-text-editor :deep(ol){list-style:decimal!important;padding-left:2em}
.knowledge-text-editor :deep(ul){list-style:disc!important;padding-left:2em}
.knowledge-text-editor :deep(li>p){margin:0}
.knowledge-text-editor :deep(h1){font-size:28px;font-weight:700}.knowledge-text-editor :deep(h2){font-size:24px;font-weight:700}.knowledge-text-editor :deep(h3){font-size:20px;font-weight:700}
.knowledge-text-editor :deep(blockquote){border-left:3px solid #8b5cf6;padding-left:16px;margin:12px 0}
.knowledge-text-editor :deep(pre){background:#f1eef8;padding:14px;border-radius:6px;white-space:pre-wrap}.knowledge-text-editor :deep(code){font-family:monospace;background:#f1eef8}
.knowledge-text-editor :deep(ul[data-type=taskList]){list-style:none!important;padding-left:0}.knowledge-text-editor :deep(li[data-type=taskItem]){display:flex;gap:10px;align-items:baseline}.knowledge-text-editor :deep(li[data-type=taskItem]>div){flex:1}.knowledge-text-editor :deep(input[type=checkbox]){width:auto!important}
.knowledge-text-editor :deep(table){border-collapse:collapse;width:100%}.knowledge-text-editor :deep(td),.knowledge-text-editor :deep(th){border:1px solid #d8dce8;padding:8px}
.formatting button[aria-pressed=true]{background:#eee6ff;border-color:#8b5cf6}.editor-help{display:block;margin-top:10px}.is-readonly :deep(.tiptap){border:0;padding:8px 0}
.wiki-suggestions{position:fixed;z-index:10000;width:min(320px,calc(100vw - 16px));max-height:260px;overflow:auto;padding:8px;background:white;border:1px solid #d8dce8;border-radius:8px;box-shadow:0 8px 28px #25203d33}.wiki-suggestions strong{display:block;font-size:12px;padding:5px}.wiki-suggestions button{display:block;width:100%;text-align:left;margin:3px 0;padding:7px 10px}.wiki-suggestions button span,.wiki-suggestions button small{display:block}.wiki-suggestions>small{font-size:10px}.wiki-selected{background:#eee6ff!important;border-color:#8b5cf6!important}
</style>
