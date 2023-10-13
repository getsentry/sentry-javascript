import { getCurrentHub, NodeExperimentalHub } from '../../src/sdk/hub';
import { NodeExperimentalScope } from '../../src/sdk/scope';

describe('NodeExperimentalHub', () => {
  it('getCurrentHub() returns the correct hub', () => {
    const hub = getCurrentHub();
    expect(hub).toBeDefined();
    expect(hub).toBeInstanceOf(NodeExperimentalHub);

    const hub2 = getCurrentHub();
    expect(hub2).toBe(hub);

    const scope = hub.getScope();
    expect(scope).toBeDefined();
    expect(scope).toBeInstanceOf(NodeExperimentalScope);
  });

  it('hub gets correct scope on initialization', () => {
    const hub = new NodeExperimentalHub();

    const scope = hub.getScope();
    expect(scope).toBeDefined();
    expect(scope).toBeInstanceOf(NodeExperimentalScope);
  });

  it('pushScope() creates correct scope', () => {
    const hub = new NodeExperimentalHub();

    const scope = hub.pushScope();
    expect(scope).toBeInstanceOf(NodeExperimentalScope);

    const scope2 = hub.getScope();
    expect(scope2).toBe(scope);
  });

  it('withScope() creates correct scope', () => {
    const hub = new NodeExperimentalHub();

    hub.withScope(scope => {
      expect(scope).toBeInstanceOf(NodeExperimentalScope);
    });
  });
});
