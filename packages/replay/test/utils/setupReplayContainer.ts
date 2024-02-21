import { MAX_REPLAY_DURATION } from '../../src/constants';
import { createEventBuffer } from '../../src/eventBuffer';
import { ReplayContainer } from '../../src/replay';
import { clearSession } from '../../src/session/clearSession';
import type { RecordingOptions, ReplayPluginOptions } from '../../src/types';

const DEFAULT_OPTIONS = {
  flushMinDelay: 100,
  flushMaxDelay: 100,
  minReplayDuration: 0,
  maxReplayDuration: MAX_REPLAY_DURATION,
  stickySession: false,
  sessionSampleRate: 0,
  errorSampleRate: 1,
  useCompression: false,
  blockAllMedia: true,
  networkDetailAllowUrls: [],
  networkDetailDenyUrls: [],
  networkCaptureBodies: true,
  networkRequestHeaders: [],
  networkResponseHeaders: [],
  mutationLimit: 1500,
  mutationBreadcrumbLimit: 500,
  slowClickTimeout: 7_000,
  slowClickIgnoreSelectors: [],
  _experiments: {},
};

export function setupReplayContainer({
  options,
  recordingOptions,
}: { options?: Partial<ReplayPluginOptions>; recordingOptions?: Partial<RecordingOptions> } = {}): ReplayContainer {
  const replay = new ReplayContainer({
    options: {
      ...DEFAULT_OPTIONS,
      maskAllInputs: !!recordingOptions?.maskAllInputs,
      maskAllText: !!recordingOptions?.maskAllText,
      ...options,
    },
    recordingOptions: {
      maskAllText: true,
      ...recordingOptions,
    },
  });

  clearSession(replay);
  replay['_initializeSessionForSampling']();
  replay.setInitialState();
  replay['_isEnabled'] = true;
  replay.eventBuffer = createEventBuffer({
    useCompression: options?.useCompression || false,
  });

  return replay;
}

export const DEFAULT_OPTIONS_EVENT_PAYLOAD = {
  sessionSampleRate: DEFAULT_OPTIONS.sessionSampleRate,
  errorSampleRate: DEFAULT_OPTIONS.errorSampleRate,
  useCompressionOption: false,
  blockAllMedia: DEFAULT_OPTIONS.blockAllMedia,
  maskAllText: false,
  maskAllInputs: false,
  useCompression: DEFAULT_OPTIONS.useCompression,
  mutationLimit: DEFAULT_OPTIONS.mutationLimit,
  mutationBreadcrumbLimit: DEFAULT_OPTIONS.mutationBreadcrumbLimit,
  networkDetailHasUrls: DEFAULT_OPTIONS.networkDetailAllowUrls.length > 0,
  networkCaptureBodies: DEFAULT_OPTIONS.networkCaptureBodies,
  networkRequestHeaders: DEFAULT_OPTIONS.networkRequestHeaders.length > 0,
  networkResponseHeaders: DEFAULT_OPTIONS.networkResponseHeaders.length > 0,
};
