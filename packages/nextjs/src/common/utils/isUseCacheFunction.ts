// Vendored from: https://github.com/vercel/next.js/blob/canary/packages/next/src/lib/client-and-server-references.ts

interface ServerReferenceInfo {
  type: 'server-action' | 'use-cache';
  usedArgs: [boolean, boolean, boolean, boolean, boolean, boolean];
  hasRestArgs: boolean;
}

export interface ServerReference {
  $$typeof: symbol;
  $$id: string;
}

export type ServerFunction = ServerReference & ((...args: unknown[]) => Promise<unknown>);

function extractInfoFromServerReferenceId(id: string): ServerReferenceInfo {
  const infoByte = parseInt(id.slice(0, 2), 16);
  // eslint-disable-next-line no-bitwise
  const typeBit = (infoByte >> 7) & 0x1;
  // eslint-disable-next-line no-bitwise
  const argMask = (infoByte >> 1) & 0x3f;
  // eslint-disable-next-line no-bitwise
  const restArgs = infoByte & 0x1;
  const usedArgs = Array(6);

  for (let index = 0; index < 6; index++) {
    const bitPosition = 5 - index;
    // eslint-disable-next-line no-bitwise
    const bit = (argMask >> bitPosition) & 0x1;
    usedArgs[index] = bit === 1;
  }

  return {
    type: typeBit === 1 ? 'use-cache' : 'server-action',
    usedArgs: usedArgs as [boolean, boolean, boolean, boolean, boolean, boolean],
    hasRestArgs: restArgs === 1,
  };
}

function isServerReference<T>(value: T & Partial<ServerReference>): value is T & ServerFunction {
  return value.$$typeof === Symbol.for('react.server.reference');
}

/**
 * Check if the function is a use cache function.
 *
 * @param value - The function to check.
 * @returns true if the function is a use cache function, false otherwise.
 */
export function isUseCacheFunction<T>(value: T & Partial<ServerReference>): value is T & ServerFunction {
  if (!isServerReference(value)) {
    return false;
  }

  const { type } = extractInfoFromServerReferenceId(value.$$id);

  return type === 'use-cache';
}
