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
 * - Highly modified to inject the data attributes into the root HTML elements of a component.
 */

import type * as Babel from "@babel/core";
import type { PluginObj, PluginPass } from "@babel/core";

const REACT_NATIVE_ELEMENTS: string[] = [
  "Image",
  "Text",
  "View",
  "ScrollView",
  "TextInput",
  "TouchableOpacity",
  "TouchableHighlight",
  "TouchableWithoutFeedback",
  "FlatList",
  "SectionList",
  "ActivityIndicator",
  "Button",
  "Switch",
  "Modal",
  "SafeAreaView",
  "StatusBar",
  "KeyboardAvoidingView",
  "RefreshControl",
  "Picker",
  "Slider",
];

interface AnnotationOpts {
  native?: boolean;
  ignoredComponents?: string[];
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
  /** Babel types object */
  t: typeof Babel.types;
  /** Name of the React component */
  componentName: string;
  /** AAttribute name for the component */
  attributeName: string;
  /** Array of component names to ignore */
  ignoredComponents: string[];
  /** Fragment context for identifying React fragments */
  fragmentContext?: FragmentContext;
}

// We must export the plugin as default, otherwise the Babel loader will not be able to resolve it when configured using its string identifier
export function experimentalComponentNameAnnotatePlugin({
  types: t,
}: typeof Babel): AnnotationPlugin {
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

        const context = createJSXProcessingContext(state, t, path.node.id.name);
        functionBodyPushAttributes(context, path);
      },
      ArrowFunctionExpression(path, state) {
        // We're expecting a `VariableDeclarator` like `const MyComponent =`
        const parent = path.parent;

        if (
          !parent ||
          !("id" in parent) ||
          !parent.id ||
          !("name" in parent.id) ||
          !parent.id.name
        ) {
          return;
        }

        const context = createJSXProcessingContext(state, t, parent.id.name);
        functionBodyPushAttributes(context, path);
      },
      ClassDeclaration(path, state) {
        const name = path.get("id");
        const properties = path.get("body").get("body");
        const render = properties.find((prop) => {
          return prop.isClassMethod() && prop.get("key").isIdentifier({ name: "render" });
        });

        if (!render?.traverse) {
          return;
        }

        const context = createJSXProcessingContext(state, t, name.node?.name || "");

        render.traverse({
          ReturnStatement(returnStatement) {
            const arg = returnStatement.get("argument");

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
 * Checks if an element name represents an HTML element (as opposed to a React component).
 * HTML elements include standard lowercase HTML tags and React Native elements.
 */
function isHtmlElement(elementName: string): boolean {
  // Unknown elements are not HTML elements
  if (elementName === UNKNOWN_ELEMENT_NAME) {
    return false;
  }

  // Check for lowercase first letter (standard HTML elements)
  if (elementName.length > 0 && elementName.charAt(0) === elementName.charAt(0).toLowerCase()) {
    return true;
  }

  // React Native elements typically start with uppercase but are still "native" elements
  // We consider them HTML-like elements for annotation purposes
  if (REACT_NATIVE_ELEMENTS.includes(elementName)) {
    return true;
  }

  // Otherwise, assume it's a React component (PascalCase)
  return false;
}

/**
 * Creates a JSX processing context from the plugin state
 */
function createJSXProcessingContext(
  state: AnnotationPluginPass,
  t: typeof Babel.types,
  componentName: string
): JSXProcessingContext {
  return {
    t,
    componentName,
    attributeName: attributeNamesFromState(state),
    ignoredComponents: state.opts.ignoredComponents ?? [],
    fragmentContext: state.sentryFragmentContext,
  };
}

/**
 * Processes the body of a function to add Sentry tracking attributes to JSX elements.
 * Handles various function body structures including direct JSX returns, conditional expressions,
 * and nested JSX elements.
 */
function functionBodyPushAttributes(
  context: JSXProcessingContext,
  path: Babel.NodePath<Babel.types.Function>
): void {
  let jsxNode: Babel.NodePath;

  const functionBody = path.get("body").get("body");

  if (
    !("length" in functionBody) &&
    functionBody.parent &&
    (functionBody.parent.type === "JSXElement" || functionBody.parent.type === "JSXFragment")
  ) {
    const maybeJsxNode = functionBody.find((c) => {
      return c.type === "JSXElement" || c.type === "JSXFragment";
    });

    if (!maybeJsxNode) {
      return;
    }

    jsxNode = maybeJsxNode;
  } else {
    const returnStatement = functionBody.find((c) => {
      return c.type === "ReturnStatement";
    });
    if (!returnStatement) {
      return;
    }

    const arg = returnStatement.get("argument");
    if (!arg) {
      return;
    }

    if (Array.isArray(arg)) {
      return;
    }

    // Handle the case of a function body returning a ternary operation.
    // `return (maybeTrue ? '' : (<SubComponent />))`
    if (arg.isConditionalExpression()) {
      const consequent = arg.get("consequent");
      if (consequent.isJSXFragment() || consequent.isJSXElement()) {
        processJSX(context, consequent);
      }
      const alternate = arg.get("alternate");
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
function processJSX(context: JSXProcessingContext, jsxNode: Babel.NodePath): void {
  if (!jsxNode) {
    return;
  }

  // NOTE: I don't know of a case where `openingElement` would have more than one item,
  // but it's safer to always iterate
  const paths = jsxNode.get("openingElement");
  const openingElements = (
    Array.isArray(paths) ? paths : [paths]
  ) as Babel.NodePath<Babel.types.JSXOpeningElement>[];

  const hasInjectedAttributes = openingElements.reduce(
    (prev, openingElement) =>
      prev || applyAttributes(context, openingElement, context.componentName),
    false
  );

  if (hasInjectedAttributes) {
    return;
  }

  let children = jsxNode.get("children");
  // TODO: See why `Array.isArray` doesn't have correct behaviour here
  if (children && !("length" in children)) {
    // A single child was found, maybe a bit of static text
    children = [children];
  }

  children.forEach((child) => {
    // Happens for some node types like plain text
    if (!child.node) {
      return;
    }

    // If the current element is a fragment, children are still considered at root level
    // Otherwise, children are not at root level
    const openingElement = child.get("openingElement");
    // TODO: Improve this. We never expect to have multiple opening elements
    // but if it's possible, this should work
    if (Array.isArray(openingElement)) {
      return;
    }

    processJSX(context, child);
  });
}

/**
 * Applies Sentry tracking attributes to a JSX opening element.
 * Adds component name, element name, and source file attributes while
 * respecting ignore lists and fragment detection.
 */
function applyAttributes(
  context: JSXProcessingContext,
  openingElement: Babel.NodePath<Babel.types.JSXOpeningElement>,
  componentName: string
): boolean {
  const { t, attributeName: componentAttributeName, ignoredComponents, fragmentContext } = context;

  // e.g., Raw JSX text like the `A` in `<h1>a</h1>`
  if (!openingElement.node) {
    return false;
  }

  // Check if this is a React fragment - if so, skip attribute addition entirely
  const isFragment = isReactFragment(t, openingElement, fragmentContext);
  if (isFragment) {
    return false;
  }

  if (!openingElement.node.attributes) {
    openingElement.node.attributes = [];
  }

  const elementName = getPathName(t, openingElement);

  if (!isHtmlElement(elementName)) {
    return false;
  }

  const isAnIgnoredComponent = ignoredComponents.some(
    (ignoredComponent) => ignoredComponent === componentName || ignoredComponent === elementName
  );

  // Add a stable attribute for the component name (only for root elements)
  if (!isAnIgnoredComponent && !hasAttributeWithName(openingElement, componentAttributeName)) {
    if (componentAttributeName) {
      openingElement.node.attributes.push(
        t.jSXAttribute(t.jSXIdentifier(componentAttributeName), t.stringLiteral(componentName))
      );
    }
  }

  return true;
}

function attributeNamesFromState(state: AnnotationPluginPass): string {
  if (state.opts.native) {
    return "dataSentryComponent";
  }

  return "data-sentry-component";
}

function collectFragmentContext(programPath: Babel.NodePath): FragmentContext {
  const fragmentAliases = new Set<string>();
  const reactNamespaceAliases = new Set<string>(["React"]); // Default React namespace

  programPath.traverse({
    ImportDeclaration(importPath) {
      const source = importPath.node.source.value;

      // Handle React imports
      if (source === "react" || source === "React") {
        importPath.node.specifiers.forEach((spec) => {
          if (spec.type === "ImportSpecifier" && spec.imported.type === "Identifier") {
            // Detect aliased React.Fragment imports (e.g., `Fragment as F`)
            // so we can later identify <F> as a fragment in JSX.
            if (spec.imported.name === "Fragment") {
              fragmentAliases.add(spec.local.name);
            }
          } else if (
            spec.type === "ImportDefaultSpecifier" ||
            spec.type === "ImportNamespaceSpecifier"
          ) {
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
        if (varPath.node.id.type === "Identifier") {
          // Handle: const MyFragment = Fragment (only if Fragment is a known alias)
          if (init.type === "Identifier" && fragmentAliases.has(init.name)) {
            fragmentAliases.add(varPath.node.id.name);
          }

          // Handle: const MyFragment = React.Fragment (only for known React namespaces)
          if (
            init.type === "MemberExpression" &&
            init.object.type === "Identifier" &&
            init.property.type === "Identifier" &&
            init.property.name === "Fragment" &&
            reactNamespaceAliases.has(init.object.name)
          ) {
            fragmentAliases.add(varPath.node.id.name);
          }
        }

        // Handle destructuring assignments: const { Fragment } = React
        if (varPath.node.id.type === "ObjectPattern") {
          if (init.type === "Identifier" && reactNamespaceAliases.has(init.name)) {
            const properties = varPath.node.id.properties;

            for (const prop of properties) {
              if (
                prop.type === "ObjectProperty" &&
                prop.key?.type === "Identifier" &&
                prop.value?.type === "Identifier" &&
                prop.key.name === "Fragment"
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
  context?: FragmentContext // Add this optional parameter
): boolean {
  // Handle JSX fragments (<>)
  if (openingElement.isJSXFragment()) {
    return true;
  }

  const elementName = getPathName(t, openingElement);

  // Direct fragment references
  if (elementName === "Fragment" || elementName === "React.Fragment") {
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
    "name" in openingElement.node &&
    openingElement.node.name &&
    typeof openingElement.node.name === "object" &&
    "type" in openingElement.node.name &&
    openingElement.node.name.type === "JSXMemberExpression"
  ) {
    const nodeName = openingElement.node.name;
    if (typeof nodeName !== "object" || !nodeName) {
      return false;
    }

    if ("object" in nodeName && "property" in nodeName) {
      const nodeNameObject = nodeName.object;
      const nodeNameProperty = nodeName.property;

      if (typeof nodeNameObject !== "object" || typeof nodeNameProperty !== "object") {
        return false;
      }

      if (!nodeNameObject || !nodeNameProperty) {
        return false;
      }

      const objectName = "name" in nodeNameObject && nodeNameObject.name;
      const propertyName = "name" in nodeNameProperty && nodeNameProperty.name;

      // React.Fragment check
      if (objectName === "React" && propertyName === "Fragment") {
        return true;
      }

      // Enhanced checks using context
      if (context) {
        // Check React.Fragment pattern with known React namespaces
        if (
          context.reactNamespaceAliases.has(objectName as string) &&
          propertyName === "Fragment"
        ) {
          return true;
        }

        // Check MyFragment.Fragment pattern
        if (context.fragmentAliases.has(objectName as string) && propertyName === "Fragment") {
          return true;
        }
      }
    }
  }

  return false;
}

function hasAttributeWithName(
  openingElement: Babel.NodePath<Babel.types.JSXOpeningElement>,
  name: string | undefined | null
): boolean {
  if (!name) {
    return false;
  }

  return openingElement.node.attributes.some((node) => {
    if (node.type === "JSXAttribute") {
      return node.name.name === name;
    }

    return false;
  });
}

function getPathName(t: typeof Babel.types, path: Babel.NodePath): string {
  if (!path.node) return UNKNOWN_ELEMENT_NAME;
  if (!("name" in path.node)) {
    return UNKNOWN_ELEMENT_NAME;
  }

  const name = path.node.name;

  if (typeof name === "string") {
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
  object: Babel.types.JSXMemberExpression | Babel.types.JSXIdentifier
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

const UNKNOWN_ELEMENT_NAME = "unknown";
