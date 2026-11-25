<script setup lang="ts">
import { useFetch } from '#imports';

// Rendering on the server fetches an internal API route, which goes through Nitro's `fetch`. On Bun, the text
// response of that `fetch` has no `content-type`, so without `responseType`, `$fetch` would parse it as JSON.
const { data } = await useFetch('/api/test-param/internal', { responseType: 'text' });
</script>

<template>
  <p>{{ data }}</p>
</template>
