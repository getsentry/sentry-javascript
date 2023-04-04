import { createEventBuffer } from '../../src/eventBuffer';
import { ReplayContainer } from '../../src/replay';
import { clearSession } from '../../src/session/clearSession';
import type { RecordingOptions, ReplayPluginOptions } from '../../src/types';

export function setupReplayContainer({
  options,
  recordingOptions,
}: { options?: Partial<ReplayPluginOptions>; recordingOptions?: Partial<RecordingOptions> } = {}): ReplayContainer {
  const replay = new ReplayContainer({
    options: {
      flushMinDelay: 100,
      flushMaxDelay: 100,
      stickySession: false,
      sessionSampleRate: 0,
      errorSampleRate: 1,
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
  replay.setInitialState();
  replay['_loadAndCheckSession']();
  replay['_isEnabled'] = true;
  replay.eventBuffer = createEventBuffer({
    useCompression: options?.useCompression || false,
  });

  return replay;
}
