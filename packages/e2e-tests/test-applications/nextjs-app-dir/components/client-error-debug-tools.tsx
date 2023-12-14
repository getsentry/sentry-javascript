'use client';

import { captureException } from '@sentry/nextjs';
import { useContext, useState } from 'react';
import { TransactionContext } from './transaction-context';

export function ClientErrorDebugTools() {
  const transactionContextValue = useContext(TransactionContext);
  const [transactionName, setTransactionName] = useState<string>('');

  const [isFetchingAPIRoute, setIsFetchingAPIRoute] = useState<boolean>();
  const [isFetchingEdgeAPIRoute, setIsFetchingEdgeAPIRoute] = useState<boolean>();
  const [isFetchingExternalAPIRoute, setIsFetchingExternalAPIRoute] = useState<boolean>();
  const [renderError, setRenderError] = useState<boolean>();

  if (renderError) {
    throw new Error('Render Error');
  }

  return (
    <div>
      {transactionContextValue.transactionActive ? (
        <button
          type="button"
          onClick={() => {
            transactionContextValue.stop();
            setTransactionName('');
          }}
        >
          Stop transaction
        </button>
      ) : (
        <>
          <input
            type="text"
            placeholder="Transaction name"
            value={transactionName}
            onChange={e => {
              setTransactionName(e.target.value);
            }}
          />
          <button
            type="button"
            onClick={() => {
              transactionContextValue.start(transactionName);
            }}
          >
            Start transaction
          </button>
        </>
      )}
      <br />
      <br />
      <button
        type="button"
        onClick={() => {
          throw new Error('Click Error');
        }}
      >
        Throw error
      </button>
      <br />
      <button
        type="button"
        onClick={() => {
          return Promise.reject('Promise Click Error');
        }}
      >
        Throw promise rejection
      </button>
      <br />
      <button
        type="button"
        onClick={() => {
          setRenderError(true);
        }}
      >
        Cause render error
      </button>
      <br />
      <br />
      <button
        type="button"
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
        type="button"
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
        type="button"
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
