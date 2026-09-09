<script setup>
defineProps({
  items: { type: Array, required: true },
  modelValue: { type: String, required: true },
});

const emit = defineEmits(['update:modelValue']);
</script>

<template>
  <nav class="risk-management-tabs account-management-tabs" aria-label="Account management sections">
    <button
      v-for="item in items"
      :key="item.value"
      class="button"
      :class="modelValue === item.value ? 'button-accent' : 'button-quiet'"
      type="button"
      :aria-controls="item.panel"
      :aria-selected="modelValue === item.value"
      @click="emit('update:modelValue', item.value)"
    >
      {{ item.label }}
    </button>
  </nav>
</template>
