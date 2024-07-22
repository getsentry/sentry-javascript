<script setup>
const triggerError = () => {
  throw new Error('Error thrown from Nuxt-3 E2E test app');
};
</script>

<template>
  <button id="errorBtn" @click="triggerError">Trigger Error</button>
</template>
