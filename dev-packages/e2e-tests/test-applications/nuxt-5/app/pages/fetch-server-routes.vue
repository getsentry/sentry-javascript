<template>
  <div>
    <button @click="fetchError">Fetch Server API Error</button>
    <button @click="fetchNitroFetch">Fetch Nitro $fetch</button>
    <button @click="fetchThirdPartyHttpError">Fetch Third-Party HTTPError</button>
  </div>
</template>

<script setup lang="ts">
import { useFetch, useRoute } from '#imports';

const apiPrefix = useRoute().query.apiPrefix ?? '/api';

const fetchError = async () => {
  await useFetch(`${apiPrefix}/server-error`);
};

const fetchNitroFetch = async () => {
  await useFetch(`${apiPrefix}/nitro-fetch`);
};

const fetchThirdPartyHttpError = async () => {
  await useFetch(`${apiPrefix}/third-party-http-error`);
};
</script>
