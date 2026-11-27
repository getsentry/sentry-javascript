<script setup lang="ts">
import { useFetch, useLazyAsyncData } from '#imports';

// On the server, each handler runs while the page renders, and the API route runs in the same process.
const { data: keyed } = await useFetch('/api/data-fetching', { key: 'visits' });
const { data: keyless } = await useFetch('/api/data-fetching');
const { data: orderCount } = useLazyAsyncData('order-count', () => Promise.resolve(3));
</script>

<template>
  <p id="keyed">{{ keyed?.success }}</p>
  <p id="keyless">{{ keyless?.success }}</p>
  <p id="order-count">{{ orderCount }}</p>
</template>
