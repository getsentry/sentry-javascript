import { transformAsync, traverse, types as t } from '@babel/core';
import { parse } from '@babel/parser';
import MagicString from 'magic-string';
import { describe, expect, it, vi } from 'vitest';

import componentNameAnnotatePlugin from '../../src/babel-plugin';
import {
  createViteComponentNameAnnotateHooks,
  type ComponentAnnotationTransformResult,
} from '../../src/core/component-annotation-vite';

type Annotation = {
  elementName: string;
  attributes: Record<string, string>;
};

const SENTRY_ATTRIBUTES = new Set(['data-sentry-component', 'data-sentry-element', 'data-sentry-source-file']);

async function parseAstAsync(code: string, options: { lang: 'jsx' | 'tsx' }): Promise<unknown> {
  return parse(code, {
    sourceType: 'module',
    plugins: options.lang === 'tsx' ? ['jsx', 'typescript'] : ['jsx'],
  });
}

function collectAnnotations(code: string, id: string): Annotation[] {
  const ast = parse(code, {
    sourceType: 'module',
    plugins: id.endsWith('.tsx') ? ['jsx', 'typescript'] : ['jsx'],
  });
  const annotations: Annotation[] = [];

  traverse(ast, {
    JSXOpeningElement(path) {
      const attributes: Record<string, string> = {};

      for (const attribute of path.node.attributes) {
        if (
          !t.isJSXAttribute(attribute) ||
          !t.isJSXIdentifier(attribute.name) ||
          !SENTRY_ATTRIBUTES.has(attribute.name.name) ||
          !t.isStringLiteral(attribute.value)
        ) {
          continue;
        }

        attributes[attribute.name.name] = attribute.value.value;
      }

      if (Object.keys(attributes).length > 0) {
        annotations.push({
          elementName: path.get('name').toString(),
          attributes,
        });
      }
    },
  });

  return annotations;
}

async function annotateWithBabel(code: string, id: string, ignoredComponents: string[]): Promise<Annotation[]> {
  const result = await transformAsync(code, {
    filename: id,
    configFile: false,
    babelrc: false,
    plugins: [[componentNameAnnotatePlugin, { ignoredComponents }]],
    parserOpts: {
      sourceType: 'module',
      allowAwaitOutsideFunction: true,
      plugins: id.endsWith('.tsx') ? ['jsx', 'typescript'] : ['jsx'],
    },
    generatorOpts: {
      decoratorsBeforeExport: true,
    },
  });

  expect(result?.code).toBeDefined();

  return collectAnnotations(result?.code ?? '', id);
}

async function annotateWithVite(
  code: string,
  id: string,
  ignoredComponents: string[] = [],
): Promise<ComponentAnnotationTransformResult> {
  const hooks = createViteComponentNameAnnotateHooks(ignoredComponents, async () => parseAstAsync);

  return hooks.transform(code, id);
}

