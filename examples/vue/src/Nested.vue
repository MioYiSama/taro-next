<script setup lang="ts">
/** Deeper than the plugin's `baseLevel`, so the inner part renders through `comp`. */
import { ref } from "vue";

defineProps<{ depth: number }>();

const taps = ref(0);
</script>

<template>
  <span v-if="depth === 0" id="deepest" @click="taps++">Deep node tapped {{ taps }} times</span>
  <div v-else class="nested">
    <Nested :depth="depth - 1" />
  </div>
</template>
