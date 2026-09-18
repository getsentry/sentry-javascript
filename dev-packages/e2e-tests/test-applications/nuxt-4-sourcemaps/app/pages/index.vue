<template>
  <button id="throw-error" @click="throwClientError">Throw client error</button>
</template>

<script setup lang="ts">
function throwClientError(): void {
  throw new Error('Client error from the Nuxt source map E2E app');
}
</script>
