/* oxlint-disable max-lines */
/**
 * MIT License
 *
 * Copyright (c) 2020 Engineering at FullStory
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
 *
 */

/**
 * The following code is based on the FullStory Babel plugin, but has been modified to work
 * with Sentry products:
 *
 * - Added `sentry` to data properties, i.e `data-sentry-component`
 * - Converted to TypeScript
 * - Code cleanups
 */

import type * as Babel from '@babel/core';
import type { PluginObj, PluginPass } from '@babel/core';

import { DEFAULT_IGNORED_ELEMENTS, KNOWN_INCOMPATIBLE_PLUGINS } from './constants';

const webComponentName = 'data-sentry-component';
const webElementName = 'data-sentry-element';
const webSourceFileName = 'data-sentry-source-file';

const nativeComponentName = 'dataSentryComponent';
const nativeElementName = 'dataSentryElement';
const nativeSourceFileName = 'dataSentrySourceFile';

const SENTRY_LABEL_ATTRIBUTE = 'sentry-label';
const MAX_LABEL_LENGTH = 64;
const DEFAULT_TEXT_COMPONENT_NAMES = ['Text', 'text'];
const MAX_TEXT_SEARCH_DEPTH = 3;

interface AutoInjectSentryLabelOpts {
  textComponentNames?: string[];
}

interface AnnotationOpts {
  native?: boolean;
  'annotate-fragments'?: boolean;
  ignoredComponents?: string[];
  /** @hidden */
  autoInjectSentryLabel?: boolean | AutoInjectSentryLabelOpts;
}

interface FragmentContext {
  fragmentAliases: Set<string>;
  reactNamespaceAliases: Set<string>;
}

interface AnnotationPluginPass extends PluginPass {
  opts: AnnotationOpts;
  sentryFragmentContext?: FragmentContext;
}

type AnnotationPlugin = PluginObj<AnnotationPluginPass>;

// Shared context object for all JSX processing functions
interface JSXProcessingContext {
  /** Whether to annotate React fragments */
  annotateFragments: boolean;
  /** Babel types object */
  t: typeof Babel.types;
  /** Name of the React component */
  componentName: string;
  /** Source file name (optional) */
  sourceFileName?: string;
  /** Array of attribute names [component, element, sourceFile] */
  attributeNames: string[];
  /** Array of component names to ignore */
  ignoredComponents: string[];
  /** Fragment context for identifying React fragments */
  fragmentContext?: FragmentContext;
  /** Whether to auto-inject sentry-label from static text children */
  autoInjectSentryLabel: boolean;
  /** Component names whose JSXText children are considered text content */
  textComponentNames: string[];
}

export { experimentalComponentNameAnnotatePlugin } from './experimental';

// We must export the plugin as default, otherwise the Babel loader will not be able to resolve it when configured using its string identifier
export default function componentNameAnnotatePlugin({ types: t }: typeof Babel): AnnotationPlugin {
  return {
    visitor: {
      Program: {
        enter(path, state) {
          const fragmentContext = collectFragmentContext(path);
          state.sentryFragmentContext = fragmentContext;
        },
      },
      FunctionDeclaration(path, state) {
        if (!path.node.id?.name) {
          return;
        }
        if (isKnownIncompatiblePluginFromState(state)) {
          return;
        }

        const context = createJSXProcessingContext(state, t, path.node.id.name);
        functionBodyPushAttributes(context, path);
      },
      ArrowFunctionExpression(path, state) {
        // We're expecting a `VariableDeclarator` like `const MyComponent =`
        const parent = path.parent;

        if (!parent || !('id' in parent) || !parent.id || !('name' in parent.id) || !parent.id.name) {
          return;
        }

        if (isKnownIncompatiblePluginFromState(state)) {
          return;
        }

        const context = createJSXProcessingContext(state, t, parent.id.name);
        functionBodyPushAttributes(context, path);
      },
      ClassDeclaration(path, state) {
        const name = path.get('id');
        const properties = path.get('body').get('body');
        const render = properties.find(prop => {
          return prop.isClassMethod() && prop.get('key').isIdentifier({ name: 'render' });
        });

        if (!render?.traverse || isKnownIncompatiblePluginFromState(state)) {
          return;
        }

        const context = createJSXProcessingContext(state, t, name.node?.name || '');

        render.traverse({
          ReturnStatement(returnStatement) {
            const arg = returnStatement.get('argument');

            if (!arg.isJSXElement() && !arg.isJSXFragment()) {
              return;
            }

            processJSX(context, arg);
          },
        });
      },
    },
  };
}

