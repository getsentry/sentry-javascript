/**
 * We are using this snippet from '@analogjs/vite-plugin-angular' to make vitest work with Angular.
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2022 Brandon Roberts
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import 'zone.js';
import 'zone.js/plugins/proxy';
import 'zone.js/plugins/sync-test';
import 'zone.js/testing';

/**
 * Patch Vitest's describe/test/beforeEach/afterEach functions so test code
 * always runs in a testZone (ProxyZone).
 */
/* global Zone */
const Zone = (globalThis as any)['Zone'];

if (Zone === undefined) {
  throw new Error('Missing: Zone (zone.js)');
}

if ((globalThis as any)['__vitest_zone_patch__'] === true) {
  throw new Error("'vitest' has already been patched with 'Zone'.");
}

(globalThis as any)['__vitest_zone_patch__'] = true;
const SyncTestZoneSpec = Zone['SyncTestZoneSpec'];
const ProxyZoneSpec = Zone['ProxyZoneSpec'];

if (SyncTestZoneSpec === undefined) {
  throw new Error('Missing: SyncTestZoneSpec (zone.js/plugins/sync-test)');
}
if (ProxyZoneSpec === undefined) {
  throw new Error('Missing: ProxyZoneSpec (zone.js/plugins/proxy.js)');
}

const env = globalThis as any;
const ambientZone = Zone.current;

// Create a synchronous-only zone in which to run `describe` blocks in order to
// raise an error if any asynchronous operations are attempted
// inside of a `describe` but outside of a `beforeEach` or `it`.
const syncZone = ambientZone.fork(new SyncTestZoneSpec('vitest.describe'));
function wrapDescribeInZone(describeBody: any) {
  return function (...args: any) {
    return syncZone.run(describeBody, null, args);
  };
}

// Create a proxy zone in which to run `test` blocks so that the tests function
// can retroactively install different zones.
const testProxyZone = ambientZone.fork(new ProxyZoneSpec());
function wrapTestInZone(testBody: string | any[] | undefined) {
  if (testBody === undefined) {
    return;
  }

  const wrappedFunc = function () {
    return testProxyZone.run(testBody, null, arguments);
  };
  try {
    Object.defineProperty(wrappedFunc, 'length', {
      configurable: true,
      writable: true,
      enumerable: false,
    });
    wrappedFunc.length = testBody.length;
  } catch (e) {
    return testBody.length === 0
      ? () => testProxyZone.run(testBody, null)
      : (done: any) => testProxyZone.run(testBody, null, [done]);
  }

  return wrappedFunc;
}

/**
 * Allows Vitest to handle Angular test fixtures
 *
 * Vitest Snapshot guide ==> https://vitest.dev/guide/snapshot.html
 *
 * @returns customSnapshotSerializer for Angular Fixture Component
 */
const customSnapshotSerializer = () => {
  function serialize(val: any, config: any, indentation: any, depth: any, refs: any, printer: any): string {
    // `printer` is a function that serializes a value using existing plugins.
    return `${printer(fixtureVitestSerializer(val), config, indentation, depth, refs)}`;
  }
  function test(val: any): boolean {
    // * If it's a ComponentFixture we apply the transformation rules
    return val && isAngularFixture(val);
  }
  return {
    serialize,
    test,
  };
};

/**
 * Check if is an Angular fixture
 *
 * @param val Angular fixture
 * @returns boolean who check if is an angular fixture
 */
function isAngularFixture(val: any): boolean {
  if (typeof val !== 'object') {
    return false;
  }

  if (val['componentRef'] || val['componentInstance']) {
    return true;
  }

  if (val['componentType']) {
    return true;
  }

  // * Angular fixture keys in Fixture component Object
  const fixtureKeys = [
    'componentRef',
    'ngZone',
    'effectRunner',
    '_autoDetect',
    '_isStable',
    '_isDestroyed',
    '_resolve',
    '_promise',
    '_onUnstableSubscription',
    '_onStableSubscription',
    '_onMicrotaskEmptySubscription',
    '_onErrorSubscription',
    'changeDetectorRef',
    'elementRef',
    'debugElement',
    'componentInstance',
    'nativeElement',
  ];

  // * Angular fixture keys in Fixture componentRef Object
  const fixtureComponentRefKeys = [
    'location',
    '_rootLView',
    '_tNode',
    'previousInputValues',
    'instance',
    'changeDetectorRef',
    'hostView',
    'componentType',
  ];

  return (
    JSON.stringify(Object.keys(val)) === JSON.stringify(fixtureKeys) ||
    JSON.stringify(Object.keys(val)) === JSON.stringify(fixtureComponentRefKeys)
  );
}

