<script setup lang="ts">
import { useRoute } from '#imports';

// The id makes the error of each request distinct, so that a test can count the events of its own request.
throw new Error(`Nuxt 5 SSR error ${useRoute().query.id}`);
</script>

<template>
  <p>This page fails while it renders.</p>
</template>
