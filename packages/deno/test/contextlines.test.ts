import type { Client, Event } from '@sentry/core';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { contextLinesIntegration } from '../build/esm/index.js';

Deno.test('does not add an empty line after the last line of a file to the context', async () => {
  const filename = new URL(import.meta.url).pathname;
  const lines = (await Deno.readTextFile(filename)).split('\n');
  assertEquals(lines[lines.length - 1], '');
  const lastLine = lines.length - 1;

  const event: Event = {
    exception: {
      values: [{ stacktrace: { frames: [{ filename, lineno: lastLine, colno: 1, in_app: true }] } }],
    },
  };

  const processed = await contextLinesIntegration({ frameContextLines: 2 }).processEvent?.(
    event,
    {},
    undefined as unknown as Client,
  );
  const frame = processed?.exception?.values?.[0]?.stacktrace?.frames?.[0];

  assertEquals(frame?.pre_context, lines.slice(lastLine - 3, lastLine - 1));
  assertEquals(frame?.context_line, lines[lastLine - 1]);
  assertEquals(frame?.post_context, []);
});
