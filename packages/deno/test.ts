import * as Sentry from './build/esm/index.js';

Sentry.init({
  dsn: 'https://1f30b300383f4904bf22a6672fe08141@o447951.ingest.sentry.io/4505526893805568',
  debug: true,
  beforeSend: event => {
    console.log('beforeSend', Deno.inspect(event.breadcrumbs, { colors: true, depth: 100 }));
    return null;
  },
});

Sentry.addBreadcrumb({ message: 'My Breadcrumb' });

console.log('Hello, world!');

setTimeout(() => {
  throw new Error('test');
}, 1_000);
