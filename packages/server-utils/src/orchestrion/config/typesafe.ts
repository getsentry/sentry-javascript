import type { InstrumentationConfig } from '../apmTypes';

import { getModuleNames } from './module-names';

// `systemOne` returns a lazy `APIPromise` whose body is parsed on the first `.then()`. `kind: 'Sync'`
// keeps orchestrion from calling `.then()` on it (which `Auto` would), so a caller's `asResponse()`
// still gets an unread body. The SDK ships one bundled file per module format.
export const typesafeConfig = ['dist/index.mjs', 'dist/index.cjs'].map(filePath => ({
  channelName: 'system-one',
  module: { name: '@typesafe-ai/sdk', versionRange: '>=0.5.0 <1', filePath },
  functionQuery: { className: 'TypeSafeClient', methodName: 'systemOne', kind: 'Sync' as const },
})) satisfies InstrumentationConfig[];

export const typesafeModuleNames = getModuleNames(typesafeConfig);

export const typesafeChannels = {
  TYPESAFE_SYSTEM_ONE: 'orchestrion:@typesafe-ai/sdk:system-one',
} as const;
