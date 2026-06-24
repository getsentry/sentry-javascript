import { afterEach, beforeEach, describe, expect, it, test, vi } from 'vitest';
import { getCurrentScope } from '../../src/currentScopes';
import {
  addIntegration,
  extendIntegration,
  getIntegrationsToSetup,
  installedIntegrations,
  setupIntegration,
} from '../../src/integration';
import { setCurrentClient } from '../../src/sdk';
import type { Integration } from '../../src/types/integration';
import type { CoreOptions } from '../../src/types/options';
import { debug } from '../../src/utils/debug-logger';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

function getTestClient(): TestClient {
  return new TestClient(
    getDefaultTestClientOptions({
      dsn: 'https://username@domain/123',
    }),
  );
}

/** JSDoc */
class MockIntegration implements Integration {
  public name: string;

  // Only for testing - tag to keep separate instances straight when testing deduplication
  public tag?: string;

  public setupOnce = vi.fn(() => {});

  public constructor(name: string, tag?: string) {
    this.name = name;
    this.tag = tag;
  }
}

type TestCase = [
  string, // test name
  CoreOptions['defaultIntegrations'], // default integrations
  CoreOptions['integrations'], // user-provided integrations
  Array<string | string[]>, // expected results
];

describe('getIntegrationsToSetup', () => {
  describe('no duplicate integrations', () => {
    const defaultIntegrations = [new MockIntegration('ChaseSquirrels')];
    const userIntegrationsArray = [new MockIntegration('CatchTreats')];
    const userIntegrationsFunction = (defaults: Integration[]) => [...defaults, ...userIntegrationsArray];

    const testCases: TestCase[] = [
      // each test case is [testName, defaultIntegrations, userIntegrations, expectedResult]
      ['no default integrations, no user integrations provided', false, undefined, []],
      ['no default integrations, empty user-provided array', false, [], []],
      ['no default integrations, user-provided array', false, userIntegrationsArray, ['CatchTreats']],
      ['no default integrations, user-provided function', false, userIntegrationsFunction, ['CatchTreats']],
      ['with default integrations, no user integrations provided', defaultIntegrations, undefined, ['ChaseSquirrels']],
      ['with default integrations, empty user-provided array', defaultIntegrations, [], ['ChaseSquirrels']],
      [
        'with default integrations, user-provided array',
        defaultIntegrations,
        userIntegrationsArray,
        ['ChaseSquirrels', 'CatchTreats'],
      ],
      [
        'with default integrations, user-provided function',
        defaultIntegrations,
        userIntegrationsFunction,
        ['ChaseSquirrels', 'CatchTreats'],
      ],
    ];

    test.each(testCases)('%s', (_, defaultIntegrations, userIntegrations, expected) => {
      const integrations = getIntegrationsToSetup({
        defaultIntegrations,
        integrations: userIntegrations,
      });
      expect(integrations.map(i => i.name)).toEqual(expected);
    });

    test('it uses passed integration over default integration', () => {
      const integrationDefault = new MockIntegration('ChaseSquirrels');
      const integration1 = new MockIntegration('ChaseSquirrels');

      const integrations = getIntegrationsToSetup({
        defaultIntegrations: [integrationDefault],
        integrations: [integration1],
      });

      expect(integrations).toEqual([integration1]);
    });

    test('it uses last passed integration only', () => {
      const integrationDefault = new MockIntegration('ChaseSquirrels');
      const integration1 = new MockIntegration('ChaseSquirrels');
      const integration2 = new MockIntegration('ChaseSquirrels');

      const integrations = getIntegrationsToSetup({
        defaultIntegrations: [integrationDefault],
        integrations: [integration1, integration2],
      });

      expect(integrations).toEqual([integration2]);
    });
  });

  describe('deduping', () => {
    // No duplicates
    const defaultIntegrations = [new MockIntegration('ChaseSquirrels', 'defaultA')];
    const userIntegrationsArray = [new MockIntegration('CatchTreats', 'userA')];

    // Duplicates within either default or user integrations, but no overlap between them (to show that last one wins)
    const duplicateDefaultIntegrations = [
      new MockIntegration('ChaseSquirrels', 'defaultA'),
      new MockIntegration('ChaseSquirrels', 'defaultB'),
    ];
    const duplicateUserIntegrationsArray = [
      new MockIntegration('CatchTreats', 'userA'),
      new MockIntegration('CatchTreats', 'userB'),
    ];
    const duplicateUserIntegrationsFunctionDefaultsFirst = (defaults: Integration[]) => [
      ...defaults,
      ...duplicateUserIntegrationsArray,
    ];
    const duplicateUserIntegrationsFunctionDefaultsSecond = (defaults: Integration[]) => [
      ...duplicateUserIntegrationsArray,
      ...defaults,
    ];

    // User integrations containing new instances of default integrations (to show that user integration wins)
    const userIntegrationsMatchingDefaultsArray = [
      new MockIntegration('ChaseSquirrels', 'userA'),
      new MockIntegration('CatchTreats', 'userA'),
    ];
    const userIntegrationsMatchingDefaultsFunctionDefaultsFirst = (defaults: Integration[]) => [
      ...defaults,
      ...userIntegrationsMatchingDefaultsArray,
    ];
    const userIntegrationsMatchingDefaultsFunctionDefaultsSecond = (defaults: Integration[]) => [
      ...userIntegrationsMatchingDefaultsArray,
      ...defaults,
    ];

    const testCases: TestCase[] = [
      // each test case is [testName, defaultIntegrations, userIntegrations, expectedResult]
      [
        'duplicate default integrations',
        duplicateDefaultIntegrations,
        userIntegrationsArray,
        [
          ['ChaseSquirrels', 'defaultB'],
          ['CatchTreats', 'userA'],
        ],
      ],
      [
        'duplicate user integrations, user-provided array',
        defaultIntegrations,
        duplicateUserIntegrationsArray,
        [
          ['ChaseSquirrels', 'defaultA'],
          ['CatchTreats', 'userB'],
        ],
      ],
      [
        'duplicate user integrations, user-provided function with defaults first',
        defaultIntegrations,
        duplicateUserIntegrationsFunctionDefaultsFirst,
        [
          ['ChaseSquirrels', 'defaultA'],
          ['CatchTreats', 'userB'],
        ],
      ],
      [
        'duplicate user integrations, user-provided function with defaults second',
        defaultIntegrations,
        duplicateUserIntegrationsFunctionDefaultsSecond,
        [
          ['CatchTreats', 'userB'],
          ['ChaseSquirrels', 'defaultA'],
        ],
      ],
      [
        'same integration in default and user integrations, user-provided array',
        defaultIntegrations,
        userIntegrationsMatchingDefaultsArray,
        [
          ['ChaseSquirrels', 'userA'],
          ['CatchTreats', 'userA'],
        ],
      ],
      [
        'same integration in default and user integrations, user-provided function with defaults first',
        defaultIntegrations,
        userIntegrationsMatchingDefaultsFunctionDefaultsFirst,
        [
          ['ChaseSquirrels', 'userA'],
          ['CatchTreats', 'userA'],
        ],
      ],
      [
        'same integration in default and user integrations, user-provided function with defaults second',
        defaultIntegrations,
        userIntegrationsMatchingDefaultsFunctionDefaultsSecond,
        [
          ['ChaseSquirrels', 'userA'],
          ['CatchTreats', 'userA'],
        ],
      ],
    ];

    test.each(testCases)('%s', (_, defaultIntegrations, userIntegrations, expected) => {
      const integrations = getIntegrationsToSetup({
        defaultIntegrations: defaultIntegrations,
        integrations: userIntegrations,
      }) as MockIntegration[];

      expect(integrations.map(i => [i.name, i.tag])).toEqual(expected);
    });
  });

  it('works with empty array', () => {
    const integrations = getIntegrationsToSetup({
      integrations: [],
    });

    expect(integrations.map(i => i.name)).toEqual([]);
  });

  it('works with single item', () => {
    const integrations = getIntegrationsToSetup({
      integrations: [new MockIntegration('foo')],
    });

    expect(integrations.map(i => i.name)).toEqual(['foo']);
  });

  it('works with multiple items', () => {
    const integrations = getIntegrationsToSetup({
      integrations: [new MockIntegration('foo'), new MockIntegration('bar')],
    });

    expect(integrations.map(i => i.name)).toEqual(['foo', 'bar']);
  });

  it('filter duplicated items', () => {
    const integrations = getIntegrationsToSetup({
      integrations: [new MockIntegration('foo'), new MockIntegration('foo'), new MockIntegration('bar')],
    });

    expect(integrations.map(i => i.name)).toEqual(['foo', 'bar']);
  });

  it('work with empty defaults', () => {
    const integrations = getIntegrationsToSetup({
      defaultIntegrations: [],
    });

    expect(integrations.map(i => i.name)).toEqual([]);
  });

  it('work with single defaults', () => {
    const integrations = getIntegrationsToSetup({
      defaultIntegrations: [new MockIntegration('foo')],
    });

    expect(integrations.map(i => i.name)).toEqual(['foo']);
  });

  it('work with multiple defaults', () => {
    const integrations = getIntegrationsToSetup({
      defaultIntegrations: [new MockIntegration('foo'), new MockIntegration('bar')],
    });

    expect(integrations.map(i => i.name)).toEqual(['foo', 'bar']);
  });

  it('work with user integrations and defaults and pick defaults first', () => {
    const integrations = getIntegrationsToSetup({
      defaultIntegrations: [new MockIntegration('foo')],
      integrations: [new MockIntegration('bar')],
    });

    expect(integrations.map(i => i.name)).toEqual(['foo', 'bar']);
  });

  it('work with user integrations and defaults and filter duplicates', () => {
    const integrations = getIntegrationsToSetup({
      defaultIntegrations: [new MockIntegration('foo'), new MockIntegration('foo')],
      integrations: [new MockIntegration('bar'), new MockIntegration('bar')],
    });

    expect(integrations.map(i => i.name)).toEqual(['foo', 'bar']);
  });

  it('user integrations override defaults', () => {
    const firstDefault = new MockIntegration('foo');
    (firstDefault as any).order = 'firstDefault';
    const secondDefault = new MockIntegration('bar');
    (secondDefault as any).order = 'secondDefault';
    const firstUser = new MockIntegration('foo');
    (firstUser as any).order = 'firstUser';
    const secondUser = new MockIntegration('bar');
    (secondUser as any).order = 'secondUser';

    const integrations = getIntegrationsToSetup({
      defaultIntegrations: [firstDefault, secondDefault],
      integrations: [firstUser, secondUser],
    });

    expect(integrations.map(i => i.name)).toEqual(['foo', 'bar']);
    expect((integrations[0] as any).order).toEqual('firstUser');
    expect((integrations[1] as any).order).toEqual('secondUser');
  });
});

