<script setup lang="ts">
import type { Component } from 'vue';
import { defineAsyncComponent, h } from 'vue';

// Must stay in sync with `ASYNC_CHILD_DELAY_S` in `tests/performance.test.ts`.
const ASYNC_CHILD_DELAY_MS = 300;

// A child that mounts a fixed delay after the rest of the page, so tests can prove how each
// instrumentation path treats late children:
// - mixin: extends the `Application Render` span until the child mounts
// - `app.mount()` wrap: does not observe late children
const DelayedChild = defineAsyncComponent(
  () =>
    new Promise<Component>(resolve => {
      setTimeout(
        () => resolve({ render: () => h('p', { id: 'delayed-child' }, 'Delayed child') }),
        ASYNC_CHILD_DELAY_MS,
      );
    }),
);
</script>

<template>
  <main>
    <h1>Delayed</h1>
    <DelayedChild />
  </main>
</template>
