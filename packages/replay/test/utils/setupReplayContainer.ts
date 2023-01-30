import { SESSION_IDLE_DURATION } from '../../src/constants';
import { createEventBuffer } from '../../src/eventBuffer';
import { ReplayContainer } from '../../src/replay';
import type { RecordingOptions, ReplayPluginOptions } from '../../src/types';
import { clearSession } from './clearSession';

export function setupReplayContainer({
  options,
  recordingOptions,
}: { options?: ReplayPluginOptions; recordingOptions?: RecordingOptions } = {}): ReplayContainer {
  const replay = new ReplayContainer({
    options: {
      flushMinDelay: 100,
      flushMaxDelay: 100,
      stickySession: false,
      sessionSampleRate: 0,
      errorSampleRate: 1,
      useCompression: false,
      maskAllText: true,
      blockAllMedia: true,
      _experiments: {},
      ...options,
    },
    recordingOptions: {
      ...recordingOptions,
    },
  });

  clearSession(replay);
  replay['_setInitialState']();
  replay['_loadAndCheckSession'](SESSION_IDLE_DURATION);
  replay['_isEnabled'] = true;
  replay.eventBuffer = createEventBuffer({
    useCompression: false,
  });

  return replay;
}
