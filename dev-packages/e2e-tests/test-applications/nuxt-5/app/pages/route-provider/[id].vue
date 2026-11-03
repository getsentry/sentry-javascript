<script setup lang="ts">
import * as Sentry from '@sentry/nuxt';
import { onMounted, ref } from 'vue';

const route = ref<string>();

onMounted(() => {
  route.value = Sentry.resolveCurrentRoute() ?? 'unresolved';
});
</script>

<template>
  <div id="resolved-route">{{ route }}</div>
</template>