/**
 * Creates a JSX processing context from the plugin state
 */
function createJSXProcessingContext(
  state: AnnotationPluginPass,
  t: typeof Babel.types,
  componentName: string,
): JSXProcessingContext {
  return {
    annotateFragments: state.opts['annotate-fragments'] === true,
    t,
    componentName,
    sourceFileName: sourceFileNameFromState(state),
    attributeNames: attributeNamesFromState(state),
    ignoredComponents: state.opts.ignoredComponents ?? [],
    fragmentContext: state.sentryFragmentContext,
    autoInjectSentryLabel: !!state.opts.autoInjectSentryLabel,
    textComponentNames:
      (state.opts.autoInjectSentryLabel && typeof state.opts.autoInjectSentryLabel === 'object'
        ? state.opts.autoInjectSentryLabel.textComponentNames
        : undefined) ?? DEFAULT_TEXT_COMPONENT_NAMES,
  };
}

/**
 * Processes the body of a function to add Sentry tracking attributes to JSX elements.
 * Handles various function body structures including direct JSX returns, conditional expressions,
 * and nested JSX elements.
 */
function functionBodyPushAttributes(context: JSXProcessingContext, path: Babel.NodePath<Babel.types.Function>): void {
  let jsxNode: Babel.NodePath;

  const functionBody = path.get('body').get('body');

  if (
    !('length' in functionBody) &&
    functionBody.parent &&
    (functionBody.parent.type === 'JSXElement' || functionBody.parent.type === 'JSXFragment')
  ) {
    const maybeJsxNode = functionBody.find(c => {
      return c.type === 'JSXElement' || c.type === 'JSXFragment';
    });

    if (!maybeJsxNode) {
      return;
    }

    jsxNode = maybeJsxNode;
  } else {
    const returnStatement = functionBody.find(c => {
      return c.type === 'ReturnStatement';
    });
    if (!returnStatement) {
      return;
    }

    const arg = returnStatement.get('argument');
    if (!arg) {
      return;
    }

    if (Array.isArray(arg)) {
      return;
    }

    // Handle the case of a function body returning a ternary operation.
    // `return (maybeTrue ? '' : (<SubComponent />))`
    if (arg.isConditionalExpression()) {
      const consequent = arg.get('consequent');
      if (consequent.isJSXFragment() || consequent.isJSXElement()) {
        processJSX(context, consequent);
      }
      const alternate = arg.get('alternate');
      if (alternate.isJSXFragment() || alternate.isJSXElement()) {
        processJSX(context, alternate);
      }
      return;
    }

    if (!arg.isJSXFragment() && !arg.isJSXElement()) {
      return;
    }

    jsxNode = arg;
  }

  if (!jsxNode) {
    return;
  }

  processJSX(context, jsxNode);
}

/**
 * Recursively processes JSX elements to add Sentry tracking attributes.
 * Handles both JSX elements and fragments, applying appropriate attributes
 * based on configuration and component context.
 */
function processJSX(context: JSXProcessingContext, jsxNode: Babel.NodePath, componentName?: string): void {
  if (!jsxNode) {
    return;
  }

  // Use provided componentName or fall back to context componentName
  const currentComponentName = componentName ?? context.componentName;
  const isRootElement = componentName === undefined;

  // NOTE: I don't know of a case where `openingElement` would have more than one item,
  // but it's safer to always iterate
  const paths = jsxNode.get('openingElement');
  const openingElements = Array.isArray(paths) ? paths : [paths];

  openingElements.forEach(openingElement => {
    applyAttributes(context, openingElement as Babel.NodePath<Babel.types.JSXOpeningElement>, currentComponentName);
  });

  let children = jsxNode.get('children');
  // TODO: See why `Array.isArray` doesn't have correct behaviour here
  if (children && !('length' in children)) {
    // A single child was found, maybe a bit of static text
    children = [children];
  }

  let shouldSetComponentName = context.annotateFragments;

  children.forEach(child => {
    // Happens for some node types like plain text
    if (!child.node) {
      return;
    }

    // Children don't receive the data-component attribute so we pass null for componentName unless it's the first child of a Fragment with a node and `annotateFragments` is true
    const openingElement = child.get('openingElement');
    // TODO: Improve this. We never expect to have multiple opening elements
    // but if it's possible, this should work
    if (Array.isArray(openingElement)) {
      return;
    }

    if (shouldSetComponentName && openingElement?.node) {
      shouldSetComponentName = false;
      processJSX(context, child, currentComponentName);
    } else {
      processJSX(context, child, '');
    }
  });

  if (isRootElement && context.autoInjectSentryLabel) {
    maybeInjectSentryLabel(context, jsxNode);
  }
}

