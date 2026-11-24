import { defineHandler } from 'nitro/h3';

// Nitro names this catch-all route `/**`.
export default defineHandler(() => {
  return { catchAll: true };
});
