import { defineHandler } from 'nitro/h3';

export default defineHandler(() => {
  throw new Error('Tunnel test error');
});
