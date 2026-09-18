import { defineEventHandler } from '#imports';

export default defineEventHandler(event => {
  throw new Error('Nuxt 4 Server error');
});
