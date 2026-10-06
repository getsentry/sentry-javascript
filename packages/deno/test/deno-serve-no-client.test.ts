// <reference lib="deno.ns" />

/**
 * Lives in its own file because it wipes the global carrier; Deno gives each test
 * file a fresh module graph, so the wipe stays contained here.
 */

import { getMainCarrier } from '@sentry/core';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { assertNotEquals } from 'https://deno.land/std@0.212.0/assert/assert_not_equals.ts';
import { init } from '../build/esm/index.js';

function resetGlobals(): void {
  getMainCarrier().__SENTRY__ = undefined;
}

// Captured before any init() so the patch assertion below compares against the
// genuinely unpatched function; the patch installs once per module graph.
const unpatchedServe = Deno.serve;

function initPatchedServeWithoutClient(): void {
  // Install the Deno.serve patch, then unbind the client. The patch is installed by
  // `Client.init()`, which a directly-constructed client also runs without ever
  // calling `setCurrentClient` — so a live patch with no bound client is a real state.
  resetGlobals();
  init({ dsn: 'https://username@domain/123' });
  assertNotEquals(Deno.serve, unpatchedServe, 'Deno.serve was not patched; test would pass vacuously');
  resetGlobals();
}

Deno.test('Deno.serve keeps serving when no client is bound', async () => {
  initPatchedServeWithoutClient();

  const abortController = new AbortController();
  let onListen: ((_: unknown) => void) | undefined = undefined;
  const p = new Promise(resolve => (onListen = resolve));
  const server = Deno.serve({ port: 0, signal: abortController.signal, onListen }, () => {
    return new Response('Hello World');
  });
  await p;

  const response = await fetch(`http://localhost:${server.addr.port}/test`);
  assertEquals(response.status, 200);
  assertEquals(await response.text(), 'Hello World');

  abortController.abort();
  await server.finished;
});

Deno.test('Deno.serve propagates handler errors as 500 when no client is bound', async () => {
  initPatchedServeWithoutClient();

  const abortController = new AbortController();
  let onListen: ((_: unknown) => void) | undefined = undefined;
  const p = new Promise(resolve => (onListen = resolve));
  const server = Deno.serve({ port: 0, signal: abortController.signal, onListen }, () => {
    throw new Error('handler blew up');
  });
  await p;

  const response = await fetch(`http://localhost:${server.addr.port}/boom`);
  assertEquals(response.status, 500);
  await response.body?.cancel();

  abortController.abort();
  await server.finished;
});
