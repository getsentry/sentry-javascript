<script setup>
import SSRErrorComponent from '../components/SSRErrorComponent.vue';
</script>

<template>
  <div>
    <NuxtErrorBoundary>
      <SSRErrorComponent />
      <template #error="{ error }">
        <p id="error-fallback">Caught SSR Error: {{ error.message }}</p>
      </template>
    </NuxtErrorBoundary>
  </div>
</template>
