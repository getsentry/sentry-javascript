// Type definitions for https://wicg.github.io/js-self-profiling/
type JSSelfProfileSampleMarker = 'script' | 'gc' | 'style' | 'layout' | 'paint' | 'other';

export type JSSelfProfileSample = {
  timestamp: number;
  stackId?: number;
  marker?: JSSelfProfileSampleMarker;
};

export type JSSelfProfileStack = {
  frameId: number;
  parentId?: number;
};

export type JSSelfProfileFrame = {
  name: string;
  resourceId?: number;
  line?: number;
  column?: number;
};

export type JSSelfProfile = {
  resources: string[];
  frames: JSSelfProfileFrame[];
  stacks: JSSelfProfileStack[];
  samples: JSSelfProfileSample[];
};

type BufferFullCallback = (trace: JSSelfProfile) => void;

export interface JSSelfProfiler {
  sampleInterval: number;
  stopped: boolean;

  stop: () => Promise<JSSelfProfile>;
  addEventListener(event: 'samplebufferfull', callback: BufferFullCallback): void;
}

export declare const JSSelfProfilerConstructor: {
  new (options: { sampleInterval: number; maxBufferSize: number }): JSSelfProfiler;
};

declare global {
  interface Window {
    Profiler: typeof JSSelfProfilerConstructor | undefined;
  }
}

