import * as types from '../../../../src/integrations/express/types';
import { describe, it, expect } from 'vitest';

// this is mostly just a types-bag, but it does have some keys and such.
describe('types', () => {
  it('exports some stuff', () => {
    const { kLayerPatched, ...vals } = types;
    expect(String(kLayerPatched)).toBe('Symbol(express-layer-patched)');
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
