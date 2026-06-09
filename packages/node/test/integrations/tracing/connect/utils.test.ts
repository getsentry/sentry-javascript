/*
 * Tests ported from @opentelemetry/instrumentation-connect@0.61.0
 * Original source: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/packages/instrumentation-connect
 * Licensed under the Apache License, Version 2.0
 */

import { describe, expect, it } from 'vitest';
import type { PatchedRequest } from '../../../../src/integrations/tracing/connect/vendored/internal-types';
import { _LAYERS_STORE_PROPERTY } from '../../../../src/integrations/tracing/connect/vendored/internal-types';
import {
  addNewStackLayer,
  generateRoute,
  replaceCurrentStackRoute,
} from '../../../../src/integrations/tracing/connect/vendored/utils';

describe('utils', () => {
  describe('addNewStackLayer', () => {
    it('should inject new array to symbol property if not exist', () => {
      const fakeRequest = {} as PatchedRequest;

      addNewStackLayer(fakeRequest);

      expect(fakeRequest[_LAYERS_STORE_PROPERTY].length).toBe(1);
    });

    it('should append new stack item if private symbol already exists', () => {
      const stack = ['/first'];
      const fakeRequest = {
        [_LAYERS_STORE_PROPERTY]: stack,
      } as PatchedRequest;

      addNewStackLayer(fakeRequest);

      expect(fakeRequest[_LAYERS_STORE_PROPERTY]).toBe(stack);
      expect(fakeRequest[_LAYERS_STORE_PROPERTY].length).toBe(2);
    });

    it('should return pop method to remove newly add stack', () => {
      const fakeRequest = {} as PatchedRequest;

      const pop = addNewStackLayer(fakeRequest);

      expect(pop).toBeDefined();

      pop();

      expect(fakeRequest[_LAYERS_STORE_PROPERTY].length).toBe(0);
    });

    it('should prevent pop the same stack item multiple time', () => {
      const fakeRequest = {} as PatchedRequest;

      addNewStackLayer(fakeRequest); // add first stack item
      const pop = addNewStackLayer(fakeRequest); // add second stack item

      pop();
      pop();

      expect(fakeRequest[_LAYERS_STORE_PROPERTY].length).toBe(1);
    });
  });

  describe('replaceCurrentStackRoute', () => {
    it('should replace the last stack item with new value', () => {
      const fakeRequest = {
        [_LAYERS_STORE_PROPERTY]: ['/first', '/second'],
      } as PatchedRequest;

      replaceCurrentStackRoute(fakeRequest, '/new_route');

      expect(fakeRequest[_LAYERS_STORE_PROPERTY].length).toBe(2);
      expect(fakeRequest[_LAYERS_STORE_PROPERTY][1]).toBe('/new_route');
    });
  });

  describe('generateRoute', () => {
    it('should combine the stack and striped any slash between layer', () => {
      const fakeRequest = {
        [_LAYERS_STORE_PROPERTY]: ['/first/', '/second', '/third/'],
      } as PatchedRequest;

      const route = generateRoute(fakeRequest);

      expect(route).toBe('/first/second/third/');
    });
  });
});
