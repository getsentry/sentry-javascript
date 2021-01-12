import { getGlobalObject } from '@sentry/utils';

import * as Sentry from '../src/index';

const global = getGlobalObject<Window>();

describe('event SDK info', () => {
  it('adds SDK metadata globally', () => {
    // the SDK data is set when we import from (and therefore run) `../src/index.ts` - it sets the vue part itself,
    // and the browser part gets set when it imports from @sentry/browser - so no action is necessary here before we run
    // the `expect`s

    expect(global.__SENTRY__?.sdkInfo).toBeDefined();
    expect(global.__SENTRY__?.sdkInfo?.name).toEqual('sentry.javascript.vue');
    expect(global.__SENTRY__?.sdkInfo?.version).toEqual(Sentry.SDK_VERSION);
    expect(global.__SENTRY__?.sdkInfo?.packages).toEqual(
      expect.arrayContaining([
        { name: 'npm:@sentry/vue', version: Sentry.SDK_VERSION },
        { name: 'npm:@sentry/browser', version: Sentry.SDK_VERSION },
      ]),
    );
  });
});
