import { OpenTelemetryHub, getCurrentHub } from '../../src/custom/hub';
import { OpenTelemetryScope } from '../../src/custom/scope';

describe('OpenTelemetryHub', () => {
  it('getCurrentHub() returns the correct hub', () => {
    const hub = getCurrentHub();
    expect(hub).toBeDefined();
    expect(hub).toBeInstanceOf(OpenTelemetryHub);

    const hub2 = getCurrentHub();
    expect(hub2).toBe(hub);

    const scope = hub.getScope();
    expect(scope).toBeDefined();
    expect(scope).toBeInstanceOf(OpenTelemetryScope);
  });

  it('hub gets correct scope on initialization', () => {
    const hub = new OpenTelemetryHub();

    const scope = hub.getScope();
    expect(scope).toBeDefined();
    expect(scope).toBeInstanceOf(OpenTelemetryScope);
  });

  it('pushScope() creates correct scope', () => {
    const hub = new OpenTelemetryHub();

    const scope = hub.pushScope();
    expect(scope).toBeInstanceOf(OpenTelemetryScope);

    const scope2 = hub.getScope();
    expect(scope2).toBe(scope);
  });

  it('withScope() creates correct scope', () => {
    const hub = new OpenTelemetryHub();

    hub.withScope(scope => {
      expect(scope).toBeInstanceOf(OpenTelemetryScope);
    });
  });
});
