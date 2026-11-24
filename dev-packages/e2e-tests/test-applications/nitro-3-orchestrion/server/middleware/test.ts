import { defineHandler } from 'nitro/h3';

// Global middleware, so h3 composes the middleware chain through `callLayer`.
export default defineHandler(() => {});
