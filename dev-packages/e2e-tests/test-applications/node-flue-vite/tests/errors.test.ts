import { expect, test } from '@playwright/test';
import { getArtifactBundles, getDebugIdPairs, loadMockServerResults, waitForError } from '@sentry-internal/test-utils';
import { newConversationId, runAgentTurn } from './utils';

const APP = 'node-flue-vite';

test('reports a Flue tool error with the release and debug ID of the build', async ({ baseURL }) => {
  const errorPromise = waitForError(
    APP,
    event => event.exception?.values?.[0]?.value === 'Intentional flue tool failure',
  );

  await runAgentTurn(baseURL!, newConversationId('failure'), 'Please call fail_now to trigger a failure.');

  const error = await errorPromise;
  expect(error.exception?.values?.[0]?.mechanism?.type).toBe('auto.ai.flue');
  expect(error.release).toBe('test-release');

  // Sentry symbolicates the frame with the uploaded source map that has the same debug ID.
  const topFrame = error.exception?.values?.[0]?.stacktrace?.frames?.at(-1);
  const image = error.debug_meta?.images?.find(image => image.code_file === topFrame?.filename);
  const uploadedDebugIds = getDebugIdPairs(getArtifactBundles(loadMockServerResults())).map(pair =>
    pair.debugId.toLowerCase(),
  );
  expect(topFrame?.filename).toMatch(/\/dist\/[^/]+\.mjs$/);
  expect(uploadedDebugIds).toContain(image?.debug_id);
});