/**
 * Applies Sentry tracking attributes to a JSX opening element.
 * Adds component name, element name, and source file attributes while
 * respecting ignore lists and fragment detection.
 */
function applyAttributes(
  context: JSXProcessingContext,
  openingElement: Babel.NodePath<Babel.types.JSXOpeningElement>,
  componentName: string,
): void {
  const { t, attributeNames, ignoredComponents, fragmentContext, sourceFileName } = context;
  const [componentAttributeName, elementAttributeName, sourceFileAttributeName] = attributeNames;

  // e.g., Raw JSX text like the `A` in `<h1>a</h1>`
  if (!openingElement.node) {
    return;
  }

  // Check if this is a React fragment - if so, skip attribute addition entirely
  const isFragment = isReactFragment(t, openingElement, fragmentContext);
  if (isFragment) {
    return;
  }

  if (!openingElement.node.attributes) openingElement.node.attributes = [];
  const elementName = getPathName(t, openingElement);

  const isAnIgnoredComponent = ignoredComponents.some(
    ignoredComponent => ignoredComponent === componentName || ignoredComponent === elementName,
  );

  // Add a stable attribute for the element name but only for non-DOM names
  let isAnIgnoredElement = false;
  if (!isAnIgnoredComponent && !hasAttributeWithName(openingElement, elementAttributeName)) {
    if (DEFAULT_IGNORED_ELEMENTS.includes(elementName)) {
      isAnIgnoredElement = true;
    } else {
      // Always add element attribute for non-ignored elements
      if (elementAttributeName) {
        openingElement.node.attributes.push(
          t.jSXAttribute(t.jSXIdentifier(elementAttributeName), t.stringLiteral(elementName)),
        );
      }
    }
  }

  // Add a stable attribute for the component name (absent for non-root elements)
  if (componentName && !isAnIgnoredComponent && !hasAttributeWithName(openingElement, componentAttributeName)) {
    if (componentAttributeName) {
      openingElement.node.attributes.push(
        t.jSXAttribute(t.jSXIdentifier(componentAttributeName), t.stringLiteral(componentName)),
      );
    }
  }

  // Add a stable attribute for the source file name
  // Updated condition: add source file for elements that have either:
  // 1. A component name (root elements), OR
  // 2. An element name that's not ignored (child elements)
  if (
    sourceFileName &&
    !isAnIgnoredComponent &&
    (componentName || !isAnIgnoredElement) &&
    !hasAttributeWithName(openingElement, sourceFileAttributeName)
  ) {
    if (sourceFileAttributeName) {
      openingElement.node.attributes.push(
        t.jSXAttribute(t.jSXIdentifier(sourceFileAttributeName), t.stringLiteral(sourceFileName)),
      );
    }
  }
}

function sourceFileNameFromState(state: AnnotationPluginPass): string | undefined {
  const name = fullSourceFileNameFromState(state);
  if (!name) {
    return undefined;
  }

  if (name.indexOf('/') !== -1) {
    return name.split('/').pop();
  } else if (name.indexOf('\\') !== -1) {
    return name.split('\\').pop();
  } else {
    return name;
  }
}

function fullSourceFileNameFromState(state: AnnotationPluginPass): string | null {
  // @ts-expect-error This type is incorrect in Babel, `sourceFileName` is the correct type
  const name = state.file.opts.parserOpts?.sourceFileName as unknown;

  if (typeof name === 'string') {
    return name;
  }

  return null;
}

