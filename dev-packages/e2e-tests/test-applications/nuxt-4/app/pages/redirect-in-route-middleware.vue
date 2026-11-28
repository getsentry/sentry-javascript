<script setup lang="ts">
import { definePageMeta } from '#imports';

definePageMeta({ middleware: 'redirect-to-param-page' });
</script>

<template>
  <p>The route middleware of this page redirects before the page renders.</p>
</template>
