import { NODE_VERSION } from '../nodeVersion';
import { setDomainAsyncContextStrategy } from './domain';
import { setHooksAsyncContextStrategy } from './hooks';

/**
 * Sets the correct async context strategy for Node.js
 *
 * Node.js >= 14 uses AsyncLocalStorage
 * Node.js < 14 uses domains
 */
export function setNodeAsyncContextStrategy(): void {
  if (NODE_VERSION.major && NODE_VERSION.major >= 14) {
    setHooksAsyncContextStrategy();
  } else {
    setDomainAsyncContextStrategy();
  }
}
