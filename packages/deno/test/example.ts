import * as Sentry from '../build/esm/index.js';

Sentry.init({
  dsn: 'https://1234@some-domain.com/4505526893805568',
});

Sentry.addBreadcrumb({ message: 'My Breadcrumb' });

// eslint-disable-next-line no-console
console.log('App has started');

setTimeout(() => {
  Deno.exit();
}, 1_000);
