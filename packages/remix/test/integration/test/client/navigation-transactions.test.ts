import { expect, test } from '@playwright/test';
import type { Event } from '@sentry/core';
import { getMultipleSentryEnvelopeRequests } from './utils/helpers';

test('should create parameterized transactions for dynamic routes', async ({ page }) => {
  // Navigate directly to a parameterized route
  const envelopes = await getMultipleSentryEnvelopeRequests<Event>(page, 1, {
    url: '/error-boundary-capture/123',
    envelopeType: 'transaction',
  });

  const [transactionEnvelope] = envelopes;

  expect(transactionEnvelope).toBeDefined();
  expect(transactionEnvelope!.contexts?.trace?.op).toBe('pageload');
  expect(transactionEnvelope!.type).toBe('transaction');
  // Should be parameterized to /error-boundary-capture/:id
  expect(transactionEnvelope!.transaction).toBe('/error-boundary-capture/:id');
  expect(transactionEnvelope!.contexts?.trace?.data?.['sentry.source']).toBe('route');
});

test('should create parameterized transactions for nested routes', async ({ page }) => {
  // Navigate directly to a nested parameterized route
  const envelopes = await getMultipleSentryEnvelopeRequests<Event>(page, 1, {
    url: '/users/user123/posts/post456',
    envelopeType: 'transaction',
  });

  const [transactionEnvelope] = envelopes;

  expect(transactionEnvelope).toBeDefined();
  expect(transactionEnvelope!.contexts?.trace?.op).toBe('pageload');
  expect(transactionEnvelope!.type).toBe('transaction');
  // Should be parameterized to /users/:userId/posts/:postId
  expect(transactionEnvelope!.transaction).toBe('/users/:userId/posts/:postId');
  expect(transactionEnvelope!.contexts?.trace?.data?.['sentry.source']).toBe('route');
});

test('should create parameterized transactions for deeply nested routes', async ({ page }) => {
  // Navigate directly to a deeply nested route
  const envelopes = await getMultipleSentryEnvelopeRequests<Event>(page, 1, {
    url: '/deeply/level1/level2/level3',
    envelopeType: 'transaction',
  });

  const [transactionEnvelope] = envelopes;

  expect(transactionEnvelope).toBeDefined();
  expect(transactionEnvelope!.contexts?.trace?.op).toBe('pageload');
  expect(transactionEnvelope!.type).toBe('transaction');
  // Should be parameterized to /deeply/:nested/:structure/:id
  expect(transactionEnvelope!.transaction).toBe('/deeply/:nested/:structure/:id');
  expect(transactionEnvelope!.contexts?.trace?.data?.['sentry.source']).toBe('route');
});

test('should handle static routes without parameterization', async ({ page }) => {
  // Navigate directly to a static route
  const envelopes = await getMultipleSentryEnvelopeRequests<Event>(page, 1, {
    url: '/capture-exception',
    envelopeType: 'transaction',
  });

  const [transactionEnvelope] = envelopes;

  expect(transactionEnvelope).toBeDefined();
  expect(transactionEnvelope!.contexts?.trace?.op).toBe('pageload');
  expect(transactionEnvelope!.type).toBe('transaction');
  // Static routes should keep their original path
  expect(transactionEnvelope!.transaction).toBe('/capture-exception');
  // Static routes are sourced from URL since they don't have parameters
  expect(transactionEnvelope!.contexts?.trace?.data?.['sentry.source']).toBe('url');
});
