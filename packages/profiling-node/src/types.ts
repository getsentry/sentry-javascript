import type { Event } from '@sentry/types';

interface Sample {
  stack_id: number;
  thread_id: string;
  elapsed_since_start_ns: string;
}

interface ChunkSample {
  stack_id: number;
  thread_id: string;
  timestamp: number;
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

interface BaseProfile {
  profile_id?: string;
  stacks: number[][];
  frames: Frame[];
  resources: string[];
  profiler_logging_mode: 'eager' | 'lazy';
  measurements: Record<string, Measurement>;
}
export interface RawThreadCpuProfile extends BaseProfile {
  samples: Sample[];
}

export interface RawChunkCpuProfile extends BaseProfile {
  samples: ChunkSample[];
}
export interface PrivateV8CpuProfilerBindings {
  startProfiling(name: string): void;
  stopProfiling(name: string, threadId: number, collectResources: boolean, format: 0): RawThreadCpuProfile | null;
  stopProfiling(name: string, threadId: number, collectResources: boolean, format: 1): RawChunkCpuProfile | null;
  stopProfiling(
    name: string,
    threadId: number,
    collectResources: boolean,
    format: 0 | 1,
  ): RawThreadCpuProfile | RawChunkCpuProfile | null;
  getFrameModule(abs_path: string): string;
}

export interface V8CpuProfilerBindings {
  startProfiling(name: string): void;
  stopProfiling(name: string, format: 0): RawThreadCpuProfile | null;
  stopProfiling(name: string, format: 1): RawChunkCpuProfile | null;
  stopProfiling(name: string, format: 0 | 1): RawThreadCpuProfile | RawChunkCpuProfile | null;
}
