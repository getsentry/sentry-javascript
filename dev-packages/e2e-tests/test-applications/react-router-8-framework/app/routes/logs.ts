import * as Sentry from '@sentry/react-router';

export function loader() {
  Sentry.logger.info('react-router server log', { route: 'logs' });
  return Response.json({ logged: true });
}
