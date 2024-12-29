import type { Event } from '@sentry/core';

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
  startProfiling?: (name: string) => void;

  stopProfiling?(
    name: string,
    format: ProfileFormat.THREAD,
    threadId: number,
    collectResources: boolean,
  ): RawThreadCpuProfile | null;
  stopProfiling?(
    name: string,
    format: ProfileFormat.CHUNK,
    threadId: number,
    collectResources: boolean,
  ): RawChunkCpuProfile | null;

  // Helper methods exposed for testing
  getFrameModule(abs_path: string): string;
}

export enum ProfileFormat {
  THREAD = 0,
  CHUNK = 1,
}

export interface V8CpuProfilerBindings {
  startProfiling(name: string): void;

  stopProfiling(name: string, format: ProfileFormat.THREAD): RawThreadCpuProfile | null;
  stopProfiling(name: string, format: ProfileFormat.CHUNK): RawChunkCpuProfile | null;
}
