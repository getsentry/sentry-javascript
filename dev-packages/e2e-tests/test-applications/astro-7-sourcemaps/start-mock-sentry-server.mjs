import { startMockSentryServer } from '@sentry-internal/test-utils';

startMockSentryServer({ org: 'test-org', outputDir: 'tmp_mock_chunks' });
