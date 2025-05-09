import 'vitest';
import type { Session } from '../src/types';
import type { SentReplayExpected } from './test.setup';

interface CustomMatchers<R = unknown> {
  toHaveLastSentReplay(expected?: SentReplayExpected): R;
  toHaveSameSession(expected: undefined | Session): R;
}

// This is so that TS & Vscode recognize the custom matchers
declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  export interface Assertion extends CustomMatchers {}
}
