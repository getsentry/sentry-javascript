export {
  startProxyServer,
  startEventProxyServer,
  waitForEnvelopeItem,
  waitForError,
  waitForRequest,
  waitForTransaction,
  waitForSession,
  waitForPlainRequest,
  waitForMetric,
  waitForStreamedSpan,
  waitForStreamedSpans,
  waitForStreamedSpanEnvelope,
  collectStreamedSpans,
  getSpanOp,
} from './event-proxy-server';
export type { SerializedStreamedSpan } from '@sentry/core';

export {
  findAbsolutePathImports,
  findSourceMapFiles,
  findSourceMappingUrlComments,
  findInjectedDebugIds,
  bundleReferencesModule,
} from './build-output';
export type { OutputScanOptions } from './build-output';

export { assertBundlerInstrumentation } from './bundler-instrumentation';
export type { InstrumentationFixture } from './bundler-instrumentation';

export { getPlaywrightConfig } from './playwright-config';
export { createBasicSentryServer, createTestServer } from './server';

export { startMockSentryServer } from './mock-sentry-server';
export type { MockSentryServerOptions, MockSentryServer } from './mock-sentry-server';
export * from './sourcemap-upload-utils';

export { CDPClient } from './cdp-client';
export type { CDPClientOptions } from './cdp-client';

export { MemoryProfiler } from './memory-profiler';
export type { MemoryProfilerOptions, SnapshotStats, SnapshotComparisonResult } from './memory-profiler';

export { waitForDebuggerReady } from './anr';
