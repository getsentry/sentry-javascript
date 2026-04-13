import { describe, expect, it } from 'vitest';
import { isCloudflareClass } from '../../src/utils/isCloudflareClass';

class WorkerEntrypoint {}
class DurableObject {}
class WorkflowEntrypoint {}

describe('isCloudflareClass', () => {
  describe('WorkerEntrypoint', () => {
    it('returns true for a class that directly extends WorkerEntrypoint', () => {
      class MyWorker extends WorkerEntrypoint {}
      expect(isCloudflareClass(MyWorker, 'WorkerEntrypoint')).toBe(true);
    });

    it('returns true for a class that indirectly extends WorkerEntrypoint', () => {
      class BaseWorker extends WorkerEntrypoint {}
      class MyWorker extends BaseWorker {}
      expect(isCloudflareClass(MyWorker, 'WorkerEntrypoint')).toBe(true);
    });

    it('returns false for a plain class that does not extend WorkerEntrypoint', () => {
      class PlainClass {}
      expect(isCloudflareClass(PlainClass, 'WorkerEntrypoint')).toBe(false);
    });

    it('returns false for a plain object (ExportedHandler style)', () => {
      const handler = {
        fetch() {
          return new Response('Hello');
        },
      };
      expect(isCloudflareClass(handler, 'WorkerEntrypoint')).toBe(false);
    });

    it('returns false for WorkerEntrypoint itself (not a subclass)', () => {
      expect(isCloudflareClass(WorkerEntrypoint, 'WorkerEntrypoint')).toBe(false);
    });

    it('returns true for deeply nested inheritance', () => {
      class Level1 extends WorkerEntrypoint {}
      class Level2 extends Level1 {}
      class Level3 extends Level2 {}
      expect(isCloudflareClass(Level3, 'WorkerEntrypoint')).toBe(true);
    });

    it('returns false for a class that extends DurableObject', () => {
      class MyDurableObject extends DurableObject {}
      expect(isCloudflareClass(MyDurableObject, 'WorkerEntrypoint')).toBe(false);
    });
  });

  describe('DurableObject', () => {
    it('returns true for a class that directly extends DurableObject', () => {
      class MyDO extends DurableObject {}
      expect(isCloudflareClass(MyDO, 'DurableObject')).toBe(true);
    });

    it('returns true for a class that indirectly extends DurableObject', () => {
      class BaseDO extends DurableObject {}
      class MyDO extends BaseDO {}
      expect(isCloudflareClass(MyDO, 'DurableObject')).toBe(true);
    });

    it('returns false for DurableObject itself', () => {
      expect(isCloudflareClass(DurableObject, 'DurableObject')).toBe(false);
    });

    it('returns false for a class that extends WorkerEntrypoint', () => {
      class MyWorker extends WorkerEntrypoint {}
      expect(isCloudflareClass(MyWorker, 'DurableObject')).toBe(false);
    });
  });

  describe('WorkflowEntrypoint', () => {
    it('returns true for a class that directly extends WorkflowEntrypoint', () => {
      class MyWorkflow extends WorkflowEntrypoint {}
      expect(isCloudflareClass(MyWorkflow, 'WorkflowEntrypoint')).toBe(true);
    });

    it('returns false for WorkflowEntrypoint itself', () => {
      expect(isCloudflareClass(WorkflowEntrypoint, 'WorkflowEntrypoint')).toBe(false);
    });

    it('returns false for a class that extends WorkerEntrypoint', () => {
      class MyWorker extends WorkerEntrypoint {}
      expect(isCloudflareClass(MyWorker, 'WorkflowEntrypoint')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('returns false for null', () => {
      expect(isCloudflareClass(null, 'WorkerEntrypoint')).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isCloudflareClass(undefined, 'WorkerEntrypoint')).toBe(false);
    });

    it('returns false for a function that is not a class', () => {
      function regularFunction() {}
      expect(isCloudflareClass(regularFunction, 'WorkerEntrypoint')).toBe(false);
    });

    it('returns false for primitive values', () => {
      expect(isCloudflareClass(42, 'WorkerEntrypoint')).toBe(false);
      expect(isCloudflareClass('string', 'WorkerEntrypoint')).toBe(false);
      expect(isCloudflareClass(true, 'WorkerEntrypoint')).toBe(false);
    });
  });
});
