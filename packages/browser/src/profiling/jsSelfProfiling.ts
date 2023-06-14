import type { DebugImage } from '@sentry/types';
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

export interface SentryProfile {
  event_id: string;
  version: string;
  os: {
    name: string;
    version: string;
    build_number: string;
  };
  runtime: {
    name: string;
    version: string;
  };
  device: {
    architecture: string;
    is_emulator: boolean;
    locale: string;
    manufacturer: string;
    model: string;
  };
  timestamp: string;
  release: string;
  environment: string;
  platform: string;
  profile: ThreadCpuProfile;
  debug_meta?: {
    images: DebugImage[];
  };
  transactions: {
    name: string;
    trace_id: string;
    id: string;
    active_thread_id: string;
    relative_start_ns: string;
    relative_end_ns: string;
  }[];
}
