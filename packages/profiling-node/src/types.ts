import type { Event } from '@sentry/types';

interface Sample {
  stack_id: number;
  thread_id: string;
  elapsed_since_start_ns: string;
}

type Stack = number[];

type Frame = {
  function: string;
  file: string;
  lineno: number;
  colno: number;
};

interface Measurement {
  unit: string;
  values: {
    elapsed_since_start_ns: number;
    value: number;
  }[];
}

export interface DebugImage {
  code_file: string;
  type: string;
  debug_id: string;
  image_addr?: string;
  image_size?: number;
  image_vmaddr?: string;
}

// Profile is marked as optional because it is deleted from the metadata
// by the integration before the event is processed by other integrations.
export interface ProfiledEvent extends Event {
  sdkProcessingMetadata: {
    profile?: RawThreadCpuProfile;
  };
}

export interface RawThreadCpuProfile {
  profile_id?: string;
  stacks: ReadonlyArray<Stack>;
  samples: ReadonlyArray<Sample>;
  frames: ReadonlyArray<Frame>;
  resources: ReadonlyArray<string>;
  profiler_logging_mode: 'eager' | 'lazy';
  measurements: Record<string, Measurement>;
}
export interface ThreadCpuProfile {
  stacks: ReadonlyArray<Stack>;
  samples: ReadonlyArray<Sample>;
  frames: ReadonlyArray<Frame>;
  thread_metadata: Record<string, { name?: string; priority?: number }>;
  queue_metadata?: Record<string, { label: string }>;
}

export interface PrivateV8CpuProfilerBindings {
  startProfiling(name: string): void;
  stopProfiling(name: string, threadId: number, collectResources: boolean): RawThreadCpuProfile | null;
  getFrameModule(abs_path: string): string;
}

export interface V8CpuProfilerBindings {
  startProfiling(name: string): void;
  stopProfiling(name: string): RawThreadCpuProfile | null;
}

export interface Profile {
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
  transaction: {
    name: string;
    id: string;
    trace_id: string;
    active_thread_id: string;
  };
  measurements: Record<string, Measurement>;
}
