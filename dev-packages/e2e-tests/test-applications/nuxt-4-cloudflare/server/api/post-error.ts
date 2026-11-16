import { defineEventHandler } from '#imports';

// Throws, so a test can check what request data the error event carries.
export default defineEventHandler(() => {
  throw new Error('POST error');
});