function isKnownIncompatiblePluginFromState(state: AnnotationPluginPass): boolean {
  const fullSourceFileName = fullSourceFileNameFromState(state);

  if (!fullSourceFileName) {
    return false;
  }

  return KNOWN_INCOMPATIBLE_PLUGINS.some(pluginName => {
    if (
      fullSourceFileName.includes(`/node_modules/${pluginName}/`) ||
      fullSourceFileName.includes(`\\node_modules\\${pluginName}\\`)
    ) {
      return true;
    }

    return false;
  });
}

function attributeNamesFromState(state: AnnotationPluginPass): [string, string, string] {
  if (state.opts.native) {
    return [nativeComponentName, nativeElementName, nativeSourceFileName];
  }

  return [webComponentName, webElementName, webSourceFileName];
}

function collectFragmentContext(programPath: Babel.NodePath): FragmentContext {
  const fragmentAliases = new Set<string>();
  const reactNamespaceAliases = new Set<string>(['React']); // Default React namespace

  programPath.traverse({
    ImportDeclaration(importPath) {
      const source = importPath.node.source.value;

      // Handle React imports
      if (source === 'react' || source === 'React') {
        importPath.node.specifiers.forEach(spec => {
          if (spec.type === 'ImportSpecifier' && spec.imported.type === 'Identifier') {
            // Detect aliased React.Fragment imports (e.g., `Fragment as F`)
            // so we can later identify <F> as a fragment in JSX.
            if (spec.imported.name === 'Fragment') {
              fragmentAliases.add(spec.local.name);
            }
          } else if (spec.type === 'ImportDefaultSpecifier' || spec.type === 'ImportNamespaceSpecifier') {
            // import React from 'react' -> React OR
            // import * as React from 'react' -> React
            reactNamespaceAliases.add(spec.local.name);
          }
        });
      }
    },

    // Handle simple variable assignments only (avoid complex cases)
    VariableDeclarator(varPath) {
      if (varPath.node.init) {
        const init = varPath.node.init;

        // Handle identifier assignments: const MyFragment = Fragment
        if (varPath.node.id.type === 'Identifier') {
          // Handle: const MyFragment = Fragment (only if Fragment is a known alias)
          if (init.type === 'Identifier' && fragmentAliases.has(init.name)) {
            fragmentAliases.add(varPath.node.id.name);
          }

          // Handle: const MyFragment = React.Fragment (only for known React namespaces)
          if (
            init.type === 'MemberExpression' &&
            init.object.type === 'Identifier' &&
            init.property.type === 'Identifier' &&
            init.property.name === 'Fragment' &&
            reactNamespaceAliases.has(init.object.name)
          ) {
            fragmentAliases.add(varPath.node.id.name);
          }
        }

        // Handle destructuring assignments: const { Fragment } = React
        if (varPath.node.id.type === 'ObjectPattern') {
          if (init.type === 'Identifier' && reactNamespaceAliases.has(init.name)) {
            const properties = varPath.node.id.properties;

            for (const prop of properties) {
              if (
                prop.type === 'ObjectProperty' &&
                prop.key?.type === 'Identifier' &&
                prop.value?.type === 'Identifier' &&
                prop.key.name === 'Fragment'
              ) {
                fragmentAliases.add(prop.value.name);
              }
            }
          }
        }
      }
    },
  });

  return { fragmentAliases, reactNamespaceAliases };
}

function isReactFragment(
  t: typeof Babel.types,
  openingElement: Babel.NodePath,
  context?: FragmentContext, // Add this optional parameter
): boolean {
  // Handle JSX fragments (<>)
  if (openingElement.isJSXFragment()) {
    return true;
  }

  const elementName = getPathName(t, openingElement);

  // Direct fragment references
  if (elementName === 'Fragment' || elementName === 'React.Fragment') {
    return true;
  }

  // TODO: All these objects are typed as unknown, maybe an oversight in Babel types?

  // Check if the element name is a known fragment alias
  if (context && elementName && context.fragmentAliases.has(elementName)) {
    return true;
  }

  // Handle JSXMemberExpression
  if (
    openingElement.node &&
    'name' in openingElement.node &&
    openingElement.node.name &&
    typeof openingElement.node.name === 'object' &&
    'type' in openingElement.node.name &&
    openingElement.node.name.type === 'JSXMemberExpression'
  ) {
    const nodeName = openingElement.node.name;
    if (typeof nodeName !== 'object' || !nodeName) {
      return false;
    }

    if ('object' in nodeName && 'property' in nodeName) {
      const nodeNameObject = nodeName.object;
      const nodeNameProperty = nodeName.property;

      if (typeof nodeNameObject !== 'object' || typeof nodeNameProperty !== 'object') {
        return false;
      }

      if (!nodeNameObject || !nodeNameProperty) {
        return false;
      }

      const objectName = 'name' in nodeNameObject && nodeNameObject.name;
      const propertyName = 'name' in nodeNameProperty && nodeNameProperty.name;

      // React.Fragment check
      if (objectName === 'React' && propertyName === 'Fragment') {
        return true;
      }

      // Enhanced checks using context
      if (context) {
        // Check React.Fragment pattern with known React namespaces
        if (context.reactNamespaceAliases.has(objectName as string) && propertyName === 'Fragment') {
          return true;
        }

        // Check MyFragment.Fragment pattern
        if (context.fragmentAliases.has(objectName as string) && propertyName === 'Fragment') {
          return true;
        }
      }
    }
  }

  return false;
}

