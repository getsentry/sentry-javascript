import { defineEventHandler } from 'nuxt/server';

export default defineEventHandler(() => {
  throw new Error('Nuxt 5 Server error');
});
