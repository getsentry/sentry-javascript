/* eslint-disable deprecation/deprecation */
/* eslint-disable @typescript-eslint/unbound-method */
import { Hub, Scope } from '@sentry/core';
import { logger } from '@sentry/utils';

import { Integrations, Span } from '../../src';
import { getTestClient } from '../testutils';

const GQLExecute = {
  execute() {
    return Promise.resolve();
  },
};

// Jest mocks get hoisted. vars starting with `mock` are hoisted before imports.
/* eslint-disable no-var */
var mockClient = GQLExecute;

// mock for 'graphql/execution/execution.js' package
jest.mock('@sentry/utils', () => {
  const actual = jest.requireActual('@sentry/utils');
  return {
    ...actual,
    loadModule() {
      return mockClient;
    },
  };
});

describe('setupOnce', () => {
  let scope = new Scope();
  let parentSpan: Span;
  let childSpan: Span;

  beforeAll(() => {
    new Integrations.GraphQL().setupOnce(
      () => undefined,
      () => new Hub(undefined, scope),
    );
  });

  beforeEach(() => {
    scope = new Scope();
    parentSpan = new Span();
    childSpan = parentSpan.startChild();
    jest.spyOn(scope, 'getSpan').mockReturnValueOnce(parentSpan);
    jest.spyOn(scope, 'setSpan');
    jest.spyOn(parentSpan, 'startChild').mockReturnValueOnce(childSpan);
    jest.spyOn(childSpan, 'finish');
  });

  it('should wrap execute method', async () => {
    await GQLExecute.execute();
    expect(scope.getSpan).toBeCalled();
    expect(parentSpan.startChild).toBeCalledWith({
      description: 'execute',
      op: 'graphql.execute',
      origin: 'auto.graphql.graphql',
    });
    expect(childSpan.finish).toBeCalled();
    expect(scope.setSpan).toHaveBeenCalledTimes(2);
  });

  it("doesn't attach when using otel instrumenter", () => {
    const loggerLogSpy = jest.spyOn(logger, 'log');

    const client = getTestClient({ instrumenter: 'otel' });
    const hub = new Hub(client);

    const integration = new Integrations.GraphQL();
    integration.setupOnce(
      () => {},
      () => hub,
    );

    expect(loggerLogSpy).toBeCalledWith('GraphQL Integration is skipped because of instrumenter configuration.');
  });
});
