import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { hoistNonReactStatics } from '../src/hoist-non-react-statics';

describe('hoistNonReactStatics', () => {
  it('hoists custom static properties', () => {
    class Source extends React.Component {
      static customStatic = 'customValue';
      static anotherStatic = 42;
    }
    class Target extends React.Component {}

    hoistNonReactStatics(Target, Source);

    expect((Target as any).customStatic).toBe('customValue');
    expect((Target as any).anotherStatic).toBe(42);
  });

  it('does not overwrite existing properties on target', () => {
    class Source extends React.Component {
      static customStatic = 'sourceValue';
    }
    class Target extends React.Component {
      static customStatic = 'targetValue';
    }

    hoistNonReactStatics(Target, Source);

    expect((Target as any).customStatic).toBe('targetValue');
  });

  it('returns the target component', () => {
    class Source extends React.Component {}
    class Target extends React.Component {}

    const result = hoistNonReactStatics(Target, Source);

    expect(result).toBe(Target);
  });

  it('handles function components', () => {
    const Source = () => <div>Source</div>;
    (Source as any).customStatic = 'value';
    const Target = () => <div>Target</div>;

    hoistNonReactStatics(Target, Source);

    expect((Target as any).customStatic).toBe('value');
  });

  it('does not hoist known JavaScript statics', () => {
    class Source extends React.Component {
      static customStatic = 'customValue';
    }
    class Target extends React.Component {}
    const originalName = Target.name;
    const originalLength = Target.length;

    hoistNonReactStatics(Target, Source);

    expect(Target.name).toBe(originalName);
    expect(Target.length).toBe(originalLength);
    expect((Target as any).customStatic).toBe('customValue');
  });

  it('does not hoist React-specific statics', () => {
    class Source extends React.Component {
      static defaultProps = { foo: 'bar' };
      static customStatic = 'customValue';
    }
    class Target extends React.Component {
      static defaultProps = { baz: 'qux' };
    }
    const originalDefaultProps = Target.defaultProps;

    hoistNonReactStatics(Target, Source);

    expect(Target.defaultProps).toBe(originalDefaultProps);
    expect((Target as any).customStatic).toBe('customValue');
  });

  it('does not hoist displayName', () => {
    const Source = () => <div />;
    (Source as any).displayName = 'SourceComponent';
    (Source as any).customStatic = 'value';
    const Target = () => <div />;
    (Target as any).displayName = 'TargetComponent';

    hoistNonReactStatics(Target, Source);

    expect((Target as any).displayName).toBe('TargetComponent');
    expect((Target as any).customStatic).toBe('value');
  });

  it('respects custom excludelist', () => {
    class Source extends React.Component {
      static customStatic1 = 'value1';
      static customStatic2 = 'value2';
    }
    class Target extends React.Component {}

    hoistNonReactStatics(Target, Source, { customStatic1: true });

    expect((Target as any).customStatic1).toBeUndefined();
    expect((Target as any).customStatic2).toBe('value2');
  });

  it('handles ForwardRef components', () => {
    const SourceInner = (_props: any, _ref: any) => <div />;
    const Source = React.forwardRef(SourceInner);
    (Source as any).customStatic = 'value';
    const TargetInner = (_props: any, _ref: any) => <div />;
    const Target = React.forwardRef(TargetInner);
    const originalRender = (Target as any).render;

    hoistNonReactStatics(Target, Source);

    expect((Target as any).render).toBe(originalRender);
    expect((Target as any).customStatic).toBe('value');
  });

  it('handles Memo components', () => {
    const SourceComponent = () => <div />;
    const Source = React.memo(SourceComponent);
    (Source as any).customStatic = 'value';
    const TargetComponent = () => <div />;
    const Target = React.memo(TargetComponent);
    const originalType = (Target as any).type;

    hoistNonReactStatics(Target, Source);

    expect((Target as any).type).toBe(originalType);
    expect((Target as any).customStatic).toBe('value');
  });

  it('hoists symbol properties', () => {
    const customSymbol = Symbol('custom');
    class Source extends React.Component {}
    (Source as any)[customSymbol] = 'symbolValue';
    class Target extends React.Component {}

    hoistNonReactStatics(Target, Source);

    expect((Target as any)[customSymbol]).toBe('symbolValue');
  });

  it('preserves property descriptors', () => {
    class Source extends React.Component {}
    Object.defineProperty(Source, 'customStatic', {
      value: 'value',
      writable: false,
      enumerable: true,
      configurable: false,
    });
    class Target extends React.Component {}

    hoistNonReactStatics(Target, Source);

    const descriptor = Object.getOwnPropertyDescriptor(Target, 'customStatic');
    expect(descriptor?.value).toBe('value');
    expect(descriptor?.writable).toBe(false);
    expect(descriptor?.enumerable).toBe(true);
    expect(descriptor?.configurable).toBe(false);
  });

  it('handles getters and setters', () => {
    let backingValue = 'initial';
    class Source extends React.Component {}
    Object.defineProperty(Source, 'customStatic', {
      get: () => backingValue,
      set: (value: string) => {
        backingValue = value;
      },
    });
    class Target extends React.Component {}

    hoistNonReactStatics(Target, Source);

    expect((Target as any).customStatic).toBe('initial');
    (Target as any).customStatic = 'modified';
    expect((Target as any).customStatic).toBe('modified');
  });

  it('silently handles read-only property errors', () => {
    class Source extends React.Component {}
    Object.defineProperty(Source, 'customStatic', { value: 'sourceValue', writable: true });
    class Target extends React.Component {}
    Object.defineProperty(Target, 'customStatic', { value: 'targetValue', writable: false });

    expect(() => hoistNonReactStatics(Target, Source)).not.toThrow();
    expect((Target as any).customStatic).toBe('targetValue');
  });

  it('hoists statics from the prototype chain', () => {
    class GrandParent extends React.Component {
      static grandParentStatic = 'grandParent';
    }
    class Parent extends GrandParent {
      static parentStatic = 'parent';
    }
    class Source extends Parent {
      static sourceStatic = 'source';
    }
    class Target extends React.Component {}

    hoistNonReactStatics(Target, Source);

    expect((Target as any).sourceStatic).toBe('source');
    expect((Target as any).parentStatic).toBe('parent');
    expect((Target as any).grandParentStatic).toBe('grandParent');
  });

  it('does not hoist from Object.prototype', () => {
    class Source extends React.Component {
      static customStatic = 'value';
    }
    class Target extends React.Component {}

    hoistNonReactStatics(Target, Source);

    expect((Target as any).customStatic).toBe('value');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect((Target as any).hasOwnProperty).toBe(Object.prototype.hasOwnProperty);
  });

  it('handles string components', () => {
    const Target = () => <div />;
    (Target as any).existingStatic = 'value';

    hoistNonReactStatics(Target, 'div' as any);

    expect((Target as any).existingStatic).toBe('value');
  });

  it('handles falsy static values', () => {
    class Source extends React.Component {}
    (Source as any).nullStatic = null;
    (Source as any).undefinedStatic = undefined;
    (Source as any).zeroStatic = 0;
    (Source as any).falseStatic = false;
    class Target extends React.Component {}

    hoistNonReactStatics(Target, Source);

    expect((Target as any).nullStatic).toBeNull();
    expect((Target as any).undefinedStatic).toBeUndefined();
    expect((Target as any).zeroStatic).toBe(0);
    expect((Target as any).falseStatic).toBe(false);
  });

  it('works with HOC pattern', () => {
    class OriginalComponent extends React.Component {
      static customMethod() {
        return 'custom';
      }
      render() {
        return <div>Original</div>;
      }
    }
    const WrappedComponent: React.FC = () => <OriginalComponent />;

    hoistNonReactStatics(WrappedComponent, OriginalComponent);

    expect((WrappedComponent as any).customMethod()).toBe('custom');
  });

  it('preserves target displayName in HOC pattern', () => {
    const OriginalComponent = () => <div>Original</div>;
    (OriginalComponent as any).displayName = 'Original';
    (OriginalComponent as any).someStaticProp = 'value';
    const WrappedComponent: React.FC = () => <OriginalComponent />;
    (WrappedComponent as any).displayName = 'ErrorBoundary(Original)';

    hoistNonReactStatics(WrappedComponent, OriginalComponent);

    expect((WrappedComponent as any).displayName).toBe('ErrorBoundary(Original)');
    expect((WrappedComponent as any).someStaticProp).toBe('value');
  });

  it('works with multiple HOC composition', () => {
    class Original extends React.Component {
      static originalStatic = 'original';
    }
    const Hoc1 = () => <Original />;
    (Hoc1 as any).hoc1Static = 'hoc1';
    hoistNonReactStatics(Hoc1, Original);
    const Hoc2 = () => <Hoc1 />;
    hoistNonReactStatics(Hoc2, Hoc1);

    expect((Hoc2 as any).originalStatic).toBe('original');
    expect((Hoc2 as any).hoc1Static).toBe('hoc1');
  });

  it('handles Symbol.hasInstance from Function.prototype without throwing', () => {
    expect(Object.getOwnPropertySymbols(Function.prototype)).toContain(Symbol.hasInstance);

    class Source extends React.Component {
      static customStatic = 'value';
    }
    class Target extends React.Component {}

    // This should not throw "Cannot convert a Symbol value to a string"
    expect(() => hoistNonReactStatics(Target, Source)).not.toThrow();
    expect((Target as any).customStatic).toBe('value');
  });

  it('handles components with Symbol.hasInstance defined', () => {
    class Source extends React.Component {
      static customStatic = 'value';
      static [Symbol.hasInstance](instance: unknown) {
        return instance instanceof Source;
      }
    }
    class Target extends React.Component {}

    // This should not throw
    expect(() => hoistNonReactStatics(Target, Source)).not.toThrow();
    expect((Target as any).customStatic).toBe('value');
    // Symbol.hasInstance should be hoisted
    expect(typeof (Target as any)[Symbol.hasInstance]).toBe('function');
  });

  it('does not rely on String() for symbol keys (simulating minifier transformation)', () => {
    const sym = Symbol('test');
    // eslint-disable-next-line prefer-template
    expect(() => '' + (sym as any)).toThrow('Cannot convert a Symbol value to a string');

    // But accessing an object with a symbol key should NOT throw
    const obj: Record<string, boolean> = { name: true };
    expect(obj[sym as any]).toBeUndefined(); // No error, just undefined

    // Now test the actual function - it should work because it shouldn't
    // need to convert symbols to strings
    class Source extends React.Component {
      static customStatic = 'value';
    }
    // Add a symbol property that will be iterated over
    (Source as any)[Symbol.for('test.symbol')] = 'symbolValue';

    class Target extends React.Component {}

    expect(() => hoistNonReactStatics(Target, Source)).not.toThrow();
    expect((Target as any).customStatic).toBe('value');
    expect((Target as any)[Symbol.for('test.symbol')]).toBe('symbolValue');
  });

  it('works when String() throws for symbols (simulating aggressive minifier)', () => {
    const OriginalString = globalThis.String;
    globalThis.String = function (value: unknown) {
      if (typeof value === 'symbol') {
        throw new TypeError('Cannot convert a Symbol value to a string');
      }
      return OriginalString(value);
    } as StringConstructor;

    try {
      class Source extends React.Component {
        static customStatic = 'value';
      }
      (Source as any)[Symbol.for('test.symbol')] = 'symbolValue';

      class Target extends React.Component {}

      expect(() => hoistNonReactStatics(Target, Source)).not.toThrow();
      expect((Target as any).customStatic).toBe('value');
      expect((Target as any)[Symbol.for('test.symbol')]).toBe('symbolValue');
    } finally {
      globalThis.String = OriginalString;
    }
  });
});
