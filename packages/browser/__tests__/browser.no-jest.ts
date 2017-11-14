import * as Sentry from '@sentry/core';
import { Browser } from '../lib/Browser';

Sentry.create('https://53039209a22b4ec1bcc296a3c9fdecd6@sentry.io/4291')
  .use(Browser)
  .install();
Sentry.getSharedClient().setTagsContext({ cordova: true });
Sentry.getSharedClient().captureBreadcrumb({ message: 'HOHOHOHO' });
Sentry.getSharedClient().captureMessage('PICKLE RIIIICK!');
Sentry.getSharedClient().captureException(new Error('YOYOYOY'));
// throw new Error('YP Test');
