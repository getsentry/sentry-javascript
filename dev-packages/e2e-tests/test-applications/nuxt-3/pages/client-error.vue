<script setup>
import ErrorButton from '../components/ErrorButton.vue';

const catchErr = () => {
  console.log('Additional functionality in NuxtErrorBoundary');
};
</script>

<template>
  <ErrorButton id="errorBtn" error-text="Error thrown from Nuxt-3 E2E test app" />
  <ErrorButton id="errorBtn2" error-text="Another Error thrown from Nuxt-3 E2E test app" />

  <NuxtErrorBoundary @error="catchErr">
    <ErrorButton id="error-in-error-boundary" error-text="Error thrown in Error Boundary" />
  </NuxtErrorBoundary>
</template>
