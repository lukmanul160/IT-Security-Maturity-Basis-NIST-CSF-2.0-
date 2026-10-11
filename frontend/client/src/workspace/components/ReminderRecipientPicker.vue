<script setup>
import {ref,onMounted,onBeforeUnmount} from 'vue';
const props=defineProps({canRegister:Boolean,owners:{type:Array,default:()=>[]}});const emit=defineEmits(['select']);const host=ref(null);
let picker;onMounted(()=>{picker=window.NistReminderRecipients?.mount(host.value,row=>emit('select',row),{canRegister:props.canRegister,ownerOptions:()=>[...new Set([...props.owners,...window.NistReminderRecipients.registered.map(row=>row.owner)])]});});onBeforeUnmount(()=>picker?.destroy());
</script>
<template><section ref="host" class="insight-panel smtp-wide" aria-label="Register penerima reminder"></section></template>
