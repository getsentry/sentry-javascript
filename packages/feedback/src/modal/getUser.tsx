import { getCurrentScope, getGlobalScope, getIsolationScope } from '@sentry/core';
import type { User } from '@sentry/types';

export function getUser(): User | undefined {
  const currentUser = getCurrentScope().getUser();
  if (currentUser && Object.keys(currentUser).length) {
    return currentUser;
  }
  const isolationUser = getIsolationScope().getUser();
  if (isolationUser && Object.keys(isolationUser).length) {
    return isolationUser;
  }
  const globalUser = getGlobalScope().getUser();
  return globalUser;
}
