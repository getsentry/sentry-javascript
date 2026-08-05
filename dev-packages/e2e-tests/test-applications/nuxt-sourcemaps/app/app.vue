<template>
  <h1>{{ message }}</h1>
</template>

<script setup lang="ts">
const message = `hello from nuxt sourcemaps test at ${new Date().toISOString()}`;
</script>
