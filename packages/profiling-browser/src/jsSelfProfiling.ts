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

export interface ProcessedJSSelfProfile extends JSSelfProfile {
  profile_id: string;
}

type BufferFullCallback = (trace: JSSelfProfile) => void;

interface JSSelfProfiler {
  sampleInterval: number;
  stopped: boolean;

  stop: () => Promise<JSSelfProfile>;
  addEventListener(event: 'samplebufferfull', callback: BufferFullCallback): void;
}

export declare const JSSelfProfiler: {
  new (options: { sampleInterval: number; maxBufferSize: number }): JSSelfProfiler;
};

declare global {
  interface Window {
    Profiler: typeof JSSelfProfiler | undefined;
  }
}

export interface RawThreadCpuProfile extends JSSelfProfile {
  profile_id: string;
}
export interface ThreadCpuProfile {
  samples: {
    stack_id: number;
    thread_id: string;
    elapsed_since_start_ns: string;
  }[];
  stacks: number[][];
  frames: {
    function: string;
    file: string | undefined;
    line: number | undefined;
    column: number | undefined;
  }[];
  thread_metadata: Record<string, { name?: string; priority?: number }>;
  queue_metadata?: Record<string, { label: string }>;
}
