<script setup lang="ts">
function log() {
  console.log('Component Two!');
}
</script>

<template>
  <h1>Component One</h1>
  <button id="componentTwoBtn" @click="log">Click to Log</button>
</template>
