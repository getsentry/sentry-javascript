import * as Sentry from '@sentry/nextjs';

declare global {
  namespace globalThis {
    var transactionIds: string[];
  }
}

export function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    Sentry.init({
      environment: 'qa', // dynamic sampling bias to keep transactions
      dsn: process.env.NEXT_PUBLIC_E2E_TEST_DSN,
      // Adjust this value in production, or use tracesSampler for greater control
      tracesSampleRate: 1.0,
      integrations: [Sentry.localVariablesIntegration()],
    });

    Sentry.addEventProcessor(event => {
      global.transactionIds = global.transactionIds || [];

      if (event.type === 'transaction') {
        const eventId = event.event_id;

        if (eventId) {
          global.transactionIds.push(eventId);
        }
      }

      return event;
    });
  }
}