describe('setupIntegration', () => {
  beforeEach(function () {
    // Reset the (global!) list of installed integrations
    installedIntegrations.splice(0, installedIntegrations.length);
  });

  it('works with a minimal integration', () => {
    class CustomIntegration implements Integration {
      name = 'test';
      setupOnce = vi.fn();
    }

    const client = getTestClient();
    const integrationIndex = {};
    const integration = new CustomIntegration();

    setupIntegration(client, integration, integrationIndex);

    expect(integrationIndex).toEqual({ test: integration });
    expect(integration.setupOnce).toHaveBeenCalledTimes(1);
  });

  it('only calls setupOnce a single time', () => {
    class CustomIntegration implements Integration {
      name = 'test';
      setupOnce = vi.fn();
    }

    const client1 = getTestClient();
    const client2 = getTestClient();

    const integrationIndex = {};
    const integration1 = new CustomIntegration();
    const integration2 = new CustomIntegration();
    const integration3 = new CustomIntegration();
    const integration4 = new CustomIntegration();

    setupIntegration(client1, integration1, integrationIndex);
    setupIntegration(client1, integration2, integrationIndex);
    setupIntegration(client2, integration3, integrationIndex);
    setupIntegration(client2, integration4, integrationIndex);

    expect(integrationIndex).toEqual({ test: integration1 });
    expect(integration1.setupOnce).toHaveBeenCalledTimes(1);
    expect(integration2.setupOnce).not.toHaveBeenCalled();
    expect(integration3.setupOnce).not.toHaveBeenCalled();
    expect(integration4.setupOnce).not.toHaveBeenCalled();
  });

  it('calls setup for each client', () => {
    class CustomIntegration implements Integration {
      name = 'test';
      setupOnce = vi.fn();
      setup = vi.fn();
    }

    const client1 = getTestClient();
    const client2 = getTestClient();

    const integrationIndex1 = {};
    const integrationIndex2 = {};
    const integration1 = new CustomIntegration();
    const integration2 = new CustomIntegration();
    const integration3 = new CustomIntegration();
    const integration4 = new CustomIntegration();

    setupIntegration(client1, integration1, integrationIndex1);
    setupIntegration(client1, integration2, integrationIndex1);
    setupIntegration(client2, integration3, integrationIndex2);
    setupIntegration(client2, integration4, integrationIndex2);

    expect(integrationIndex1).toEqual({ test: integration1 });
    expect(integrationIndex2).toEqual({ test: integration3 });
    expect(integration1.setupOnce).toHaveBeenCalledTimes(1);
    expect(integration2.setupOnce).not.toHaveBeenCalled();
    expect(integration3.setupOnce).not.toHaveBeenCalled();
    expect(integration4.setupOnce).not.toHaveBeenCalled();

    expect(integration1.setup).toHaveBeenCalledTimes(1);
    expect(integration2.setup).toHaveBeenCalledTimes(0);
    expect(integration3.setup).toHaveBeenCalledTimes(1);
    expect(integration4.setup).toHaveBeenCalledTimes(0);

    expect(integration1.setup).toHaveBeenCalledWith(client1);
    expect(integration3.setup).toHaveBeenCalledWith(client2);
  });

  it('binds preprocessEvent for each client', () => {
    class CustomIntegration implements Integration {
      name = 'test';
      setupOnce = vi.fn();
      preprocessEvent = vi.fn();
    }

    const client1 = getTestClient();
    const client2 = getTestClient();

    const integrationIndex1 = {};
    const integrationIndex2 = {};
    const integration1 = new CustomIntegration();
    const integration2 = new CustomIntegration();
    const integration3 = new CustomIntegration();
    const integration4 = new CustomIntegration();

    setupIntegration(client1, integration1, integrationIndex1);
    setupIntegration(client1, integration2, integrationIndex1);
    setupIntegration(client2, integration3, integrationIndex2);
    setupIntegration(client2, integration4, integrationIndex2);

    expect(integrationIndex1).toEqual({ test: integration1 });
    expect(integrationIndex2).toEqual({ test: integration3 });
    expect(integration1.setupOnce).toHaveBeenCalledTimes(1);
    expect(integration2.setupOnce).not.toHaveBeenCalled();
    expect(integration3.setupOnce).not.toHaveBeenCalled();
    expect(integration4.setupOnce).not.toHaveBeenCalled();

    client1.captureEvent({ event_id: '1a' });
    client1.captureEvent({ event_id: '1b' });
    client2.captureEvent({ event_id: '2a' });
    client2.captureEvent({ event_id: '2b' });
    client2.captureEvent({ event_id: '2c' });

    expect(integration1.preprocessEvent).toHaveBeenCalledTimes(2);
    expect(integration2.preprocessEvent).toHaveBeenCalledTimes(0);
    expect(integration3.preprocessEvent).toHaveBeenCalledTimes(3);
    expect(integration4.preprocessEvent).toHaveBeenCalledTimes(0);

    expect(integration1.preprocessEvent).toHaveBeenLastCalledWith(
      { event_id: '1b' },
      { event_id: expect.any(String) },
      client1,
    );
    expect(integration3.preprocessEvent).toHaveBeenLastCalledWith(
      { event_id: '2c' },
      { event_id: expect.any(String) },
      client2,
    );
  });

  it('allows to mutate events in preprocessEvent', async () => {
    class CustomIntegration implements Integration {
      name = 'test';
      setupOnce = vi.fn();
      preprocessEvent = vi.fn(event => {
        event.event_id = 'mutated';
      });
    }

    const client = getTestClient();

    const integrationIndex = {};
    const integration = new CustomIntegration();

    setupIntegration(client, integration, integrationIndex);

    const sendEvent = vi.fn();
    client.sendEvent = sendEvent;

    client.captureEvent({ event_id: '1a' });
    await client.flush();

    expect(sendEvent).toHaveBeenCalledTimes(1);
    expect(sendEvent).toHaveBeenCalledWith(expect.objectContaining({ event_id: 'mutated' }), {
      event_id: expect.any(String),
    });
  });

  it('binds processEvent for each client', () => {
    class CustomIntegration implements Integration {
      name = 'test';
      setupOnce = vi.fn();
      processEvent = vi.fn(event => {
        return event;
      });
    }

    const client1 = getTestClient();
    const client2 = getTestClient();

    const integrationIndex1 = {};
    const integrationIndex2 = {};
    const integration1 = new CustomIntegration();
    const integration2 = new CustomIntegration();
    const integration3 = new CustomIntegration();
    const integration4 = new CustomIntegration();

    setupIntegration(client1, integration1, integrationIndex1);
    setupIntegration(client1, integration2, integrationIndex1);
    setupIntegration(client2, integration3, integrationIndex2);
    setupIntegration(client2, integration4, integrationIndex2);

    expect(integrationIndex1).toEqual({ test: integration1 });
    expect(integrationIndex2).toEqual({ test: integration3 });
    expect(integration1.setupOnce).toHaveBeenCalledTimes(1);
    expect(integration2.setupOnce).not.toHaveBeenCalled();
    expect(integration3.setupOnce).not.toHaveBeenCalled();
    expect(integration4.setupOnce).not.toHaveBeenCalled();

    client1.captureEvent({ event_id: '1a' });
    client1.captureEvent({ event_id: '1b' });
    client2.captureEvent({ event_id: '2a' });
    client2.captureEvent({ event_id: '2b' });
    client2.captureEvent({ event_id: '2c' });

    expect(integration1.processEvent).toHaveBeenCalledTimes(2);
    expect(integration2.processEvent).toHaveBeenCalledTimes(0);
    expect(integration3.processEvent).toHaveBeenCalledTimes(3);
    expect(integration4.processEvent).toHaveBeenCalledTimes(0);

    expect(integration1.processEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ event_id: '1b' }),
      { event_id: expect.any(String) },
      client1,
    );
    expect(integration3.processEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ event_id: '2c' }),
      { event_id: expect.any(String) },
      client2,
    );
  });

  it('allows to mutate events in processEvent', async () => {
    class CustomIntegration implements Integration {
      name = 'test';
      setupOnce = vi.fn();
      processEvent = vi.fn(_event => {
        return { event_id: 'mutated' };
      });
    }

    const client = getTestClient();

    const integrationIndex = {};
    const integration = new CustomIntegration();

    setupIntegration(client, integration, integrationIndex);

    const sendEvent = vi.fn();
    client.sendEvent = sendEvent;

    client.captureEvent({ event_id: '1a' });
    await client.flush();

    expect(sendEvent).toHaveBeenCalledTimes(1);
    expect(sendEvent).toHaveBeenCalledWith(expect.objectContaining({ event_id: 'mutated' }), {
      event_id: expect.any(String),
    });
  });

  it('allows to drop events in processEvent', async () => {
    class CustomIntegration implements Integration {
      name = 'test';
      setupOnce = vi.fn();
      processEvent = vi.fn(_event => {
        return null;
      });
    }

    const client = getTestClient();

    const integrationIndex = {};
    const integration = new CustomIntegration();

    setupIntegration(client, integration, integrationIndex);

    const sendEvent = vi.fn();
    client.sendEvent = sendEvent;

    client.captureEvent({ event_id: '1a' });
    await client.flush();

    expect(sendEvent).not.toHaveBeenCalled();
  });
});

