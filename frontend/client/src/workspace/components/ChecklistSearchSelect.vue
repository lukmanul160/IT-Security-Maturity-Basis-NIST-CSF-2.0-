<script setup>
/** Searchable assignment selector; only an explicit option selection emits an account/template ID. */
import { ref, computed, watchEffect } from 'vue';
const props = defineProps({
  modelValue: { type: String, default: '' },
  options: { type: Array, default: () => [] },
  inputId: String,
  name: String,
  label: String,
  placeholder: String,
  emptyText: String,
  disabled: Boolean,
});
const emit = defineEmits(['update:modelValue']);
const root = ref(null),
  input = ref(null),
  expanded = ref(false),
  query = ref(''),
  active = ref(0);
const selected = computed(() => props.options.find((option) => option.value === props.modelValue));
const filtered = computed(() =>
  props.options.filter((option) =>
    option.label.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase()),
  ),
);
const display = computed(() => (expanded.value ? query.value : selected.value?.label || ''));
watchEffect(() => {
  input.value?.setCustomValidity(props.modelValue ? '' : props.placeholder || 'Select an option');
});
function open() {
  if (!props.disabled && !expanded.value) {
    query.value = '';
    active.value = 0;
    expanded.value = true;
  }
}
function search(event) {
  query.value = event.target.value;
  active.value = 0;
  expanded.value = true;
  emit('update:modelValue', '');
}
function choose(option) {
  if (!option || props.disabled) return;
  emit('update:modelValue', option.value);
  expanded.value = false;
  query.value = '';
}
function keydown(event) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    open();
    active.value = Math.max(
      0,
      Math.min(filtered.value.length - 1, active.value + (event.key === 'ArrowDown' ? 1 : -1)),
    );
  } else if (expanded.value && event.key === 'Enter') {
    event.preventDefault();
    choose(filtered.value[active.value]);
  } else if (expanded.value && event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    expanded.value = false;
  }
}
function focusout(event) {
  if (!root.value?.contains(event.relatedTarget)) expanded.value = false;
}
</script>

<template>
  <div ref="root" class="checklist-search-select" @focusout="focusout">
    <label :for="inputId">{{ label }}</label>
    <div class="checklist-search-control">
      <input
        :id="inputId"
        ref="input"
        :name="name"
        :value="display"
        :disabled="disabled"
        :placeholder="placeholder"
        autocomplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-required="true"
        :aria-expanded="expanded"
        :aria-controls="inputId + '-options'"
        :aria-activedescendant="expanded && filtered[active] ? inputId + '-option-' + active : undefined"
        @focus="open"
        @click="open"
        @input="search"
        @keydown="keydown"
      />
      <button
        type="button"
        :disabled="disabled"
        :aria-label="label"
        :aria-expanded="expanded"
        tabindex="-1"
        @click="expanded ? (expanded = false) : (open(), input?.focus())"
      >
        ⌄
      </button>
    </div>
    <ul
      v-if="expanded"
      :id="inputId + '-options'"
      class="checklist-search-options"
      role="listbox"
      :aria-label="label"
    >
      <li
        v-for="(option, index) in filtered"
        :id="inputId + '-option-' + index"
        :key="option.value"
        role="option"
        :aria-selected="option.value === modelValue"
        :class="{ active: index === active }"
        @pointerdown.prevent
        @mousemove="active = index"
        @click="choose(option)"
      >
        {{ option.label }}
      </li>
      <li v-if="!filtered.length" role="presentation" class="checklist-search-empty">{{ emptyText }}</li>
    </ul>
  </div>
</template>

<style scoped>
.checklist-search-select {
  position: relative;
  display: grid;
  gap: 8px;
  min-width: 0;
}
.checklist-search-select > label {
  display: block;
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.5;
}
.checklist-search-control {
  position: relative;
  min-width: 0;
}
.checklist-search-control input {
  display: block;
  width: 100%;
  min-width: 0;
  padding-right: 42px !important;
}
.checklist-search-control button {
  position: absolute;
  right: 1px;
  top: 1px;
  bottom: 1px;
  width: 36px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.checklist-search-options {
  position: relative;
  z-index: 2;
  list-style: none;
  max-height: 200px;
  overflow: auto;
  margin: 0;
  padding: 4px;
  border: 1px solid var(--line, #cbd5e1);
  border-radius: 9px;
  background: var(--paper, #fff);
  color: var(--ink, #182338);
  box-shadow: 0 8px 24px #0002;
}
.checklist-search-options li {
  padding: 10px 12px;
  border-radius: 6px;
  white-space: normal;
  overflow-wrap: anywhere;
  cursor: pointer;
  font-size: 13px;
}
.checklist-search-options li.active,
.checklist-search-options li[aria-selected='true'] {
  background: var(--surface-hover, #3978d126);
}
.checklist-search-empty {
  color: var(--muted, #64748b);
  cursor: default !important;
}
</style>
