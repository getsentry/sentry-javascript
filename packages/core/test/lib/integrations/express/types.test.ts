import * as types from '../../../../src/integrations/express/types';
import { describe, it, expect } from 'vitest';

// this is mostly just a types-bag, but it does have some constant keys
describe('types', () => {
  it('exports several constants', () => {
    // spread so it's a normal object
    const { ...vals } = types;
    expect(vals).toStrictEqual({
      ATTR_EXPRESS_NAME: 'express.name',
      ATTR_HTTP_ROUTE: 'http.route',
      ATTR_EXPRESS_TYPE: 'express.type',
      ExpressLayerType_ROUTER: 'router',
      ExpressLayerType_MIDDLEWARE: 'middleware',
      ExpressLayerType_REQUEST_HANDLER: 'request_handler',
    });
  });
});
