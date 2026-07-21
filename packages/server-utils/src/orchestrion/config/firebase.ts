import type { InstrumentationConfig } from '..';
import { toSubscribeInjections } from './subscribe-injection';

// TODO: Stub for the `firebase` orchestrion integration (ports `FirebaseInstrumentation`).
export const firebaseConfig: InstrumentationConfig[] = [];

export const firebaseChannels = {} as const;

export const firebaseSubscribeInjection = toSubscribeInjections(firebaseConfig);
