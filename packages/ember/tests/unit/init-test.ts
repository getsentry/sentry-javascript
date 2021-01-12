import { module, test } from 'qunit';
import * as Sentry from '@sentry/ember';
import { getGlobalObject } from '@sentry/utils';

const global = getGlobalObject<Window>();

module('Unit | SDK initialization', function() {
  test('adds SDK metadata globally', function(assert) {
    // the SDK data is set when we import from @sentry/ember (and therefore run `addon/index.ts`) - it sets the ember
    // part itself, and the browser part gets set when it imports from @sentry/browser - so no action is necessary here
    // before we run the `assert`s

    assert.equal(global.__SENTRY__?.sdkInfo?.name, 'sentry.javascript.ember');
    assert.equal(global.__SENTRY__?.sdkInfo?.version, Sentry.SDK_VERSION);
    assert.deepEqual(global.__SENTRY__?.sdkInfo?.packages, [
      { name: 'npm:@sentry/browser', version: Sentry.SDK_VERSION },
      { name: 'npm:@sentry/ember', version: Sentry.SDK_VERSION },
    ]);
  });
});
