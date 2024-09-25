import { parseGraphQLQuery } from '../src';

describe('parseGraphQLQuery', () => {
  const queryOne = `query Test {
    items {
        id
        }
    }`;

  const queryTwo = `mutation AddTestItem($input: TestItem!) {
    addItem(input: $input) {
        name
        }
    }`;

  const queryThree = `subscription OnTestItemAdded($itemID: ID!) {
    itemAdded(itemID: $itemID) {
        id
        }
    }`;

  // TODO: support name-less queries
  //   const queryFour = `   query   {
  //     items {
  //         id
  //         }
  //     }`;

  test.each([
    ['should handle query type', queryOne, { operationName: 'Test', operationType: 'query' }],
    ['should handle mutation type', queryTwo, { operationName: 'AddTestItem', operationType: 'mutation' }],
    [
      'should handle subscription type',
      queryThree,
      { operationName: 'OnTestItemAdded', operationType: 'subscription' },
    ],
    // ['should handle query without name', queryFour, { operationName: undefined, operationType: 'query' }],
  ])('%s', (_, input, output) => {
    expect(parseGraphQLQuery(input)).toEqual(output);
  });
});
