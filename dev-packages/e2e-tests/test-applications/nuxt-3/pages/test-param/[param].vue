<template>
  <p>{{ $route.params.param }} - {{ $route.params.param }}</p>

  <ErrorButton errorText="Error thrown from Param Route Button"  />
  <button @click="fetchData">Fetch Server Data</button>
</template>

<script setup lang="ts">
const route = useRoute();
const param = route.params.param;

const fetchData = async () => {
  await useFetch(`/api/param-error/${param}`);
}
</script>
