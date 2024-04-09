<script setup lang="ts">
  function throwError() {
    throw new Error('This is a Vue test error');
  }
</script>

<template>
  <h1>(Error) User ID: {{ $route.params.id }}</h1>
  <button id="userErrorBtn" @click="throwError">Throw Error</button>
</template>
