<template>
  <div>
    <button @click="fetchError">Fetch Server API Error</button>
  </div>
</template>

<script setup lang="ts">
import { useFetch } from '#imports';

const fetchError = async () => {
  await useFetch('/api/server-error');
};
</script>
