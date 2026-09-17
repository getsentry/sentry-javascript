<script setup lang="ts">
function log() {
  console.log('Component One!');
}
</script>

<template>
  <h1>Component One</h1>
  <button id="componentOneBtn" @click="log">Click to Log</button>
</template>
