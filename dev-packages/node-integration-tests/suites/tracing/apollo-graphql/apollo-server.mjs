import { ApolloServer } from '@apollo/server';
import * as Sentry from '@sentry/node';
import gql from 'graphql-tag';

export function createApolloServer() {
  return Sentry.startSpan({ name: 'Test Server Start' }, () => {
    return new ApolloServer({
      typeDefs: gql`
        type Query {
          hello: String
          world: String
        }
        type Mutation {
          login(email: String): String
        }
      `,
      resolvers: {
        Query: {
          hello: () => {
            return 'Hello!';
          },
          world: () => {
            return 'World!';
          },
        },
        Mutation: {
          login: async (_, { email }) => {
            return `${email}--token`;
          },
        },
      },
      introspection: false,
    });
  });
}
