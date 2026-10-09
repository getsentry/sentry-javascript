<script setup lang="ts">
import { useFetch, useRoute } from '#imports';

const route = useRoute();
const userId = route.params.userId as string;
const apiPrefix = route.query.apiPrefix ?? '/api';

const { data } = await useFetch(`${apiPrefix}/user/${userId}`, {
  server: false, // Don't fetch during SSR, only client-side
});
</script>

<template>
  <div>
    <p v-if="data">User ID: {{ data }}</p>
  </div>
</template>
