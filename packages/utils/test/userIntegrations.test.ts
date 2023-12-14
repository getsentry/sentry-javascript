import type { IntegrationWithExclusionOption as Integration, UserIntegrations } from '../src/userIntegrations';
import { addOrUpdateIntegration } from '../src/userIntegrations';

type MockIntegrationOptions = {
  name: string;
  descriptor: string;
  age?: number;
};

class DogIntegration implements Integration {
  public static id = 'Dog';
  public name: string = DogIntegration.id;

  public dogName: string;
  public descriptor: string;
  public age?: number;

  public allowExclusionByUser?: boolean;

  constructor(options: MockIntegrationOptions) {
    this.dogName = options.name;
    this.descriptor = options.descriptor;
    this.age = options.age;
  }

  setupOnce() {
    return undefined;
  }
}

class CatIntegration implements Integration {
  public static id = 'Cat';
  public name: string = CatIntegration.id;

  public catName: string;
  public descriptor: string;
  public age?: number;

  constructor(options: MockIntegrationOptions) {
    this.catName = options.name;
    this.descriptor = options.descriptor;
    this.age = options.age;
  }

  setupOnce() {
    return undefined;
  }
}

const defaultDogIntegration = new DogIntegration({ name: 'Maisey', descriptor: 'silly' });
const defaultCatIntegration = new CatIntegration({ name: 'Piper', descriptor: 'fluffy' });
const forcedDogIntegration = new DogIntegration({ name: 'Charlie', descriptor: 'goofy' });
const forcedDogIntegrationProperties = { dogName: 'Charlie', descriptor: 'goofy' };

// Note: This is essentially the implementation of a `test.each()` test. Making it a separate function called in
// individual tests instead allows the various `describe` clauses to be nested, which is helpful here given how many
// different combinations of factors come into play.
function runTest(testOptions: {
  userIntegrations: UserIntegrations;
  forcedDogIntegrationInstance: DogIntegration;
  underlyingDefaultIntegrations?: Integration[];
  allowIntegrationExclusion?: boolean;
  expectedDogIntegrationProperties: Partial<DogIntegration> | undefined;
}): void {
  const {
    userIntegrations,
    forcedDogIntegrationInstance,
    underlyingDefaultIntegrations = [],
    allowIntegrationExclusion = false,
    expectedDogIntegrationProperties,
  } = testOptions;

  if (allowIntegrationExclusion) {
    forcedDogIntegrationInstance.allowExclusionByUser = true;
  }

  let integrations;
  if (typeof userIntegrations === 'function') {
    const wrappedUserIntegrationsFunction = addOrUpdateIntegration(forcedDogIntegrationInstance, userIntegrations, {
      dogName: 'Charlie',
      descriptor: 'goofy',
    });
    integrations = wrappedUserIntegrationsFunction(underlyingDefaultIntegrations);
  } else {
    integrations = addOrUpdateIntegration(
      forcedDogIntegrationInstance,
      userIntegrations,
      forcedDogIntegrationProperties,
    );
  }

  const finalDogIntegrationInstance = integrations.find(integration => integration.name === 'Dog') as DogIntegration;

  if (expectedDogIntegrationProperties) {
    expect(finalDogIntegrationInstance).toMatchObject(expectedDogIntegrationProperties);
  } else {
    expect(finalDogIntegrationInstance).toBeUndefined();
  }

  delete forcedDogIntegrationInstance.allowExclusionByUser;
}

describe('addOrUpdateIntegration()', () => {
  describe('user provides no `integrations` option', () => {
    it('adds forced integration instance', () => {
      expect.assertions(1);

      runTest({
        userIntegrations: [], // default if no option is provided
        forcedDogIntegrationInstance: forcedDogIntegration,
        expectedDogIntegrationProperties: forcedDogIntegrationProperties,
      });
    });
  });

  describe('user provides `integrations` array', () => {
    describe('array contains forced integration type', () => {
      it('updates user instance with forced options', () => {
        expect.assertions(1);

        runTest({
          userIntegrations: [{ ...defaultDogIntegration, age: 9 } as unknown as Integration],
          forcedDogIntegrationInstance: forcedDogIntegration,
          expectedDogIntegrationProperties: { ...forcedDogIntegrationProperties, age: 9 },
        });
      });
    });

    describe('array does not contain forced integration type', () => {
      it('adds forced integration instance', () => {
        expect.assertions(1);

        runTest({
          userIntegrations: [defaultCatIntegration],
          forcedDogIntegrationInstance: forcedDogIntegration,
          expectedDogIntegrationProperties: forcedDogIntegrationProperties,
        });
      });
    });
  });

  describe('user provides `integrations` function', () => {
    describe('forced integration in `defaultIntegrations`', () => {
      const underlyingDefaultIntegrations = [defaultDogIntegration, defaultCatIntegration];

      describe('function filters out forced integration type', () => {
        it('adds forced integration instance by default', () => {
          expect.assertions(1);

          runTest({
            userIntegrations: _defaults => [defaultCatIntegration],
            forcedDogIntegrationInstance: forcedDogIntegration,
            underlyingDefaultIntegrations,
            expectedDogIntegrationProperties: forcedDogIntegrationProperties,
          });
        });

        it('does not add forced integration instance if integration exclusion is allowed', () => {
          expect.assertions(1);

          runTest({
            userIntegrations: _defaults => [defaultCatIntegration],
            forcedDogIntegrationInstance: forcedDogIntegration,
            underlyingDefaultIntegrations,
            allowIntegrationExclusion: true,
            expectedDogIntegrationProperties: undefined, // this means no instance was found
          });
        });
      });

      describe("function doesn't filter out forced integration type", () => {
        it('updates user instance with forced options', () => {
          expect.assertions(1);

          runTest({
            userIntegrations: _defaults => [{ ...defaultDogIntegration, age: 9 } as unknown as Integration],
            forcedDogIntegrationInstance: forcedDogIntegration,
            underlyingDefaultIntegrations,
            expectedDogIntegrationProperties: { ...forcedDogIntegrationProperties, age: 9 },
          });
        });
      });
    });

    describe('forced integration not in `defaultIntegrations`', () => {
      const underlyingDefaultIntegrations = [defaultCatIntegration];

      describe('function returns forced integration type', () => {
        it('updates user instance with forced options', () => {
          expect.assertions(1);

          runTest({
            userIntegrations: _defaults => [{ ...defaultDogIntegration, age: 9 } as unknown as Integration],
            forcedDogIntegrationInstance: forcedDogIntegration,
            underlyingDefaultIntegrations,
            expectedDogIntegrationProperties: { ...forcedDogIntegrationProperties, age: 9 },
          });
        });
      });

      describe("function doesn't return forced integration type", () => {
        it('adds forced integration instance', () => {
          expect.assertions(1);

          runTest({
            userIntegrations: _defaults => [{ ...defaultCatIntegration, age: 1 } as unknown as Integration],
            forcedDogIntegrationInstance: forcedDogIntegration,
            underlyingDefaultIntegrations,
            expectedDogIntegrationProperties: forcedDogIntegrationProperties,
          });
        });
      });
    });
  });
});
