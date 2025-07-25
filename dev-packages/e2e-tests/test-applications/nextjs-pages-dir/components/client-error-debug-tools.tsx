'use client';

import { captureException } from '@sentry/nextjs';
import { useContext, useState } from 'react';
import { SpanContext } from './span-context';

export function ClientErrorDebugTools() {
  const spanContextValue = useContext(SpanContext);
  const [spanName, setSpanName] = useState<string>('');

  const [isFetchingAPIRoute, setIsFetchingAPIRoute] = useState<boolean>();
  const [isFetchingEdgeAPIRoute, setIsFetchingEdgeAPIRoute] = useState<boolean>();
  const [isFetchingExternalAPIRoute, setIsFetchingExternalAPIRoute] = useState<boolean>();
  const [renderError, setRenderError] = useState<boolean>();

  if (renderError) {
    throw new Error('Render Error');
  }

  return (
    <div>
      {spanContextValue.spanActive ? (
        <button
          onClick={() => {
            spanContextValue.stop();
            setSpanName('');
          }}
        >
          Stop span
        </button>
      ) : (
        <>
          <input
            type="text"
            placeholder="Span name"
            value={spanName}
            onChange={e => {
              setSpanName(e.target.value);
            }}
          />
          <button
            onClick={() => {
              spanContextValue.start(spanName);
            }}
          >
            Start span
          </button>
        </>
      )}
      <br />
      <br />
      <button
        onClick={() => {
          throw new Error('Click Error');
        }}
      >
        Throw error
      </button>
      <br />
      <button
        onClick={() => {
          return Promise.reject('Promise Click Error');
        }}
      >
        Throw promise rejection
      </button>
      <br />
      <button
        onClick={() => {
          setRenderError(true);
        }}
      >
        Cause render error
      </button>
      <br />
      <br />
      <button
        onClick={async () => {
          setIsFetchingAPIRoute(true);
          try {
            await fetch('/api/endpoint');
          } catch (e) {
            captureException(e);
          }
          setIsFetchingAPIRoute(false);
        }}
        disabled={isFetchingAPIRoute}
      >
        Send request to Next.js API route
      </button>
      <br />
      <button
        onClick={async () => {
          setIsFetchingEdgeAPIRoute(true);
          try {
            await fetch('/api/edge-endpoint');
          } catch (e) {
            captureException(e);
          }
          setIsFetchingEdgeAPIRoute(false);
        }}
        disabled={isFetchingEdgeAPIRoute}
      >
        Send request to Next.js Edge API route
      </button>
      <br />
      <button
        onClick={async () => {
          setIsFetchingExternalAPIRoute(true);
          try {
            await fetch('https://example.com/', { mode: 'no-cors' });
          } catch (e) {
            captureException(e);
          }
          setIsFetchingExternalAPIRoute(false);
        }}
        disabled={isFetchingExternalAPIRoute}
      >
        Send request to external API route
      </button>
      <br />
    </div>
  );
}
