<template>
  <NuxtLayout>
    <header>
      <nav>
        <ul>
          <li><NuxtLink to="/fetch-server-routes">Fetch Server Routes</NuxtLink></li>
          <li><NuxtLink to="/test-param/1234">Fetch Param</NuxtLink></li>
          <li><NuxtLink to="/client-error">Client Error</NuxtLink></li>
        </ul>
      </nav>
    </header>
    <NuxtPage />
  </NuxtLayout>
</template>

<script setup lang="ts">
import { useSentryTestTag } from '#imports';

useSentryTestTag();
</script>
