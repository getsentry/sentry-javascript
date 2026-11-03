import { startMockSentryServer } from '@sentry-internal/test-utils';

// Not a hidden dir, which the SDK's default `./.*/**/*.map` cleanup would empty after the upload
startMockSentryServer({ org: 'test-org', outputDir: 'tmp_mock_chunks' });
