import { OpenTelemetryHub, getCurrentHub } from '../../src/custom/hub';
import { OpenTelemetryScope } from '../../src/custom/scope';

describe('OpenTelemetryHub', () => {
  it('getCurrentHub() returns the correct hub', () => {
    const hub = getCurrentHub();
    expect(hub).toBeDefined();
    expect(hub).toBeInstanceOf(OpenTelemetryHub);

    const hub2 = getCurrentHub();
    expect(hub2).toBe(hub);

    // eslint-disable-next-line deprecation/deprecation
    const scope = hub.getScope();
    expect(scope).toBeDefined();
    expect(scope).toBeInstanceOf(OpenTelemetryScope);
  });

  it('hub gets correct scope on initialization', () => {
    const hub = new OpenTelemetryHub();

    // eslint-disable-next-line deprecation/deprecation
    const scope = hub.getScope();
    expect(scope).toBeDefined();
    expect(scope).toBeInstanceOf(OpenTelemetryScope);
  });

  it('pushScope() creates correct scope', () => {
    const hub = new OpenTelemetryHub();

    // eslint-disable-next-line deprecation/deprecation
    const scope = hub.pushScope();
    expect(scope).toBeInstanceOf(OpenTelemetryScope);

    // eslint-disable-next-line deprecation/deprecation
    const scope2 = hub.getScope();
    expect(scope2).toBe(scope);
  });

  it('withScope() creates correct scope', () => {
    const hub = new OpenTelemetryHub();

    // eslint-disable-next-line deprecation/deprecation
    hub.withScope(scope => {
      expect(scope).toBeInstanceOf(OpenTelemetryScope);
    });
  });
});
