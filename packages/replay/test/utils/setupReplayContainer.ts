import { SESSION_IDLE_DURATION } from '../../src/constants';
import { createEventBuffer } from '../../src/eventBuffer';
import { ReplayContainer } from '../../src/replay';
import type { RecordingOptions, ReplayPluginOptions } from '../../src/types';
import { clearSession } from './clearSession';

export function setupReplayContainer({
  options,
  recordingOptions,
}: { options?: Partial<ReplayPluginOptions>; recordingOptions?: Partial<RecordingOptions> } = {}): ReplayContainer {
  const replay = new ReplayContainer({
    options: {
      flushMinDelay: 100,
      flushMaxDelay: 100,
      stickySession: false,
      sessionSampleRate: 1,
      errorSampleRate: 0,
      useCompression: false,
      blockAllMedia: true,
      _experiments: {},
      ...options,
    },
    recordingOptions: {
      maskAllText: true,
      ...recordingOptions,
    },
  });

  clearSession(replay);
  replay['_setInitialState']();
  replay['_loadAndCheckSession'](SESSION_IDLE_DURATION);
  replay['_isEnabled'] = true;
  replay.recordingMode = replay.session?.sampled === 'error' ? 'error' : 'session';
  replay.eventBuffer = createEventBuffer({
    useCompression: options?.useCompression || false,
    keepLastCheckout: replay.recordingMode === 'error',
  });

  return replay;
}
