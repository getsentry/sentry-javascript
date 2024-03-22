import { captureException, init } from '../../../../packages/browser';

init({
  dsn: process.env.E2E_TEST_DSN,
});

setTimeout(() => {
  const eventId = captureException(new Error('I am an error!'));
  window.capturedExceptionId = eventId;
}, 200);
