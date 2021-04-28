import { Integration } from '@sentry/types';

import { getIntegrationsToSetup } from '../../src/integration';

/** JSDoc */
class MockIntegration implements Integration {
  public name: string;

  public constructor(name: string) {
    this.name = name;
  }

  public setupOnce(): void {
    // noop
  }
}

describe('getIntegrationsToSetup', () => {
  it('works with empty array', () => {
    const integrations = getIntegrationsToSetup({
      userIntegrations: [],
    });

    expect(integrations.map(i => i.name)).toEqual([]);
  });

  it('works with single item', () => {
    const integrations = getIntegrationsToSetup({
      userIntegrations: [new MockIntegration('foo')],
    });

    expect(integrations.map(i => i.name)).toEqual(['foo']);
  });

  it('works with multiple items', () => {
    const integrations = getIntegrationsToSetup({
      userIntegrations: [new MockIntegration('foo'), new MockIntegration('bar')],
    });

    expect(integrations.map(i => i.name)).toEqual(['foo', 'bar']);
  });

  it('filter duplicated items', () => {
    const integrations = getIntegrationsToSetup({
      userIntegrations: [new MockIntegration('foo'), new MockIntegration('foo'), new MockIntegration('bar')],
    });

    expect(integrations.map(i => i.name)).toEqual(['foo', 'bar']);
  });

  it('filter duplicated items and always let first win', () => {
    const first = new MockIntegration('foo');
    (first as any).order = 'first';
    const second = new MockIntegration('foo');
    (second as any).order = 'second';

    const integrations = getIntegrationsToSetup({
      userIntegrations: [first, second, new MockIntegration('bar')],
    });

    expect(integrations.map(i => i.name)).toEqual(['foo', 'bar']);
    expect((integrations[0] as any).order).toEqual('first');
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
      userIntegrations: [new MockIntegration('bar')],
    });

    expect(integrations.map(i => i.name)).toEqual(['foo', 'bar']);
  });

  it('work with user integrations and defaults and filter duplicates', () => {
    const integrations = getIntegrationsToSetup({
      defaultIntegrations: [new MockIntegration('foo'), new MockIntegration('foo')],
      userIntegrations: [new MockIntegration('bar'), new MockIntegration('bar')],
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
      userIntegrations: [firstUser, secondUser],
    });

    expect(integrations.map(i => i.name)).toEqual(['foo', 'bar']);
    expect((integrations[0] as any).order).toEqual('firstUser');
    expect((integrations[1] as any).order).toEqual('secondUser');
  });
});
