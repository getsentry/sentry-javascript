import { sentryBeforeResponseMiddleware } from '@sentry/solidstart';
import { createMiddleware } from '@solidjs/start/middleware';

export default createMiddleware({
  onBeforeResponse: [sentryBeforeResponseMiddleware()],
});
