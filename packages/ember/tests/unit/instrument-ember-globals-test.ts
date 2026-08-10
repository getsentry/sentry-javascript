import type { RenderEntries } from '@sentry/ember/utils/instrumentEmberGlobals';
import {
  _processComponentRenderAfter,
  _processComponentRenderBefore,
} from '@sentry/ember/utils/instrumentEmberGlobals';
import { setupTest } from 'ember-qunit';
import { module, test } from 'qunit';
import type { SentryTestContext } from '../helpers/setup-sentry';
import { setupSentryTest } from '../helpers/setup-sentry';

module('Unit | Utility | instrument-ember-globals', function (hooks) {
  setupTest(hooks);
  setupSentryTest(hooks);

  test('_processComponentRenderAfter removes the entry recorded for the render', function (this: SentryTestContext, assert) {
    const beforeEntries: RenderEntries = new WeakMap();
    const payload = { containerKey: 'component:test-component', initialRender: true as const, object: '<ember123>' };

    _processComponentRenderBefore(payload, beforeEntries);
    assert.true(beforeEntries.has(payload), 'Entry is recorded when the render starts');

    _processComponentRenderAfter(payload, beforeEntries, 'ui.ember.component.render', 1_000);
    assert.false(
      beforeEntries.has(payload),
      'Entry is removed when the render finishes, so the payload (and the component instance it references) is not retained',
    );
  });

  test('_processComponentRenderAfter removes the entry even when the render is long enough to create a span', function (this: SentryTestContext, assert) {
    const beforeEntries: RenderEntries = new WeakMap();
    const payload = { containerKey: 'component:test-component', initialRender: true as const, object: '<ember124>' };

    _processComponentRenderBefore(payload, beforeEntries);
    _processComponentRenderAfter(payload, beforeEntries, 'ui.ember.component.render', 0);

    assert.false(beforeEntries.has(payload), 'Entry is removed after the span is created');
  });

  test('_processComponentRenderAfter without a matching before-entry leaves other entries alone', function (this: SentryTestContext, assert) {
    const beforeEntries: RenderEntries = new WeakMap();
    const trackedPayload = { containerKey: 'component:tracked', initialRender: true as const, object: '<ember125>' };
    const unknownPayload = { containerKey: 'component:unknown', initialRender: true as const, object: '<ember126>' };

    _processComponentRenderBefore(trackedPayload, beforeEntries);
    _processComponentRenderAfter(unknownPayload, beforeEntries, 'ui.ember.component.render', 1_000);

    assert.true(beforeEntries.has(trackedPayload), 'The in-flight entry is still tracked');
    assert.false(beforeEntries.has(unknownPayload), 'The unknown payload was not added');
  });
});
