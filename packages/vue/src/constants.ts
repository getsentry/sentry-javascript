import type { Operation } from './types';

export const DEFAULT_HOOKS: Operation[] = ['activate', 'mount'];

/** How long the root render span waits for further render activity before it ends. */
export const DEFAULT_ROOT_SPAN_TIMEOUT = 2000;