/**
 * Serialize Angular fixture for Vitest
 *
 * @param fixture Angular Fixture Component
 * @returns HTML Child Node
 */
function fixtureVitestSerializer(fixture: any) {
  // * Get Component meta data
  const componentType = (
    fixture && fixture.componentType ? fixture.componentType : fixture.componentRef.componentType
  ) as any;

  let inputsData: string = '';

  const selector = Reflect.getOwnPropertyDescriptor(componentType, '__annotations__')?.value[0].selector;

  if (componentType && componentType.propDecorators) {
    inputsData = Object.entries(componentType.propDecorators)
      .map(([key, value]) => `${key}="${value}"`)
      .join('');
  }

  // * Get DOM Elements
  const divElement = fixture && fixture.nativeElement ? fixture.nativeElement : fixture.location.nativeElement;

  // * Convert string data to HTML data
  const doc = new DOMParser().parseFromString(
    `<${selector} ${inputsData}>${divElement.innerHTML}</${selector}>`,
    'text/html',
  );

  return doc.body.childNodes[0];
}

/**
 * bind describe method to wrap describe.each function
 */
const bindDescribe = (originalVitestFn: {
  apply: (
    arg0: any,
    arg1: any[],
  ) => {
    (): any;
    new (): any;
    apply: { (arg0: any, arg1: any[]): any; new (): any };
  };
}) =>
  function (...eachArgs: any) {
    return function (...args: any[]) {
      args[1] = wrapDescribeInZone(args[1]);

      // @ts-ignore
      return originalVitestFn.apply(this, eachArgs).apply(this, args);
    };
  };

/**
 * bind test method to wrap test.each function
 */
const bindTest = (originalVitestFn: {
  apply: (
    arg0: any,
    arg1: any[],
  ) => {
    (): any;
    new (): any;
    apply: { (arg0: any, arg1: any[]): any; new (): any };
  };
}) =>
  function (...eachArgs: any) {
    return function (...args: any[]) {
      args[1] = wrapTestInZone(args[1]);

      // @ts-ignore
      return originalVitestFn.apply(this, eachArgs).apply(this, args);
    };
  };

['describe'].forEach(methodName => {
  const originalvitestFn = env[methodName];
  env[methodName] = function (...args: any[]) {
    args[1] = wrapDescribeInZone(args[1]);

    return originalvitestFn.apply(this, args);
  };
  env[methodName].each = bindDescribe(originalvitestFn.each);
  if (methodName === 'describe') {
    env[methodName].only = env['fdescribe'];
    env[methodName].skip = env['xdescribe'];
  }
});

['test', 'it'].forEach(methodName => {
  const originalvitestFn = env[methodName];
  env[methodName] = function (...args: any[]) {
    args[1] = wrapTestInZone(args[1]);

    return originalvitestFn.apply(this, args);
  };
  env[methodName].each = bindTest(originalvitestFn.each);

  if (methodName === 'test' || methodName === 'it') {
    env[methodName].todo = function (...args: any) {
      return originalvitestFn.todo.apply(this, args);
    };
  }
});

['beforeEach', 'afterEach', 'beforeAll', 'afterAll'].forEach(methodName => {
  const originalvitestFn = env[methodName];

  env[methodName] = function (...args: any[]) {
    args[0] = wrapTestInZone(args[0]);

    return originalvitestFn.apply(this, args);
  };
});

['expect'].forEach(methodName => {
  const originalvitestFn = env[methodName];
  return originalvitestFn.addSnapshotSerializer(customSnapshotSerializer());
});
