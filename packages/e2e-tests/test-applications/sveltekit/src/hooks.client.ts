import * as Sentry from '@sentry/sveltekit';

Sentry.init({
  dsn: process.env.E2E_TEST_DSN,
  tunnel: `http://localhost:${
    Number(process.env.BASE_PORT) + Number(process.env.PORT_MODULO) + Number(process.env.PORT_GAP)
  }/`, // proxy server
  tracesSampleRate: 1.0,
});

const myErrorHandler = ({ error, event }: any) => {
  console.error('An error occurred on the client side:', error, event);
};

export const handleError = Sentry.handleErrorWithSentry(myErrorHandler);
