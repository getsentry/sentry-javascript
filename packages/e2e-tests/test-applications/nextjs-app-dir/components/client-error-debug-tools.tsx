'use client';

import { useContext, useState } from 'react';
import { TransactionContext } from './transaction-context';
import { captureException } from '@sentry/nextjs';

export function ClientErrorDebugTools() {
  const { transactionActive, toggle } = useContext(TransactionContext);

  const [isFetchingAPIRoute, setIsFetchingAPIRoute] = useState<boolean>();
  const [isFetchingEdgeAPIRoute, setIsFetchingEdgeAPIRoute] = useState<boolean>();
  const [isFetchingExternalAPIRoute, setIsFetchingExternalAPIRoute] = useState<boolean>();

  return (
    <div>
      <button
        onClick={() => {
          toggle();
        }}
      >
        {transactionActive ? 'Stop Transaction' : 'Start Transaction'}
      </button>
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
