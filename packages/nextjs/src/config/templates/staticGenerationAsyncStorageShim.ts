import type { StaticGenerationStore } from '../../common/types';

// Vendored from https://github.com/vercel/next.js/blob/445e70502834540d476b8eeaed0228241acd92eb/packages/next/src/client/components/static-generation-async-storage.external.ts
export interface StaticGenerationAsyncStorage {
  getStore: () => StaticGenerationStore | undefined;
}
