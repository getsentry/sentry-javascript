import { getActiveSpan, startInactiveSpan } from '@sentry/browser';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_HOOKS } from '../../src/constants';
import { createTracingMixins } from '../../src/tracing';

vi.mock('@sentry/browser', () => {
  return {
    getActiveSpan: vi.fn(),
    startInactiveSpan: vi.fn().mockImplementation(({ name, op }) => {
      return {
        end: vi.fn(),
        startChild: vi.fn(),
        name,
        op,
      };
    }),
    SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN: 'sentry.origin',
  };
});

vi.mock('../../src/vendor/components', () => {
  return {
    formatComponentName: vi.fn().mockImplementation(vm => {
      return vm.componentName || 'TestComponent';
    }),
  };
});

const mockSpanFactory = (): { name?: string; op?: string; end: Mock; startChild: Mock } => ({
  name: undefined,
  op: undefined,
  end: vi.fn(),
  startChild: vi.fn(),
});

vi.useFakeTimers();

describe('Vue Tracing Mixins', () => {
  let mockVueInstance: any;
  let mockRootInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRootInstance = {
      $root: null,
      componentName: 'RootComponent',
      $_sentrySpans: {},
    };
    mockRootInstance.$root = mockRootInstance; // Self-reference for root

    mockVueInstance = {
      $root: mockRootInstance,
      componentName: 'TestComponent',
      $_sentrySpans: {},
    };

    (getActiveSpan as any).mockReturnValue({ id: 'parent-span' });
    (startInactiveSpan as any).mockImplementation(({ name, op }: { name: string; op: string }) => {
      const newSpan = mockSpanFactory();
      newSpan.name = name;
      newSpan.op = op;
      return newSpan;
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('Mixin Creation', () => {
    it('should create mixins for default hooks', () => {
      const mixins = createTracingMixins();

      DEFAULT_HOOKS.forEach(hook => {
        const hookPairs = {
          mount: ['beforeMount', 'mounted'],
          update: ['beforeUpdate', 'updated'],
          destroy: ['beforeDestroy', 'destroyed'],
          unmount: ['beforeUnmount', 'unmounted'],
          create: ['beforeCreate', 'created'],
          activate: ['activated', 'deactivated'],
        };

        if (hook in hookPairs) {
          hookPairs[hook as keyof typeof hookPairs].forEach(lifecycleHook => {
            expect(mixins).toHaveProperty(lifecycleHook);
            // @ts-expect-error we check the type here
            expect(typeof mixins[lifecycleHook]).toBe('function');
          });
        }
      });
    });

    it('should always include the activate and mount hooks', () => {
      const mixins = createTracingMixins({ hooks: undefined });

      expect(Object.keys(mixins)).toEqual(['activated', 'deactivated', 'beforeMount', 'mounted']);
    });

    it('should create mixins for custom hooks', () => {
      const mixins = createTracingMixins({ hooks: ['update'] });

      expect(Object.keys(mixins)).toEqual([
        'beforeUpdate',
        'updated',
        'activated',
        'deactivated',
        'beforeMount',
        'mounted',
      ]);
    });
  });

  describe('Root Component Behavior', () => {
    it('should always create root span for root component regardless of tracking options', () => {
      const mixins = createTracingMixins({ trackComponents: false });

      mixins.beforeMount.call(mockRootInstance);

      expect(startInactiveSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Application Render',
          op: 'ui.vue.render',
        }),
      );
    });

    it('should finish root span on timer after component spans end', () => {
      // todo/fixme: This root span is only finished if trackComponents is true --> it should probably be always finished
      const mixins = createTracingMixins({ trackComponents: true, timeout: 1000 });
      const rootMockSpan = mockSpanFactory();
      mockRootInstance.$_sentryRootSpan = rootMockSpan;

      // Create and finish a component span
      mixins.beforeMount.call(mockVueInstance);
      mixins.mounted.call(mockVueInstance);

      // Root span should not end immediately
      expect(rootMockSpan.end).not.toHaveBeenCalled();

      // After timeout, root span should end
      vi.advanceTimersByTime(1001);
      expect(rootMockSpan.end).toHaveBeenCalled();
    });
  });

  describe('Component Span Lifecycle', () => {
    it('should create and end spans correctly through lifecycle hooks', () => {
      const mixins = createTracingMixins({ trackComponents: true });

      // 1. Create span in "before" hook
      mixins.beforeMount.call(mockVueInstance);

      // Verify span was created with correct details
      expect(startInactiveSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Vue TestComponent',
          op: 'ui.vue.mount',
        }),
      );
      expect(mockVueInstance.$_sentrySpans.mount).toBeDefined();

      // 2. Get the span for verification
      const componentSpan = mockVueInstance.$_sentrySpans.mount;

      // 3. End span in "after" hook
      mixins.mounted.call(mockVueInstance);
      expect(componentSpan.end).toHaveBeenCalled();
    });

    it('should clean up existing spans when creating new ones', () => {
      const mixins = createTracingMixins({ trackComponents: true });

      // Create an existing span first
      const oldSpan = mockSpanFactory();
      mockVueInstance.$_sentrySpans.mount = oldSpan;

      // Create a new span for the same operation
      mixins.beforeMount.call(mockVueInstance);

      // Verify old span was ended and new span was created
      expect(oldSpan.end).toHaveBeenCalled();
      expect(mockVueInstance.$_sentrySpans.mount).not.toBe(oldSpan);
    });

    it('should gracefully handle when "after" hook is called without "before" hook', () => {
      const mixins = createTracingMixins();

      // Call mounted hook without calling beforeMount first
      expect(() => mixins.mounted.call(mockVueInstance)).not.toThrow();
    });

    it('should skip spans when no active root span (transaction) exists', () => {
      const mixins = createTracingMixins({ trackComponents: true });

      // Remove active spans
      (getActiveSpan as any).mockReturnValue(null);
      mockRootInstance.$_sentryRootSpan = null;

      // Try to create a span
      mixins.beforeMount.call(mockVueInstance);

      // No span should be created
      expect(startInactiveSpan).not.toHaveBeenCalled();
    });
  });

  describe('Component Tracking Options', () => {
    it('should respect tracking configuration options', () => {
      // Test different tracking configurations with the same component
      const runTracingTest = (trackComponents: boolean | string[] | undefined, shouldTrack: boolean) => {
        vi.clearAllMocks();
        const mixins = createTracingMixins({ trackComponents });
        mixins.beforeMount.call(mockVueInstance);

        if (shouldTrack) {
          expect(startInactiveSpan).toHaveBeenCalled();
        } else {
          expect(startInactiveSpan).not.toHaveBeenCalled();
        }
      };

      // Test all tracking configurations
      runTracingTest(undefined, false); // Default - don't track
      runTracingTest(false, false); // Explicitly disabled
      runTracingTest(true, true); // Track all components
      runTracingTest(['TestComponent'], true); // Track by name (match)

      // Test component not in tracking list
      vi.clearAllMocks();
      const mixins = createTracingMixins({ trackComponents: ['OtherComponent'] });
      mixins.beforeMount.call(mockVueInstance); // TestComponent
      expect(startInactiveSpan).not.toHaveBeenCalled();
    });
  });
});
