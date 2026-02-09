import { getDefaultIsolationScope, setTag } from '@sentry/core';
import { defineHandler } from 'nitro/h3';

export default defineHandler(() => {
  setTag('my-isolated-tag', true);
  // Check if the tag leaked into the default (global) isolation scope
  setTag('my-global-scope-isolated-tag', getDefaultIsolationScope().getScopeData().tags['my-isolated-tag']);

  throw new Error('Isolation test error');
});
