import { defineEventHandler } from 'nuxt/server';

export default defineEventHandler(() => {
  throw new Error('Nuxt 4 Server error');
});
