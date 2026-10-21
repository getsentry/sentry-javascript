import { defineEventHandler, setHeader } from '#imports';

export default defineEventHandler(async event => {
  // Set a header to indicate this middleware ran
  setHeader(event, 'x-first-middleware', 'executed');
});
