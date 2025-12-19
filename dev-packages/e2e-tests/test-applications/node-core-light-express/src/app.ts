import * as Sentry from '@sentry/node-core/light';
import express from 'express';

// IMPORTANT: Initialize Sentry BEFORE creating the Express app
// This is required for automatic request isolation to work
Sentry.init({
  dsn: process.env.E2E_TEST_DSN,
  debug: true,
  tracesSampleRate: 1.0,
  tunnel: 'http://localhost:3031/', // Use event proxy for testing
});

// Create Express app AFTER Sentry.init()
const app = express();
const port = 3030;

app.get('/test-error', (_req, res) => {
  Sentry.setTag('test', 'error');
  Sentry.captureException(new Error('Test error from light mode'));
  res.status(500).json({ error: 'Error captured' });
});

app.get('/test-isolation/:userId', async (req, res) => {
  const userId = req.params.userId;

  const isolationScope = Sentry.getIsolationScope();
  const currentScope = Sentry.getCurrentScope();

  Sentry.setUser({ id: userId });
  Sentry.setTag('user_id', userId);

  currentScope.setTag('processing_user', userId);
  currentScope.setContext('api_context', {
    userId,
    timestamp: Date.now(),
  });

  // Simulate async work with variance so we run into cases where
  // the next request comes in before the async work is complete
  // to showcase proper request isolation
  await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 100));

  // Verify isolation after async operations
  const finalIsolationData = isolationScope.getScopeData();
  const finalCurrentData = currentScope.getScopeData();

  const isIsolated =
    finalIsolationData.user?.id === userId &&
    finalIsolationData.tags?.user_id === userId &&
    finalCurrentData.contexts?.api_context?.userId === userId;

  res.json({
    userId,
    isIsolated,
    scope: {
      userId: finalIsolationData.user?.id,
      userIdTag: finalIsolationData.tags?.user_id,
      currentUserId: finalCurrentData.contexts?.api_context?.userId,
    },
  });
});

app.get('/test-isolation-error/:userId', (req, res) => {
  const userId = req.params.userId;
  Sentry.setTag('user_id', userId);
  Sentry.setUser({ id: userId });

  Sentry.captureException(new Error(`Error for user ${userId}`));
  res.json({ userId, captured: true });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
