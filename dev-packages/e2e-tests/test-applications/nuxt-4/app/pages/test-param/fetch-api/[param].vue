<script setup lang="ts">
import { useFetch, useRoute } from '#imports';

const route = useRoute();
const param = route.params.param as string;

const { data } = await useFetch(`/api/test-param/${param}`, {
  server: false, // Don't fetch during SSR
});
</script>

<template>
  <div>
    <p v-if="data">Server Data: {{ data }}</p>
  </div>
</template>
