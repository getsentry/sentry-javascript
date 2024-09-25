<template>
  <p>{{ $route.params.param }} - {{ $route.params.param }}</p>

  <ErrorButton id="errorBtn" errorText="Error thrown from Param Route Button"  />
  <button @click="fetchData">Fetch Server Data</button>
</template>

<script setup lang="ts">
import { useRoute, useFetch } from '#imports'

const route = useRoute();
const param = route.params.param;

const fetchData = async () => {
  await useFetch(`/api/param-error/${param}`);
}
</script>