function hasAttributeWithName(
  openingElement: Babel.NodePath<Babel.types.JSXOpeningElement>,
  name: string | undefined | null,
): boolean {
  if (!name) {
    return false;
  }

  return openingElement.node.attributes.some(node => {
    if (node.type === 'JSXAttribute') {
      return node.name.name === name;
    }

    return false;
  });
}

function getPathName(t: typeof Babel.types, path: Babel.NodePath): string {
  if (!path.node) return UNKNOWN_ELEMENT_NAME;
  if (!('name' in path.node)) {
    return UNKNOWN_ELEMENT_NAME;
  }

  const name = path.node.name;

  if (typeof name === 'string') {
    return name;
  }

  if (t.isIdentifier(name) || t.isJSXIdentifier(name)) {
    return name.name;
  }

  if (t.isJSXNamespacedName(name)) {
    return name.name.name;
  }

  // Handle JSX member expressions like Tab.Group
  if (t.isJSXMemberExpression(name)) {
    const objectName = getJSXMemberExpressionObjectName(t, name.object);
    const propertyName = name.property.name;
    return `${objectName}.${propertyName}`;
  }

  return UNKNOWN_ELEMENT_NAME;
}

// Recursively handle nested member expressions (e.g. Components.UI.Header)
function getJSXMemberExpressionObjectName(
  t: typeof Babel.types,
  object: Babel.types.JSXMemberExpression | Babel.types.JSXIdentifier,
): string {
  if (t.isJSXIdentifier(object)) {
    return object.name;
  }
  if (t.isJSXMemberExpression(object)) {
    const objectName = getJSXMemberExpressionObjectName(t, object.object);
    return `${objectName}.${object.property.name}`;
  }

  return UNKNOWN_ELEMENT_NAME;
}

/**
 * Extracts static text content from JSX children, searching up to a depth limit.
 * Collects text from JSXText nodes of the root element and from recognized
 * text components (e.g. <Text>). Non-text custom components are traversed
 * but their own JSXText is not collected.
 *
 * Returns null when dynamic content is found anywhere in the subtree,
 * signaling that the entire label should be skipped.
 */
function extractStaticTextFromChildren(
  t: typeof Babel.types,
  node: Babel.types.JSXElement | Babel.types.JSXFragment,
  textComponentNames: string[],
  depth: number,
  isRoot: boolean,
): string[] | null {
  if (depth <= 0) {
    return [];
  }

  const texts: string[] = [];

  for (const child of node.children) {
    if (t.isJSXText(child)) {
      if (isRoot) {
        const trimmed = child.value.replace(/\s+/g, ' ').trim();
        if (trimmed) {
          texts.push(trimmed);
        }
      }
    } else if (t.isJSXElement(child)) {
      const childName = getElementName(t, child.openingElement);

      if (textComponentNames.includes(childName)) {
        const innerTexts = extractTextFromTextComponent(t, child, textComponentNames);
        if (innerTexts === null) {
          return null;
        }
        texts.push(...innerTexts);
      } else {
        const result = extractStaticTextFromChildren(t, child, textComponentNames, depth - 1, false);
        if (result === null) {
          return null;
        }
        texts.push(...result);
      }
    } else if (t.isJSXFragment(child)) {
      const result = extractStaticTextFromChildren(t, child, textComponentNames, depth, isRoot);
      if (result === null) {
        return null;
      }
      texts.push(...result);
    } else if (t.isJSXExpressionContainer(child)) {
      if (!t.isJSXEmptyExpression(child.expression)) {
        return null;
      }
    } else if (t.isJSXSpreadChild(child)) {
      return null;
    }
  }

  return texts;
}

