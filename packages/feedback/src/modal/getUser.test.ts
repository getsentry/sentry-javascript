import { getCurrentScope, getGlobalScope, getIsolationScope } from '@sentry/core';
import type { User } from '@sentry/types';
import { getUser } from './getUser';

const currentUser: User = { username: 'current' };

describe('getUser', () => {
  beforeEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();
  });

  it('should prefer the user from the current scope', () => {
    getCurrentScope().setUser(currentUser);

    expect(getUser()).toEqual(expect.objectContaining(currentUser));
  });

  it('should return the empty user if no explicit user is set', () => {
    getCurrentScope().setUser(null);

    expect(getUser()).toEqual({ email: undefined, id: undefined, ip_address: undefined, username: undefined });
  });
});
