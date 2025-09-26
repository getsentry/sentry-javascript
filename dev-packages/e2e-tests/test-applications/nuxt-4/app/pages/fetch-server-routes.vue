<template>
  <div>
    <button @click="fetchError">Fetch Server API Error</button>
    <button @click="fetchNitroFetch">Fetch Nitro $fetch</button>
  </div>
</template>

<script setup lang="ts">
import { useFetch } from '#imports';

const fetchError = async () => {
  await useFetch('/api/server-error');
};

const fetchNitroFetch = async () => {
  await useFetch('/api/nitro-fetch');
};
</script>
