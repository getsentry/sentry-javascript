import { defineHandler } from 'nitro/h3';

export default defineHandler(() => {
  return { result: 'transaction' };
});
