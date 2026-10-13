<template>
  <div>
    <h1>Nuxt source map E2E</h1>
    <NuxtPage />
  </div>
</template>

<script setup lang="ts">
// SOURCEMAP_MARKER_CLIENT — a comment, so it is stripped from the emitted bundle but survives in
// `sourcesContent`. `assert-build.ts` uses it to tell "the real source was uploaded" apart from
// "the real source is still sitting in `.output/public`".
</script>