/**
 * Recursively extracts static text from within a recognized text component.
 * Handles nested text components (e.g. <Text>Hello <Text style={bold}>world</Text></Text>)
 * which is the standard React Native pattern for inline styling.
 *
 * Returns null when any dynamic content is found, signaling bail-out.
 */
function extractTextFromTextComponent(
  t: typeof Babel.types,
  node: Babel.types.JSXElement | Babel.types.JSXFragment,
  textComponentNames: string[],
): string[] | null {
  const texts: string[] = [];

  for (const child of node.children) {
    if (t.isJSXText(child)) {
      const trimmed = child.value.replace(/\s+/g, ' ').trim();
      if (trimmed) {
        texts.push(trimmed);
      }
    } else if (t.isJSXExpressionContainer(child)) {
      if (!t.isJSXEmptyExpression(child.expression)) {
        return null;
      }
    } else if (t.isJSXElement(child)) {
      const childName = getElementName(t, child.openingElement);
      if (textComponentNames.includes(childName)) {
        const innerTexts = extractTextFromTextComponent(t, child, textComponentNames);
        if (innerTexts === null) {
          return null;
        }
        texts.push(...innerTexts);
      } else {
        const innerTexts = extractTextFromTextComponent(t, child, textComponentNames);
        if (innerTexts === null) {
          return null;
        }
      }
    } else if (t.isJSXFragment(child)) {
      const innerTexts = extractTextFromTextComponent(t, child, textComponentNames);
      if (innerTexts === null) {
        return null;
      }
      texts.push(...innerTexts);
    } else if (t.isJSXSpreadChild(child)) {
      return null;
    }
  }

  return texts;
}

function getElementName(t: typeof Babel.types, openingElement: Babel.types.JSXOpeningElement): string {
  const name = openingElement.name;
  if (t.isJSXIdentifier(name)) {
    return name.name;
  }
  if (t.isJSXMemberExpression(name)) {
    return `${getJSXMemberExpressionObjectName(t, name.object)}.${name.property.name}`;
  }
  return '';
}

/**
 * Injects a sentry-label attribute on the root JSX element of a component if
 * static text content can be extracted from its children.
 *
 * When the root is a JSX fragment, the first JSXElement child is used as the
 * target for both text extraction and attribute injection (since fragments
 * cannot carry attributes).
 */
function maybeInjectSentryLabel(context: JSXProcessingContext, jsxNode: Babel.NodePath): void {
  const { t, textComponentNames, ignoredComponents, componentName } = context;
  const node = jsxNode.node;

  let targetElement: Babel.types.JSXElement;

  if (t.isJSXElement(node)) {
    targetElement = node;
  } else if (t.isJSXFragment(node)) {
    const firstChild = node.children.find((c): c is Babel.types.JSXElement => t.isJSXElement(c));
    if (!firstChild) {
      return;
    }
    targetElement = firstChild;
  } else {
    return;
  }

  const targetElementName = getElementName(t, targetElement.openingElement);

  if (ignoredComponents.some(ignored => ignored === componentName || ignored === targetElementName)) {
    return;
  }

  if (
    targetElement.openingElement.attributes.some(
      attr => t.isJSXAttribute(attr) && attr.name.name === SENTRY_LABEL_ATTRIBUTE,
    )
  ) {
    return;
  }

  const texts = extractStaticTextFromChildren(t, targetElement, textComponentNames, MAX_TEXT_SEARCH_DEPTH, true);

  if (texts === null) {
    return;
  }

  let label = texts.join(' ').replace(/\s+/g, ' ').trim();

  if (!label) {
    return;
  }

  if (label.length > MAX_LABEL_LENGTH) {
    label = `${label.substring(0, MAX_LABEL_LENGTH - 3)}...`;
  }

  targetElement.openingElement.attributes.push(
    t.jSXAttribute(t.jSXIdentifier(SENTRY_LABEL_ATTRIBUTE), t.stringLiteral(label)),
  );
}

const UNKNOWN_ELEMENT_NAME = 'unknown';
