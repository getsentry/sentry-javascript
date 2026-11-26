<script setup>
if (import.meta.server) {
  throw new Error('SSR Error inside NuxtErrorBoundary');
}
</script>

<template>
  <div>Normal SSR Content</div>
</template>
