<script setup lang="ts">
import { useAsyncData } from '#imports';

// Server routes do not exist on the Vite server, so the page queries the database while it renders.
const { data: solution } = await useAsyncData('db-ssr', async () => {
  // `mysql` only runs on Node, so it must stay out of the client bundle.
  if (!import.meta.server) {
    return null;
  }

  const { default: mysql } = await import('mysql');
  const connection = mysql.createConnection({ user: 'root', password: 'docker' });

  try {
    return await new Promise<number>((resolve, reject) => {
      connection.query('SELECT 1 + 1 AS solution', (error, results) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(results[0].solution);
      });
    });
  } finally {
    connection.end();
  }
});
</script>

<template>
  <p id="solution">{{ solution }}</p>
</template>
