'use client';

import { useContext, useState } from 'react';
import { TransactionContext } from './transaction-context';
import { captureException } from '@sentry/nextjs';

export function ClientErrorDebugTools() {
  const transactionContextValue = useContext(TransactionContext);
  const [transactionName, setTransactionName] = useState<string>('');
  const [getRequestTarget, setGetRequestTarget] = useState<string>('');
  const [postRequestTarget, setPostRequestTarget] = useState<string>('');

  const [isFetchingAPIRoute, setIsFetchingAPIRoute] = useState<boolean>();
  const [isFetchingEdgeAPIRoute, setIsFetchingEdgeAPIRoute] = useState<boolean>();
  const [isFetchingExternalAPIRoute, setIsFetchingExternalAPIRoute] = useState<boolean>();
  const [isSendeingGetRequest, setIsSendingGetRequest] = useState<boolean>();
  const [isSendeingPostRequest, setIsSendingPostRequest] = useState<boolean>();
  const [renderError, setRenderError] = useState<boolean>();

  if (renderError) {
    throw new Error('Render Error');
  }

  return (
    <div>
      {transactionContextValue.transactionActive ? (
        <button
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
      <input
        type="text"
        placeholder="GET request target"
        value={getRequestTarget}
        onChange={e => {
          setGetRequestTarget(e.target.value);
        }}
      />
      <button
        onClick={async () => {
          setIsSendingGetRequest(true);
          try {
            await fetch(getRequestTarget);
          } catch (e) {
            captureException(e);
          }
          setIsSendingGetRequest(false);
        }}
      >
        Send GET request
      </button>
      <br />
      <input
        type="text"
        placeholder="POST request target"
        value={postRequestTarget}
        onChange={e => {
          setPostRequestTarget(e.target.value);
        }}
      />
      <button
        onClick={async () => {
          setIsSendingPostRequest(true);
          try {
            await fetch(postRequestTarget, {
              method: 'POST',
            });
          } catch (e) {
            captureException(e);
          }
          setIsSendingPostRequest(false);
        }}
      >
        Send POST request
      </button>
    </div>
  );
}
