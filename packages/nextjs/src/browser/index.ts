import { initAndBind } from '@sentry/core';

import { NextjsOptions } from '../common/nextjsOptions';
import { NextjsBrowserClient } from './browserClient';

export * from './exports';

/** Initializes the Sentry browser SDK. */
export function init(initOptions: NextjsOptions): void {
  // TODO: handle integrations
  // eslint-disable-next-line no-console
  console.log('initializing browser...');
  initAndBind(NextjsBrowserClient, initOptions);
}

// TODO: same export functions as in `src/sdk.ts` ?
