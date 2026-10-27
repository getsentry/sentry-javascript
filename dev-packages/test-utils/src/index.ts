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
  collectStreamedSpansUntilSegment,
  collectSpanNamesUntilSegment,
  getSpanOp,
} from './event-proxy-server';
export type { SerializedStreamedSpan } from '@sentry/core';
export { isServerSpanAt, makeClientReportEnvelope, watchForTunnelSpan } from './tunnel';

export {
  findAbsolutePathImports,
  findSourceMapFiles,
  findSourceMappingUrlComments,
  findInjectedDebugIds,
  findDebugIdsInFilesWithGlobCharacters,
  findFilesWithMultipleDebugIds,
  findFilesWithForeignSourcemaps,
  bundleReferencesModule,
} from './build-output';
export type { OutputScanOptions } from './build-output';

export { assertBundlerInstrumentation } from './bundler-instrumentation';
export type { InstrumentationFixture } from './bundler-instrumentation';

export { hidePage, waitForSoftNavigation } from './page';
export { getPlaywrightConfig } from './playwright-config';
export { getRuntime } from './runtime';
export type { Runtime } from './runtime';
export { createBasicSentryServer, createTestServer } from './server';

export { startNodeServer } from './node-server';
export type { NodeServerOptions, NodeServer } from './node-server';

export { startMockSentryServer } from './mock-sentry-server';
export type { MockSentryServerOptions, MockSentryServer } from './mock-sentry-server';
export * from './sourcemap-upload-utils';
export { assertSourceMapUpload } from './sourcemap-upload-assertions';
export type { SourceMapUploadAssertionOptions, SourceMapUploadAssertionResult } from './sourcemap-upload-assertions';

export { CDPClient } from './cdp-client';
export type { CDPClientOptions } from './cdp-client';

export { MemoryProfiler } from './memory-profiler';
export type { MemoryProfilerOptions, SnapshotStats, SnapshotComparisonResult } from './memory-profiler';

export { waitForDebuggerReady } from './anr';
