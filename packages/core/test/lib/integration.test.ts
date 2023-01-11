import type { Integration, Options } from '@sentry/types';

import { getIntegrationsToSetup } from '../../src/integration';

/** JSDoc */
class MockIntegration implements Integration {
  public name: string;

  // Only for testing - tag to keep separate instances straight when testing deduplication
  public tag?: string;

  public constructor(name: string, tag?: string) {
    this.name = name;
    this.tag = tag;
  }

  public setupOnce(): void {
    // noop
  }
}

type TestCase = [
  string, // test name
  Options['defaultIntegrations'], // default integrations
  Options['integrations'], // user-provided integrations
  Array<string | string[]>, // expected resulst
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

  describe('puts `Debug` integration last', () => {
    // No variations here (default vs user, duplicates, user array vs user function, etc) because by the time we're
    // dealing with the `Debug` integration, all of the combining and deduping has already been done
    const noDebug = [new MockIntegration('ChaseSquirrels')];
    const debugNotLast = [new MockIntegration('Debug'), new MockIntegration('CatchTreats')];
    const debugAlreadyLast = [new MockIntegration('ChaseSquirrels'), new MockIntegration('Debug')];

    const testCases: TestCase[] = [
      // each test case is [testName, defaultIntegrations, userIntegrations, expectedResult]
      ['`Debug` not present', false, noDebug, ['ChaseSquirrels']],
      ['`Debug` not originally last', false, debugNotLast, ['CatchTreats', 'Debug']],
      ['`Debug` already last', false, debugAlreadyLast, ['ChaseSquirrels', 'Debug']],
    ];

    test.each(testCases)('%s', (_, defaultIntegrations, userIntegrations, expected) => {
      const integrations = getIntegrationsToSetup({
        defaultIntegrations,
        integrations: userIntegrations,
      });
      expect(integrations.map(i => i.name)).toEqual(expected);
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

  it('always moves Debug integration to the end of the list', () => {
    let integrations = getIntegrationsToSetup({
      defaultIntegrations: [new MockIntegration('Debug'), new MockIntegration('foo')],
      integrations: [new MockIntegration('bar')],
    });

    expect(integrations.map(i => i.name)).toEqual(['foo', 'bar', 'Debug']);

    integrations = getIntegrationsToSetup({
      defaultIntegrations: [new MockIntegration('foo')],
      integrations: [new MockIntegration('Debug'), new MockIntegration('bar')],
    });

    expect(integrations.map(i => i.name)).toEqual(['foo', 'bar', 'Debug']);

    integrations = getIntegrationsToSetup({
      defaultIntegrations: [new MockIntegration('Debug')],
      integrations: [new MockIntegration('foo')],
    });

    expect(integrations.map(i => i.name)).toEqual(['foo', 'Debug']);
  });
});
