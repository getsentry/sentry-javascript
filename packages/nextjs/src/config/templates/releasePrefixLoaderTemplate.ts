/* eslint-disable no-constant-condition */

import { GLOBAL_OBJ } from '@sentry/utils';

import { EnhancedGlobal } from '../types';

const globalObj = GLOBAL_OBJ as EnhancedGlobal;

globalObj.SENTRY_RELEASE = { id: '__RELEASE__' };

// Enable module federation support (see https://github.com/getsentry/sentry-webpack-plugin/pull/307)
if ('__PROJECT__') {
  const key = '__ORG__' ? '__PROJECT__@__ORG__' : '__PROJECT__';
  globalObj.SENTRY_RELEASES = globalObj.SENTRY_RELEASES || {};
  globalObj.SENTRY_RELEASES[key] = { id: '__RELEASE__' };
}
