const { ApolloServer, gql } = require('apollo-server');
const Sentry = require('@sentry/node');

module.exports = () => {
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
      debug: false,
    });
  });
};
