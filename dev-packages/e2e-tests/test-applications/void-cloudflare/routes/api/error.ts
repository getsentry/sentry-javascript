import { defineHandler } from 'void';

export const GET = defineHandler(() => {
  throw new Error('Void route error');
});
