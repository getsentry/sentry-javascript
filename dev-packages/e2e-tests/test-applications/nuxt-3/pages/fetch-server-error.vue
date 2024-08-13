<template>
  <div>
    <button @click="fetchData">Fetch Server Data</button>
  </div>
</template>

<script setup lang="ts">
const fetchData = async () => {
  await useFetch('/api/server-error');
}
</script>