import { defineEventHandler } from '#imports';

export default defineEventHandler(async () => {
  return await $fetch('https://example.com');
});
