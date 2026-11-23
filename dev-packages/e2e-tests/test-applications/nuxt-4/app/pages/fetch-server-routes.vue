<template>
  <div>
    <button :disabled="!hydrated" @click="fetchError">Fetch Server API Error</button>
    <button :disabled="!hydrated" @click="fetchNitroFetch">Fetch Nitro $fetch</button>
    <button :disabled="!hydrated" @click="fetchThirdPartyHttpError">Fetch Third-Party HTTPError</button>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, useFetch, useRoute } from '#imports';

const hydrated = ref(false);
onMounted(() => {
  hydrated.value = true;
});

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
