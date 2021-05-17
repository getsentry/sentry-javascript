// Normally this is where the user would call `Sentry.init()` for their server SDK. Not calling it here (tests can call
// it themselves instead) since different tests almost certainly will want different init options.

// import * as Sentry from '@sentry/nextjs';

// Sentry.init({
//   dsn: 'https://dogsarebadatkeepingsecrets@squirrelchasers.ingest.sentry.io/12312012',
//   tracesSampleRate: 1.0,
//   debug: true,
//   autoSessionTracking: false,
//   integrations: [new Sentry.Integrations.Http({ tracing: true })],
// });
