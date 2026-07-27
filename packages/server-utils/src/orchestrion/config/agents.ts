import type { InstrumentationConfig } from '..';
import { toSubscribeInjections } from './subscribe-injection';

// The `agents` package ships a single bundled `dist/index.js` holding `class Agent extends Server`
// with these as real (prototype) class methods, so `className` + `methodName` matches them directly.
// Only methods that are plain class methods are injectable here — the RPC dispatch and `onStart`
// live inside constructor-installed closures, so they are intentionally NOT covered (they stay on
// the `instrumentAgentWithSentry` method-wrap path).
const module = (filePath: string): InstrumentationConfig['module'] => ({
  name: 'agents',
  versionRange: '>=0.13.0 <1.0.0',
  filePath,
});

export const agentsConfig = [
  {
    channelName: 'executeScheduleCallback',
    module: module('dist/index.js'),
    functionQuery: { className: 'Agent', methodName: '_executeScheduleCallback', kind: 'Async' as const },
  },
  {
    channelName: 'runFiber',
    module: module('dist/index.js'),
    functionQuery: { className: 'Agent', methodName: '_runFiberInternal', kind: 'Async' as const },
  },
] satisfies InstrumentationConfig[];

export const agentsChannels = {
  AGENTS_EXECUTE_SCHEDULE_CALLBACK: 'orchestrion:agents:executeScheduleCallback',
  AGENTS_RUN_FIBER: 'orchestrion:agents:runFiber',
} as const;

export const agentsSubscribeInjection = toSubscribeInjections(agentsConfig);
