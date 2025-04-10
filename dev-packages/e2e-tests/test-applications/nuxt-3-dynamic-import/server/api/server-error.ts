import { defineEventHandler } from '#imports';

export default defineEventHandler(event => {
  throw new Error('Nuxt 3 Server error');
});
