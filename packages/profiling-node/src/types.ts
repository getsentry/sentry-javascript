import type { Event } from '@sentry/types';

interface Sample {
  stack_id: number;
  thread_id: string;
  elapsed_since_start_ns: string;
}

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

// Profile is marked as optional because it is deleted from the metadata
// by the integration before the event is processed by other integrations.
export interface ProfiledEvent extends Event {
  sdkProcessingMetadata: {
    profile?: RawThreadCpuProfile;
  };
}

export interface RawThreadCpuProfile {
  profile_id?: string;
  stacks: number[][];
  samples: Sample[];
  frames: Frame[];
  resources: string[];
  profiler_logging_mode: 'eager' | 'lazy';
  measurements: Record<string, Measurement>;
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
