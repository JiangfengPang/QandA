<template>
  <header class="qstat-topbar">
    <div>
      <h1>统计</h1>
    </div>
    <button class="qstat-clear-btn" :disabled="disabled" @click="$emit('clear')">
      {{ clearing ? '清空中...' : '清空记录' }}
    </button>
  </header>
</template>

<script setup lang="ts">
defineProps<{
  clearing?: boolean;
  disabled?: boolean;
}>();

defineEmits<{ clear: [] }>();
</script>
