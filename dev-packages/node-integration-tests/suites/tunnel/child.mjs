import * as Sentry from '@sentry/node';

console.log('Child process started');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tunnel: `http://localhost:${process.env.PORT}/tunnel`,
  autoSessionTracking: false,
  transportOptions: {
    // I'm sure express.raw() can be made to work without this, but probably not worth trying to figure out how
    headers:{
      "Content-Type": "application/octet-stream",
    }
  }
});

throw new Error('Test error in child process');
