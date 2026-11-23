<script setup lang="ts">
import { useFetch } from '#imports';

// Rendering on the server fetches an internal API route, which goes through Nitro's `fetch`.
const { data } = await useFetch('/api/internal');
</script>

<template>
  <div>
    <h1>Nuxt on Cloudflare</h1>
    <p>{{ data }}</p>
  </div>
</template>
