import { defineHandler } from 'nitro';

export default defineHandler(event => {
  throw new Error('Nuxt 5 Server error');
});
