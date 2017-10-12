import * as Sentry from '@sentry/core';
import { Browser } from '../lib/Browser';

let sentry = new Sentry.Core('https://53039209a22b4ec1bcc296a3c9fdecd6@sentry.io/4291');
sentry.register(Browser);

sentry.install();

sentry.captureMessage('PICKLE RIIIICK!');
sentry.captureException(new Error('YOYOYOY'));
// throw new Error('YP Test');