describe('addIntegration', () => {
  beforeEach(function () {
    // Reset the (global!) list of installed integrations
    installedIntegrations.splice(0, installedIntegrations.length);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('works with a client setup', () => {
    const warnings = vi.spyOn(debug, 'warn');

    class CustomIntegration implements Integration {
      name = 'test';
      setupOnce = vi.fn();
    }

    const client = getTestClient();
    setCurrentClient(client);

    const integration = new CustomIntegration();
    addIntegration(integration);

    expect(integration.setupOnce).toHaveBeenCalledTimes(1);
    expect(warnings).not.toHaveBeenCalled();
  });

  it('works without a client setup', () => {
    const warnings = vi.spyOn(debug, 'warn');
    class CustomIntegration implements Integration {
      name = 'test';
      setupOnce = vi.fn();
    }

    getCurrentScope().setClient(undefined);

    const integration = new CustomIntegration();
    addIntegration(integration);

    expect(integration.setupOnce).not.toHaveBeenCalled();
    expect(warnings).toHaveBeenCalledTimes(1);
    expect(warnings).toHaveBeenCalledWith('Cannot add integration "test" because no SDK Client is available.');
  });

  it('triggers all hooks', () => {
    const setup = vi.fn();
    const setupOnce = vi.fn();
    const setupAfterAll = vi.fn();

    class CustomIntegration implements Integration {
      name = 'test';
      setupOnce = setupOnce;
      setup = setup;
      afterAllSetup = setupAfterAll;
    }

    const client = getTestClient();
    setCurrentClient(client);
    client.init();

    const integration = new CustomIntegration();
    addIntegration(integration);

    expect(setupOnce).toHaveBeenCalledTimes(1);
    expect(setup).toHaveBeenCalledTimes(1);
    expect(setupAfterAll).toHaveBeenCalledTimes(1);
  });

  it('does not trigger hooks if already installed', () => {
    const logs = vi.spyOn(debug, 'log');

    class CustomIntegration implements Integration {
      name = 'test';
      setupOnce = vi.fn();
      setup = vi.fn();
      afterAllSetup = vi.fn();
    }

    const client = getTestClient();
    setCurrentClient(client);
    client.init();

    const integration1 = new CustomIntegration();
    const integration2 = new CustomIntegration();
    addIntegration(integration1);

    expect(integration1.setupOnce).toHaveBeenCalledTimes(1);
    expect(integration1.setup).toHaveBeenCalledTimes(1);
    expect(integration1.afterAllSetup).toHaveBeenCalledTimes(1);

    addIntegration(integration2);

    expect(integration2.setupOnce).toHaveBeenCalledTimes(0);
    expect(integration2.setup).toHaveBeenCalledTimes(0);
    expect(integration2.afterAllSetup).toHaveBeenCalledTimes(0);

    expect(logs).toHaveBeenCalledWith('Integration skipped because it was already installed: test');
  });
});

describe('extendIntegration', () => {
  it('merges static (non-function) properties, with the extension taking precedence', () => {
    const base = { name: 'Base', version: 1, baseOnly: 'a' };
    const result = extendIntegration(base, { name: 'Extended', version: 2, extendedOnly: 'b' });

    expect(result.name).toBe('Extended');
    expect(result.version).toBe(2);
    expect(result.baseOnly).toBe('a');
    expect(result.extendedOnly).toBe('b');
  });

  it('returns a new object without mutating either input', () => {
    const baseSetupOnce = vi.fn();
    const extension = { setupOnce: vi.fn() };
    const base = { name: 'Base', setupOnce: baseSetupOnce };

    const result = extendIntegration(base, extension);

    expect(result).not.toBe(base);
    expect(base.setupOnce).toBe(baseSetupOnce);
    expect(result.setupOnce).not.toBe(baseSetupOnce);
    expect(result.setupOnce).not.toBe(extension.setupOnce);
  });

  it('wraps a method present on both so the base runs before the extension', () => {
    const calls: string[] = [];
    const base = {
      name: 'Base',
      setupOnce: () => {
        calls.push('base');
      },
    };

    const result = extendIntegration(base, {
      setupOnce: () => {
        calls.push('extended');
      },
    });

    result.setupOnce();

    expect(calls).toEqual(['base', 'extended']);
  });

  it('forwards arguments to both methods and returns the extension method’s value', () => {
    const baseRun = vi.fn();
    const extendedRun = vi.fn().mockReturnValue('extended-result');
    const base = { name: 'Base', run: baseRun };

    const result = extendIntegration(base, { run: extendedRun });

    const returnValue = result.run('arg', 42);

    expect(baseRun).toHaveBeenCalledWith('arg', 42);
    expect(extendedRun).toHaveBeenCalledWith('arg', 42);
    expect(returnValue).toBe('extended-result');
  });

  it('binds both methods to the merged integration so they see the merged properties', () => {
    const seenThis: unknown[] = [];
    const base = {
      name: 'Base',
      setupOnce(this: unknown) {
        seenThis.push(this);
      },
    };

    const result = extendIntegration(base, {
      extra: 'value',
      setupOnce(this: unknown) {
        seenThis.push(this);
      },
    });

    result.setupOnce();

    const [baseThis, extendedThis] = seenThis;
    expect(baseThis).toBe(result);
    expect(extendedThis).toBe(result);
    // The base method can reach extension-provided properties through `this`.
    expect((baseThis as { extra?: string }).extra).toBe('value');
  });

  it('always runs the base before the extension even when the wrapped method is called detached', () => {
    const calls: string[] = [];
    const base = {
      name: 'Base',
      setupOnce: () => {
        calls.push('base');
      },
    };

    const result = extendIntegration(base, {
      setupOnce: () => {
        calls.push('extended');
      },
    });

    const detached = result.setupOnce;
    detached();

    expect(calls).toEqual(['base', 'extended']);
  });

  it('uses the extension method as-is (not wrapped) when the base has no method of that name', () => {
    const extendedSetupOnce = vi.fn();
    const base = { name: 'Base' };

    const result = extendIntegration(base, { setupOnce: extendedSetupOnce });

    expect(result.setupOnce).toBe(extendedSetupOnce);

    result.setupOnce();
    expect(extendedSetupOnce).toHaveBeenCalledTimes(1);
  });

  it('leaves base-only methods untouched and callable', () => {
    const baseRun = vi.fn();
    const base = { name: 'Base', run: baseRun };

    const result = extendIntegration(base, { setupOnce: vi.fn() });

    // Not present on the extension, so it is the original reference, not a wrapper.
    expect(result.run).toBe(baseRun);
    result.run();
    expect(baseRun).toHaveBeenCalledTimes(1);
  });

  it('lets the extension overwrite a base method with a non-function value (no wrapping, base not called)', () => {
    const baseHook = vi.fn();
    const result = extendIntegration(
      { name: 'Base', hook: baseHook } as unknown as Integration,
      { hook: 'replaced' } as unknown as Partial<Integration>,
    );

    expect((result as unknown as { hook: unknown }).hook).toBe('replaced');
    expect(baseHook).not.toHaveBeenCalled();
  });

  it('wraps every shared method independently', () => {
    const order: string[] = [];
    const base = {
      name: 'Base',
      setupOnce: () => {
        order.push('base:setupOnce');
      },
      teardown: () => {
        order.push('base:teardown');
      },
    };

    const result = extendIntegration(base, {
      setupOnce: () => {
        order.push('ext:setupOnce');
      },
      teardown: () => {
        order.push('ext:teardown');
      },
    });

    result.setupOnce();
    result.teardown();

    expect(order).toEqual(['base:setupOnce', 'ext:setupOnce', 'base:teardown', 'ext:teardown']);
  });
});
