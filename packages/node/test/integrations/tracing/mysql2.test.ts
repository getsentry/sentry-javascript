import { describe, expect, it } from 'vitest';
import { getConnectionPrototypeToInstrument } from '../../../src/integrations/tracing/mysql2/vendored/utils';

// The instrumentation patches `query`/`execute` on whichever prototype actually owns them.
// mysql2's layout differs across major versions: older versions define them directly on
// `Connection.prototype`, newer versions inherit them from a base class. This is the only
// version-sensitive logic in the instrumentation, so it's covered here as a pure unit.
// The end-to-end span behavior is covered by the real-package integration suite.
describe('getConnectionPrototypeToInstrument', () => {
  it('returns the connection prototype when query/execute live on it directly', () => {
    class Connection {}
    (Connection.prototype as any).query = (): void => {};
    (Connection.prototype as any).execute = (): void => {};

    expect(getConnectionPrototypeToInstrument(Connection)).toBe(Connection.prototype);
  });

  it('returns the base prototype when query/execute are inherited from a base class', () => {
    class Base {}
    (Base.prototype as any).query = (): void => {};
    (Base.prototype as any).execute = (): void => {};
    class Connection extends Base {}

    expect(getConnectionPrototypeToInstrument(Connection)).toBe(Base.prototype);
  });

  it('falls back to the connection prototype when the base lacks query/execute', () => {
    class Base {}
    (Base.prototype as any).query = (): void => {};
    // base only has `query`, not `execute` -> not a valid instrumentation target
    class Connection extends Base {}
    (Connection.prototype as any).query = (): void => {};
    (Connection.prototype as any).execute = (): void => {};

    expect(getConnectionPrototypeToInstrument(Connection)).toBe(Connection.prototype);
  });
});
