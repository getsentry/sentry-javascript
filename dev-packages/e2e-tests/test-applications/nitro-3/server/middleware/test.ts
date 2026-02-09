import { defineHandler, setResponseHeader } from 'nitro/h3';

export default defineHandler(event => {
  // Simple middleware that adds a custom header to verify it ran
  setResponseHeader(event, 'x-sentry-test-middleware', 'executed');
});
