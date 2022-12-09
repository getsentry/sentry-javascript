import abi from 'node-abi';
import os from 'os';
import path from 'path';
import { threadId } from 'worker_threads';

/**
 *
 */
export function importCppBindingsModule(): PrivateV8CpuProfilerBindings {
  const name = `sentry_cpu_profiler-v${abi.getAbi(process.versions.node, 'node')}-${os.platform()}-${os.arch()}.node`;
  return require(path.join(__dirname, '..', 'binaries', name));
}

interface Sample {
  stack_id: number;
  thread_id: string;
  elapsed_since_start_ns: string;
}

type Stack = number[];

type Frame = {
  function: string;
  file: string;
  line: number;
  column: number;
};

export interface RawThreadCpuProfile {
  stacks: Stack[];
  samples: Sample[];
  frames: Frame[];
  // These fields are relative to transaction ended at
  profile_relative_started_at_ns: number;
  profile_relative_ended_at_ns: number;
  profiler_logging_mode: 'eager' | 'lazy';
}
export interface ThreadCpuProfile {
  samples: Sample[];
  stacks: Stack[];
  frames: Frame[];
  thread_metadata: Record<string, { name?: string; priority?: number }>;
  queue_metadata?: Record<string, { label: string }>;
}

interface PrivateV8CpuProfilerBindings {
  startProfiling(name: string): void;
  stopProfiling(name: string, threadId: number): RawThreadCpuProfile | null;
}

interface V8CpuProfilerBindings {
  startProfiling(name: string): void;
  stopProfiling(name: string): RawThreadCpuProfile | null;
}

const privateBindings: PrivateV8CpuProfilerBindings = importCppBindingsModule();
const CpuProfilerBindings: V8CpuProfilerBindings = {
  startProfiling(name: string) {
    return privateBindings.startProfiling(name);
  },
  stopProfiling(name: string) {
    return privateBindings.stopProfiling(name, threadId);
  },
};
export { CpuProfilerBindings };
