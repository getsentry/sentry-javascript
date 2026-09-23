import { transformAsync, traverse, types as t } from '@babel/core';
import { parse } from '@babel/parser';
import MagicString from 'magic-string';
import { describe, expect, it, vi } from 'vitest';

import componentNameAnnotatePlugin, { experimentalComponentNameAnnotatePlugin } from '../../src/babel-plugin';
import {
  createOxcComponentNameAnnotateHooks,
  getOxcParseAstAsync,
  type ComponentAnnotationTransformResult,
} from '../../src/core/component-annotation-oxc';
import type { ParseAstAsync } from '../../src/core/component-annotation-oxc-ast';

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

async function annotateWithBabel(
  code: string,
  id: string,
  ignoredComponents: string[],
  injectIntoHtml = false,
): Promise<Annotation[]> {
  const plugin = injectIntoHtml ? experimentalComponentNameAnnotatePlugin : componentNameAnnotatePlugin;
  const result = await transformAsync(code, {
    filename: id,
    configFile: false,
    babelrc: false,
    plugins: [[plugin, { ignoredComponents }]],
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

async function annotateWithOxc(
  code: string,
  id: string,
  ignoredComponents: string[] = [],
  getParseAstAsync: () => Promise<ParseAstAsync | null> = async () => parseAstAsync,
  injectIntoHtml = false,
): Promise<ComponentAnnotationTransformResult> {
  const hooks = createOxcComponentNameAnnotateHooks(ignoredComponents, getParseAstAsync, injectIntoHtml);

  return hooks.transform(code, id);
}

describe.each<[string, () => Promise<ParseAstAsync | null>]>([
  ['@babel/parser', async () => parseAstAsync],
  ['oxc-parser', getOxcParseAstAsync],
])('createOxcComponentNameAnnotateHooks with %s', (_parserName, getParseAstAsync) => {
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
    [
      'tsx files with parenthesized returns and TypeScript expressions',
      '/src/typed-parenthesized.tsx',
      `import React from "react";

type Props<T> = { items?: T[] };

export const List = <T,>(props: Props<T>) => {
  const items = props.items!;
  return (
    <Table rows={items as unknown[]}>
      <Row<T> item={items[0]} />
    </Table>
  );
};`,
      [],
    ],
  ])('matches Babel annotations for %s', async (_name, id, code, ignoredComponents) => {
    const oxcResult = await annotateWithOxc(code, id, ignoredComponents, getParseAstAsync);

    expect(oxcResult).toBeTruthy();
    expect(collectAnnotations(oxcResult?.code.toString() ?? '', id)).toEqual(
      await annotateWithBabel(code, id, ignoredComponents),
    );
  });

  it.each(['_Foo', '$Foo', 'Ωmega'])('parses JSX identifiers that start with %s', async elementName => {
    const code = `export const App = () => <${elementName} />;`;
    const id = '/src/app.jsx';

    const oxcResult = await annotateWithOxc(code, id, [], getParseAstAsync);

    expect(oxcResult).toBeTruthy();
    expect(collectAnnotations(oxcResult?.code.toString() ?? '', id)).toEqual([
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

  it.each([
    [
      'HTML roots',
      '/src/html-root.jsx',
      `export default function App() {
  return (
    <div>
      <span>nested html</span>
      <CustomCard />
    </div>
  );
}`,
      [],
    ],
    [
      'component wrappers',
      '/src/wrappers.jsx',
      `const Page = () => (
  <Layout.Root>
    <Layout.Body>
      <main>content</main>
      <aside />
    </Layout.Body>
  </Layout.Root>
);

export default Page;`,
      [],
    ],
    [
      'fragment roots and aliases',
      '/src/fragments.jsx',
      `import React, { Fragment as ImportedFragment } from "react";

export function FragmentComponent() {
  return (
    <>
      <ImportedFragment>
        <section />
      </ImportedFragment>
      <React.Fragment>
        <p />
      </React.Fragment>
    </>
  );
}`,
      [],
    ],
    [
      'conditional returns',
      '/src/conditional.jsx',
      `export function ConditionalComponent({ maybeTrue }) {
  return maybeTrue ? <div /> : <Wrapper><span /></Wrapper>;
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
      return <em />;
    };

    return <section>{Helper()}</section>;
  }
}`,
      [],
    ],
    [
      'anonymous default classes',
      '/src/anonymous-class.jsx',
      `import React from "react";

export default class extends React.Component {
  render() {
    return <div />;
  }
}`,
      [],
    ],
    [
      'ignored component and element names',
      '/src/ignored.jsx',
      `export function IgnoredComponent() {
  return <div />;
}

export function Navigation() {
  return (
    <Wrapper>
      <nav>
        <a />
      </nav>
    </Wrapper>
  );
}

export function Header() {
  return <header />;
}`,
      ['IgnoredComponent', 'nav'],
    ],
    [
      'existing component attributes',
      '/src/existing.jsx',
      `export function Existing() {
  return <div data-sentry-component="Custom" />;
}

export function Fresh() {
  return <div />;
}`,
      [],
    ],
    [
      'lowercase member expressions and identifiers',
      '/src/lowercase.jsx',
      `export const Motion = () => (
  <motion.div>
    <span />
  </motion.div>
);

export const Underscore = () => <_foo />;

export const Dollar = () => <$Foo />;`,
      [],
    ],
    [
      'React Native elements',
      '/src/native.jsx',
      `export const Native = () => (
  <View>
    <Text>hello</Text>
  </View>
);

export const Card = () => (
  <CardContainer>
    <Image />
  </CardContainer>
);`,
      [],
    ],
    [
      'tsx files with TypeScript expressions',
      '/src/typed.tsx',
      `type Props<T> = { items?: T[] };

export const List = <T,>(props: Props<T>) => {
  const items = props.items!;
  return (
    <Table<T> rows={items as unknown[]}>
      <tr />
    </Table>
  );
};`,
      [],
    ],
  ])('matches Babel HTML injection annotations for %s', async (_name, id, code, ignoredComponents) => {
    const oxcResult = await annotateWithOxc(code, id, ignoredComponents, getParseAstAsync, true);

    expect(oxcResult).toBeTruthy();
    expect(collectAnnotations(oxcResult?.code.toString() ?? '', id)).toEqual(
      await annotateWithBabel(code, id, ignoredComponents, true),
    );
  });
});

describe('createOxcComponentNameAnnotateHooks', () => {
  it('uses the native magicString object from transform metadata when it is available', async () => {
    const code = `export function App() {
  return <Custom />;
}`;
    const id = '/src/app.jsx';
    const magicString = new MagicString(code);
    const hooks = createOxcComponentNameAnnotateHooks([], async () => parseAstAsync);

    const result = await hooks.transform(code, id, { magicString });

    expect(result?.code).toBe(magicString as unknown as string);
    expect(result?.code.toString()).toContain(`data-sentry-component="App"`);
  });

  it('returns null without parsing when the file cannot contain annotations', async () => {
    const parse = vi.fn(parseAstAsync);
    const hooks = createOxcComponentNameAnnotateHooks([], async () => parse);

    await expect(hooks.transform('const value = 1;', '/src/app.js')).resolves.toBeNull();
    expect(parse).not.toHaveBeenCalled();
  });

  it('returns undefined when parsing fails so callers can fall back to Babel', async () => {
    const hooks = createOxcComponentNameAnnotateHooks([], async () => {
      throw new Error('parser unavailable');
    });

    await expect(hooks.transform('export const App = () => <Custom />;', '/src/app.jsx')).resolves.toBeUndefined();
  });

  it('returns undefined when oxc-parser reports a syntax error so callers can fall back to Babel', async () => {
    const hooks = createOxcComponentNameAnnotateHooks([], getOxcParseAstAsync);

    await expect(hooks.transform('export const App = () => <Custom>;', '/src/app.tsx')).resolves.toBeUndefined();
  });
});
