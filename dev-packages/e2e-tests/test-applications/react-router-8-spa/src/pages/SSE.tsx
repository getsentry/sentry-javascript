import * as Sentry from '@sentry/react';
import * as React from 'react';

const fetchSSE = async ({ timeout, abort = false }: { timeout: boolean; abort?: boolean }) => {
  Sentry.startSpanManual({ name: 'sse stream using fetch' }, async span => {
    const controller = new AbortController();

    const res = await Sentry.startSpan({ name: 'sse fetch call' }, async () => {
      const endpoint = `http://localhost:8080/${timeout ? 'sse-timeout' : 'sse'}`;

      const signal = controller.signal;
      return await fetch(endpoint, { signal });
    });

    const stream = res.body;
    const reader = stream?.getReader();

    const readChunk = async () => {
      if (abort) {
        controller.abort();
      }
      const readRes = await reader?.read();
      if (readRes?.done) {
        return;
      }

      new TextDecoder().decode(readRes?.value);

      await readChunk();
    };

    try {
      await readChunk();
    } catch (error) {
      console.error('Could not fetch sse', error);
    }

    span.end();
  });
};

const SSE = () => {
  return (
    <>
      <button id="fetch-button" onClick={() => fetchSSE({ timeout: false })}>
        Fetch SSE
      </button>
      <button id="fetch-timeout-button" onClick={() => fetchSSE({ timeout: true })}>
        Fetch timeout SSE
      </button>
      <button id="fetch-sse-abort" onClick={() => fetchSSE({ timeout: false, abort: true })}>
        Fetch SSE with error
      </button>
    </>
  );
};

export default SSE;