describe('createViteComponentNameAnnotateHooks', () => {
  it.each([
    [
      'function declarations and nested children',
      '/src/app.jsx',
      `import React from "react";

export default function App() {
  return (
    <section>
      <CustomCard />
      <span>ignored dom element</span>
    </section>
  );
}`,
      [],
    ],
    [
      'arrow function expression bodies',
      '/src/arrow.jsx',
      `import React from "react";

const ArrowComponent = () => (
  <Panel.Root>
    <Panel.Body />
  </Panel.Root>
);

export default ArrowComponent;`,
      [],
    ],
    [
      'class render methods',
      '/src/class-component.jsx',
      `import React, { Component } from "react";

export class ClassComponent extends Component {
  render() {
    return (
      <Layout>
        <Layout.Header />
      </Layout>
    );
  }
}`,
      [],
    ],
    [
      'class render methods with nested render helpers',
      '/src/class-nested-helper.jsx',
      `import React, { Component } from "react";

export class ClassComponent extends Component {
  render() {
    const Helper = () => {
      return <Nested />;
    };

    return <Wrapper>{Helper()}</Wrapper>;
  }
}`,
      [],
    ],
    [
      'anonymous default class render methods',
      '/src/anonymous-class.jsx',
      `import React from "react";

export default class extends React.Component {
  render() {
    return <Foo />;
  }
}`,
      [],
    ],
    [
      'anonymous class render methods with nested render helpers',
      '/src/anonymous-class-nested-helper.jsx',
      `import React from "react";

export default class extends React.Component {
  render() {
    const Helper = () => {
      return <Nested />;
    };

    return <Wrapper>{Helper()}</Wrapper>;
  }
}`,
      [],
    ],
    [
      'conditional returns',
      '/src/conditional.jsx',
      `import React from "react";

const maybeTrue = Math.random() > 0.5;

export default function ConditionalComponent() {
  return maybeTrue ? <First /> : <Second />;
}`,
      [],
    ],
    [
      'fragment aliases',
      '/src/fragments.jsx',
      `import React, { Fragment as ImportedFragment } from "react";
import * as ReactNamespace from "react";

const { Fragment: DestructuredFragment } = React;
const AssignedFragment = ImportedFragment;

export default function FragmentComponent() {
  return (
    <div>
      <ImportedFragment>
        <span>import alias</span>
      </ImportedFragment>
      <ReactNamespace.Fragment>
        <span>namespace alias</span>
      </ReactNamespace.Fragment>
      <DestructuredFragment>
        <span>destructured alias</span>
      </DestructuredFragment>
      <AssignedFragment>
        <span>assigned alias</span>
      </AssignedFragment>
    </div>
  );
}`,
      [],
    ],
    [
      'ignored component names and member expressions',
      '/src/ignored.jsx',
      `import React from "react";
import { Tab } from "@headlessui/react";
import { Components } from "my-ui-library";

export default function IgnoredComponent() {
  return (
    <div>
      <Tab.Group>
        <Tab.List />
      </Tab.Group>
      <Components.UI.Button />
      <Components.UI.Card.Header />
    </div>
  );
}`,
      ['Tab.Group', 'Tab.List', 'Components.UI.Button'],
    ],
    [
      'tsx files',
      '/src/typed.tsx',
      `import React from "react";

type Props = { title: string };

export function TypedComponent(props: Props) {
  return <Title text={props.title} />;
}`,
      [],
    ],
  ])('matches Babel annotations for %s', async (_name, id, code, ignoredComponents) => {
    const viteResult = await annotateWithVite(code, id, ignoredComponents);

    expect(viteResult).toBeTruthy();
    expect(collectAnnotations(viteResult?.code.toString() ?? '', id)).toEqual(
      await annotateWithBabel(code, id, ignoredComponents),
    );
  });

  it.each(['_Foo', '$Foo', 'Ωmega'])('parses JSX identifiers that start with %s', async elementName => {
    const code = `export const App = () => <${elementName} />;`;
    const id = '/src/app.jsx';

    const viteResult = await annotateWithVite(code, id);

    expect(viteResult).toBeTruthy();
    expect(collectAnnotations(viteResult?.code.toString() ?? '', id)).toEqual([
      {
        elementName,
        attributes: {
          'data-sentry-component': 'App',
          'data-sentry-element': elementName,
          'data-sentry-source-file': 'app.jsx',
        },
      },
    ]);
  });

  it('uses the native magicString object from transform metadata when it is available', async () => {
    const code = `export function App() {
  return <Custom />;
}`;
    const id = '/src/app.jsx';
    const magicString = new MagicString(code);
    const hooks = createViteComponentNameAnnotateHooks([], async () => parseAstAsync);

    const result = await hooks.transform(code, id, { magicString });

    expect(result?.code).toBe(magicString as unknown as string);
    expect(result?.code.toString()).toContain(`data-sentry-component="App"`);
  });

  it('returns null without parsing when the file cannot contain public Vite annotations', async () => {
    const parse = vi.fn(parseAstAsync);
    const hooks = createViteComponentNameAnnotateHooks([], async () => parse);

    await expect(hooks.transform('const value = 1;', '/src/app.js')).resolves.toBeNull();
    expect(parse).not.toHaveBeenCalled();
  });

  it('returns undefined when parsing fails so callers can fall back to Babel', async () => {
    const hooks = createViteComponentNameAnnotateHooks([], async () => {
      throw new Error('parser unavailable');
    });

    await expect(hooks.transform('export const App = () => <Custom />;', '/src/app.jsx')).resolves.toBeUndefined();
  });
});
