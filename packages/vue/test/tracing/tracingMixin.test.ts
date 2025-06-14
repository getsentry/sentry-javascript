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

const mockSpanFactory = (): { name?: string; op?: string; end: Mock } => ({
  name: undefined,
  op: undefined,
  end: vi.fn(),
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
      $_sentryComponentSpans: {},
    };
    mockRootInstance.$root = mockRootInstance; // Self-reference for root

    mockVueInstance = {
      $root: mockRootInstance,
      componentName: 'TestComponent',
      $_sentryComponentSpans: {},
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
    it('should always create a root component span for the Vue root component regardless of tracking options', () => {
      const mixins = createTracingMixins({ trackComponents: false });

      mixins.beforeMount.call(mockRootInstance);

      expect(startInactiveSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Application Render',
          op: 'ui.vue.render',
        }),
      );
    });

    it.each([true, false])(
      'should finish root component span on timer after component spans end, if trackComponents is %s',
      trackComponents => {
        const mixins = createTracingMixins({ trackComponents, timeout: 1000 });
        const rootMockSpan = mockSpanFactory();
        mockRootInstance.$_sentryRootComponentSpan = rootMockSpan;

        // Create and finish a component span
        mixins.beforeMount.call(mockVueInstance);
        mixins.mounted.call(mockVueInstance);

        // Root component span should not end immediately
        expect(rootMockSpan.end).not.toHaveBeenCalled();

        // After timeout, root component span should end
        vi.advanceTimersByTime(1001);
        expect(rootMockSpan.end).toHaveBeenCalled();
      },
    );
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
      expect(mockVueInstance.$_sentryComponentSpans.mount).toBeDefined();

      // 2. Get the span for verification
      const componentSpan = mockVueInstance.$_sentryComponentSpans.mount;

      // 3. End span in "after" hook
      mixins.mounted.call(mockVueInstance);
      expect(componentSpan.end).toHaveBeenCalled();
    });

    it('should clean up existing spans when creating new ones', () => {
      const mixins = createTracingMixins({ trackComponents: true });

      // Create an existing span first
      const oldSpan = mockSpanFactory();
      mockVueInstance.$_sentryComponentSpans.mount = oldSpan;

      // Create a new span for the same operation
      mixins.beforeMount.call(mockVueInstance);

      // Verify old span was ended and new span was created
      expect(oldSpan.end).toHaveBeenCalled();
      expect(mockVueInstance.$_sentryComponentSpans.mount).not.toBe(oldSpan);
    });

    it('should gracefully handle when "after" hook is called without "before" hook', () => {
      const mixins = createTracingMixins();

      // Call mounted hook without calling beforeMount first
      expect(() => mixins.mounted.call(mockVueInstance)).not.toThrow();
    });

    it('should skip spans when no active root component span (transaction) exists', () => {
      const mixins = createTracingMixins({ trackComponents: true });

      // Remove active spans
      (getActiveSpan as any).mockReturnValue(null);
      mockRootInstance.$_sentryRootComponentSpan = null;

      // Try to create a span
      mixins.beforeMount.call(mockVueInstance);

      // No span should be created
      expect(startInactiveSpan).not.toHaveBeenCalled();
    });
  });

  describe('Component Tracking Options', () => {
    it.each([
      { trackComponents: undefined, expected: false, description: 'defaults to not tracking components' },
      { trackComponents: false, expected: false, description: 'does not track when explicitly disabled' },
    ])('$description', ({ trackComponents }) => {
      const mixins = createTracingMixins({ trackComponents });
      mixins.beforeMount.call(mockVueInstance);
      expect(startInactiveSpan).not.toHaveBeenCalled();
    });

    it.each([
      { trackComponents: true, description: 'tracks all components when enabled' },
      { trackComponents: ['TestComponent'], description: 'tracks components that match the name list' },
    ])('$description', ({ trackComponents }) => {
      const mixins = createTracingMixins({ trackComponents });
      mixins.beforeMount.call(mockVueInstance);
      expect(startInactiveSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Vue TestComponent',
          op: 'ui.vue.mount',
        }),
      );
    });

    it('does not track components not in the tracking list', () => {
      const mixins = createTracingMixins({ trackComponents: ['OtherComponent'] });
      mixins.beforeMount.call(mockVueInstance); // TestComponent
      expect(startInactiveSpan).not.toHaveBeenCalled();
    });
  });
});
