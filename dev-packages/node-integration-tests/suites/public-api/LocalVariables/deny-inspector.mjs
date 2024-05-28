import * as Sentry from '@sentry/node';
import Hook from 'import-in-the-middle';

Hook((_, name) => {
  if (name === 'inspector') {
    throw new Error('No inspector!');
  }
  if (name === 'node:inspector') {
    throw new Error('No inspector!');
  }
});

Sentry.init({});
