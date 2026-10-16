import * as SentryNode from '@sentry/node';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import { init } from '../src/index.server';

vi.mock('@sentry/node', { spy: true });

const nodeInit = SentryNode.init as Mock;

describe('Server init()', () => {
  afterEach(() => {
    vi.clearAllMocks();

    SentryNode.getGlobalScope().clear();
    SentryNode.getIsolationScope().clear();
    SentryNode.getCurrentScope().clear();
    SentryNode.getCurrentScope().setClient(undefined);
  });

  it('inits the Node SDK', () => {
    expect(nodeInit).toHaveBeenCalledTimes(0);
    init({});
    expect(nodeInit).toHaveBeenCalledTimes(1);
    expect(nodeInit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        _metadata: {
          sdk: {
            name: 'sentry.javascript.remix',
            version: expect.any(String),
            packages: [
              {
                name: 'npm:@sentry/remix',
                version: expect.any(String),
              },
              {
                name: 'npm:@sentry/node',
                version: expect.any(String),
              },
            ],
          },
        },
      }),
    );
  });

  it("doesn't reinitialize the node SDK if already initialized", () => {
    expect(nodeInit).toHaveBeenCalledTimes(0);
    init({});
    expect(nodeInit).toHaveBeenCalledTimes(1);
    init({});
    expect(nodeInit).toHaveBeenCalledTimes(1);
  });

  it('returns client from init', () => {
    expect(init({})).not.toBeUndefined();
  });

  it.each([
    { value: 'false', defaultIntegrations: false as const },
    { value: 'an empty array', defaultIntegrations: [] },
  ])('disables default integrations when set to $value', ({ defaultIntegrations }) => {
    const client = init({ defaultIntegrations });

    expect(client?.getOptions().integrations.map(integration => integration.name)).toEqual([]);
  });

  it('replaces default integrations with a custom array', () => {
    const integration = { name: 'CustomIntegration' };

    const client = init({ defaultIntegrations: [integration] });

    expect(client?.getOptions().integrations.map(integration => integration.name)).toEqual(['CustomIntegration']);
  });
});
