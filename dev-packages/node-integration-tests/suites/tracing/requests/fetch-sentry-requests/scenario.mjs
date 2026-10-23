import * as Sentry from '@sentry/node';

// Another SDK in this process (e.g. the Next.js Edge Runtime SDK) sends to Sentry without suppressing our tracing
const sentryUrl = `${process.env.SERVER_URL}/api/1337/envelope/?sentry_version=7&sentry_key=public&sentry_client=other`;

Sentry.startSpan({ name: 'test_span' }, async () => {
  await fetch(sentryUrl).then(res => res.text());
  const response = await fetch(`${process.env.SERVER_URL}/api/v0`);

  await response.text();
});
