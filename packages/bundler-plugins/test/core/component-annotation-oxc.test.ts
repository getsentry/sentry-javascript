import MagicString from 'magic-string';
import { parseAstAsync as rolldownParseAstAsync } from 'rolldown/parseAst';
import { describe, expect, it, vi } from 'vitest';

import { createOxcComponentNameAnnotateHooks, getOxcParseAstAsync } from '../../src/core/component-annotation-oxc';
import type { ParseAstAsync } from '../../src/core/component-annotation-oxc-ast';

async function annotate(
  code: string,
  id: string,
  ignoredComponents: string[] = [],
  injectIntoHtml = false,
): Promise<string | undefined> {
  const parsers: Array<() => Promise<ParseAstAsync | null>> = [
    getOxcParseAstAsync,
    async () => rolldownParseAstAsync as ParseAstAsync,
  ];
  const [oxcResult, rolldownResult] = await Promise.all(
    parsers.map(getParseAstAsync =>
      createOxcComponentNameAnnotateHooks(ignoredComponents, getParseAstAsync, injectIntoHtml).transform(code, id),
    ),
  );

  // Vite 8 parses with Rolldown, everything else with oxc-parser.
  expect(rolldownResult?.code).toBe(oxcResult?.code);

  return oxcResult?.code;
}

describe('createOxcComponentNameAnnotateHooks', () => {
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
  ])('annotates %s', async (_name, id, code, ignoredComponents) => {
    const result = await annotate(code, id, ignoredComponents);

    expect(result).toMatchSnapshot();
  });

  it.each(['_Foo', '$Foo', 'Ωmega'])('parses JSX identifiers that start with %s', async elementName => {
    const result = await annotate(`export const App = () => <${elementName} />;`, '/src/app.jsx');

    expect(result).toBe(
      `export const App = () => <${elementName} data-sentry-element="${elementName}" data-sentry-component="App" data-sentry-source-file="app.jsx" />;`,
    );
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
  ])('annotates HTML elements in injection mode for %s', async (_name, id, code, ignoredComponents) => {
    const result = await annotate(code, id, ignoredComponents, true);

    expect(result).toMatchSnapshot();
  });

  it('uses the native magicString object from transform metadata when it is available', async () => {
    const code = `export function App() {
  return <Custom />;
}`;
    const id = '/src/app.jsx';
    const magicString = new MagicString(code);
    const hooks = createOxcComponentNameAnnotateHooks([], getOxcParseAstAsync);

    const result = await hooks.transform(code, id, { magicString });

    expect(result?.code).toBe(magicString as unknown as string);
    expect(result?.code.toString()).toContain(`data-sentry-component="App"`);
  });

  it('returns null without loading a parser when the file cannot contain annotations', async () => {
    const getParseAstAsync = vi.fn(getOxcParseAstAsync);
    const hooks = createOxcComponentNameAnnotateHooks([], getParseAstAsync);

    await expect(hooks.transform('const value = 1;', '/src/app.js')).resolves.toBeNull();
    expect(getParseAstAsync).not.toHaveBeenCalled();
  });

  it('returns null when the parser cannot be loaded', async () => {
    const hooks = createOxcComponentNameAnnotateHooks([], async () => null);

    await expect(hooks.transform('export const App = () => <Custom />;', '/src/app.jsx')).resolves.toBeNull();
  });

  it('returns null when parsing fails', async () => {
    const hooks = createOxcComponentNameAnnotateHooks([], async () => {
      throw new Error('parser unavailable');
    });

    await expect(hooks.transform('export const App = () => <Custom />;', '/src/app.jsx')).resolves.toBeNull();
  });

  it('returns null when oxc-parser reports a syntax error', async () => {
    const hooks = createOxcComponentNameAnnotateHooks([], getOxcParseAstAsync);

    await expect(hooks.transform('export const App = () => <Custom>;', '/src/app.tsx')).resolves.toBeNull();
  });
});
