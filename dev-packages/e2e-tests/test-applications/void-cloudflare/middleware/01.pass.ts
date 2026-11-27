import { defineMiddleware } from 'void';

export default defineMiddleware(async (_c, next) => {
  await next();
});
