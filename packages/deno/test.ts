import * as Sentry from './build/index.js';

Sentry.init({
  dsn: 'https://1f30b300383f4904bf22a6672fe08141@o447951.ingest.sentry.io/4505526893805568',
  debug: true,
  beforeSend: event => {
    // eslint-disable-next-line no-console
    console.log('beforeSend', Deno.inspect(event.breadcrumbs, { colors: true, depth: 100 }));
    return event;
  },
});

Sentry.addBreadcrumb({ message: 'My Breadcrumb' });

await fetch('http://httpbin.org/status/200');

// eslint-disable-next-line no-console
console.log('Hello, world!');

setTimeout(() => {
  throw new Error('test');
}, 1_000);
