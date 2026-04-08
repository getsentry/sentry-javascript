import { defineHandler } from 'nitro';

export default defineHandler(async () => {
  return await $fetch('https://example.com');
});
