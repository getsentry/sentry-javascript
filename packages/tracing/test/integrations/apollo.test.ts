/* eslint-disable @typescript-eslint/unbound-method */
import { Hub, Scope } from '@sentry/core';

import { Apollo } from '../../src/integrations/node/apollo';
import { Span } from '../../src/span';

type ApolloResolverGroup = {
  [key: string]: () => any;
};

type ApolloModelResolvers = {
  [key: string]: ApolloResolverGroup;
};

class ApolloServerBase {
  config: {
    resolvers: ApolloModelResolvers[];
  };

  constructor() {
    this.config = {
      resolvers: [
        {
          Query: {
            res_1(..._args: unknown[]) {
              return 'foo';
            },
          },
          Mutation: {
            res_2(..._args: unknown[]) {
              return 'bar';
            },
          },
        },
      ],
    };

    this.constructSchema();
  }

  public constructSchema(..._args: unknown[]) {
    return null;
  }
}

// mock for ApolloServer package
jest.mock('@sentry/utils', () => {
  const actual = jest.requireActual('@sentry/utils');
  return {
    ...actual,
    loadModule() {
      return {
        ApolloServerBase,
      };
    },
  };
});

describe('setupOnce', () => {
  let scope = new Scope();
  let parentSpan: Span;
  let childSpan: Span;
  let ApolloServer: ApolloServerBase;

  beforeAll(() => {
    new Apollo().setupOnce(
      () => undefined,
      () => new Hub(undefined, scope),
    );

    ApolloServer = new ApolloServerBase();
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

  it('should wrap a simple resolver', () => {
    ApolloServer.config.resolvers[0]?.['Query']?.['res_1']?.();
    expect(scope.getSpan).toBeCalled();
    expect(parentSpan.startChild).toBeCalledWith({
      description: 'Query.res_1',
      op: 'graphql.resolve',
    });
    expect(childSpan.finish).toBeCalled();
  });

  it('should wrap another simple resolver', () => {
    ApolloServer.config.resolvers[0]?.['Mutation']?.['res_2']?.();
    expect(scope.getSpan).toBeCalled();
    expect(parentSpan.startChild).toBeCalledWith({
      description: 'Mutation.res_2',
      op: 'graphql.resolve',
    });
    expect(childSpan.finish).toBeCalled();
  });
});
