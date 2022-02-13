import {expect} from '@playwright/test';

import {sentryTest} from '../../../../utils/fixtures';
import {getSentryRequest} from '../../../../utils/helpers';

sentryTest('should set different properties of a scope', async ({getLocalTestPath, page}) => {
  const url = await getLocalTestPath({testDir: __dirname});

  const eventData = await getSentryRequest(page, url);

  expect(eventData.message).toBe('configured_scope');
  expect(eventData.user).toMatchObject({id: 'baz'});
  expect(eventData.tags).toMatchObject({foo: 'bar'});
  expect(eventData.extra).toMatchObject({qux: 'quux'});
  expect(eventData.contexts).toMatchObject({
    context1: {
      prop: '1234',
      anotherProp: {
        isNested: true
      }
    },
    context2: {
      aNewPropForContext2: [1, 2, 3]
    }
  });
});
