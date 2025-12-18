<template>
  <div>
    <h2>Post View</h2>
    <p>Post ID: {{ params.postId }}</p>
  </div>
</template>

<script setup lang="ts">
import { useParams } from '@tanstack/vue-router';

const params = useParams({ from: '/posts/$postId' });
</script>

<style scoped>
h2 {
  color: #42b983;
}
</style>
