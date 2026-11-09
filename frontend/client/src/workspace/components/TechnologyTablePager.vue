<script setup>
/** Controlled paging shared by the Technology Asset tables. */
defineProps({
  page: { type: Number, required: true },
  pages: { type: Number, required: true },
  total: { type: Number, required: true },
  translate: { type: Function, required: true },
});
defineEmits(['update:page']);
</script>
<template>
  <nav class="ta-table-pager" :aria-label="translate('Pagination tabel')">
    <span
      >{{ translate('Halaman') }} {{ page }} / {{ pages }} · {{ total }} {{ translate('baris') }} ·
      {{ translate('Maksimum 20 baris per halaman') }}</span
    >
    <div>
      <button
        type="button"
        class="button button-quiet"
        :disabled="page <= 1"
        @click="$emit('update:page', page - 1)"
      >
        {{ translate('Sebelumnya') }}</button
      ><button
        type="button"
        class="button button-quiet"
        :disabled="page >= pages"
        @click="$emit('update:page', page + 1)"
      >
        {{ translate('Berikutnya') }}
      </button>
    </div>
  </nav>
</template>
<style scoped>
.ta-table-pager {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin: 14px 0;
  font-size: 12px;
}
.ta-table-pager > div {
  display: flex;
  gap: 8px;
}
.ta-table-pager button:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
