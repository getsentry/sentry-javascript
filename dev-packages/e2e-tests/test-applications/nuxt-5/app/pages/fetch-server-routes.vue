<template>
  <div>
    <button @click="fetchError">Fetch Server API Error</button>
    <button @click="fetchNitroFetch">Fetch Nitro $fetch</button>
    <button @click="fetchThirdPartyHttpError">Fetch Third-Party HTTPError</button>
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

const fetchThirdPartyHttpError = async () => {
  await useFetch('/api/third-party-http-error');
};
</script>
