<script setup lang="ts">
function throwError() {
  throw new Error('This is a Vue test error');
}
</script>

<template>
  <main>
    <h1>Home</h1>

    <button id="errorBtn" @click="throwError">Throw Error</button>
  </main>
</template>
