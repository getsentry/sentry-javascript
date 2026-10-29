import { startMockSentryServer } from '@sentry-internal/test-utils';

// Not a dot-folder: the SDK deletes `.*/**/*.map`, which would remove the maps the server extracts here.
startMockSentryServer({ outputDir: 'tmp_mock_chunks' });
