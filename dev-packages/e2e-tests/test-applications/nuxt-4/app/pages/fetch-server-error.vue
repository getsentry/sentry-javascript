<template>
  <div>
    <button @click="fetchData">Fetch Server Data</button>
  </div>
</template>

<script setup lang="ts">
import { useFetch} from '#imports'

const fetchData = async () => {
  await useFetch('/api/server-error');
}
</script>
