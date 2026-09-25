<script setup lang="ts">
import { useRoute, useFetch } from '#imports';

const route = useRoute();
const param = route.params.param;

const fetchError = async () => {
  await useFetch(`/api/param-error/${param}`);
};

const fetchData = async () => {
  await useFetch(`/api/test-param/${param}`);
};
</script>

<template>
  <p>Param: {{ $route.params.param }}</p>

  <ErrorButton id="errorBtn" errorText="Error thrown from Param Route Button" />
  <button @click="fetchData">Fetch Server Data</button>
  <button @click="fetchError">Fetch Server API Error</button>
</template>
