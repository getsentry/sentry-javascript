import * as Sentry from '@sentry/react';
// biome-ignore lint/nursery/noUnusedImports: Need React import for JSX
import * as React from 'react';

const fetchSSE = async () => {
  Sentry.startSpanManual({ name: 'sse stream using fetch' }, async span => {
    const res = await Sentry.startSpan({ name: 'sse fetch call' }, async () => {
      return await fetch('http://localhost:8080/sse');
    });

    const stream = res.body;
    const reader = stream?.getReader();

    const readChunk = async () => {
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
    <button id="fetch-button" onClick={fetchSSE}>
      Fetch SSE
    </button>
  );
};

export default SSE;
