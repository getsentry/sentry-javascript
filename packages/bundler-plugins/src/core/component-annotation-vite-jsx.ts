import {
  getComponentAnnotationAttributes,
  WEB_COMPONENT_NAME,
  WEB_ELEMENT_NAME,
  WEB_SOURCE_FILE_NAME,
} from '../babel-plugin/component-annotation';
import type { ComponentAnnotationAttribute } from '../babel-plugin/component-annotation';
import type {
  AttributeInsertion,
  FragmentContext,
  JSXElementNode,
  JSXFragmentNode,
  JSXOpeningElementNode,
  JSXRootNode,
} from './component-annotation-vite-ast';
import { isAstNode, isObject } from './component-annotation-vite-ast';

const UNKNOWN_ELEMENT_NAME = 'unknown';
const WEB_ATTRIBUTE_NAMES = [WEB_ELEMENT_NAME, WEB_COMPONENT_NAME, WEB_SOURCE_FILE_NAME] as const;
const WEB_ATTRIBUTE_NAME_SET = new Set<string>(WEB_ATTRIBUTE_NAMES);

type PendingInsertion = {
  offset: number;
  attributeValues: Map<string, string>;
};

export function isJSXElement(value: unknown): value is JSXElementNode {
  return isAstNode(value) && value.type === 'JSXElement';
}

export function isJSXFragment(value: unknown): value is JSXFragmentNode {
  return isAstNode(value) && value.type === 'JSXFragment';
}

export function isJSXRoot(value: unknown): value is JSXRootNode {
  return isJSXElement(value) || isJSXFragment(value);
}

export function getStringName(node: unknown): string | null {
  return isObject(node) && typeof node.name === 'string' ? node.name : null;
}

export function getJSXName(name: unknown): string {
  if (!isAstNode(name)) {
    return UNKNOWN_ELEMENT_NAME;
  }

  if (name.type === 'JSXIdentifier') {
    return getStringName(name) ?? UNKNOWN_ELEMENT_NAME;
  }

  if (name.type === 'JSXNamespacedName') {
    return getStringName(name.name) ?? UNKNOWN_ELEMENT_NAME;
  }

  if (name.type === 'JSXMemberExpression') {
    const objectName = getJSXName(name.object);
    const propertyName = getJSXName(name.property);

    return `${objectName}.${propertyName}`;
  }

  return UNKNOWN_ELEMENT_NAME;
}

export function getInsertionOffset(code: string, openingElement: JSXOpeningElementNode): number | null {
  if (typeof openingElement.end !== 'number') {
    return null;
  }

  if (!openingElement.selfClosing) {
    return openingElement.end - 1;
  }

  let offset = openingElement.end - 2;

  while (offset > 0 && /\s/.test(code[offset] ?? '')) {
    offset -= 1;
  }

  return code[offset] === '/' ? offset : openingElement.end - 1;
}

export function isReactFragment(openingElement: JSXOpeningElementNode, fragmentContext: FragmentContext): boolean {
  const elementName = getJSXName(openingElement.name);

  if (elementName === 'Fragment' || elementName === 'React.Fragment') {
    return true;
  }

  if (fragmentContext.fragmentAliases.has(elementName)) {
    return true;
  }

  if (isObject(openingElement.name) && openingElement.name.type === 'JSXMemberExpression') {
    const objectName = getJSXName(openingElement.name.object);
    const propertyName = getJSXName(openingElement.name.property);

    return (
      propertyName === 'Fragment' &&
      (fragmentContext.reactNamespaceAliases.has(objectName) || fragmentContext.fragmentAliases.has(objectName))
    );
  }

  return false;
}

export function addPendingAttributes(
  code: string,
  openingElement: JSXOpeningElementNode,
  componentName: string,
  ignoredComponents: string[],
  fragmentContext: FragmentContext,
  sourceFileName: string,
  insertionsByOffset: Map<number, PendingInsertion>,
): void {
  const offset = getInsertionOffset(code, openingElement);
  if (offset === null) {
    return;
  }

  const pendingInsertion = insertionsByOffset.get(offset);
  const existingAttributes = getExistingAttributeNames(openingElement);

  for (const attributeName of pendingInsertion?.attributeValues.keys() ?? []) {
    existingAttributes.add(attributeName);
  }

  const attributes = getComponentAnnotationAttributes({
    attributeNames: [WEB_COMPONENT_NAME, WEB_ELEMENT_NAME, WEB_SOURCE_FILE_NAME],
    componentName,
    elementName: getJSXName(openingElement.name),
    existingAttributes,
    ignoredComponents,
    isFragment: isReactFragment(openingElement, fragmentContext),
    sourceFileName,
  });

  if (attributes.length === 0) {
    return;
  }

  const insertion =
    pendingInsertion ??
    insertionsByOffset
      .set(offset, {
        offset,
        attributeValues: new Map(),
      })
      .get(offset);

  for (const [name, value] of attributes) {
    insertion?.attributeValues.set(name, value);
  }
}

export function toAttributeInsertions(insertionsByOffset: Map<number, PendingInsertion>): AttributeInsertion[] {
  return [...insertionsByOffset.values()].map(({ offset, attributeValues }) => ({
    offset,
    attributes: getOrderedAttributes(attributeValues),
  }));
}

function getExistingAttributeNames(openingElement: JSXOpeningElementNode): Set<string> {
  const names = new Set<string>();

  for (const attribute of openingElement.attributes ?? []) {
    if (attribute.type === 'JSXAttribute') {
      const name = getStringName(attribute.name);
      if (name) {
        names.add(name);
      }
    }
  }

  return names;
}

function getOrderedAttributes(attributeValues: ReadonlyMap<string, string>): ComponentAnnotationAttribute[] {
  const attributes: ComponentAnnotationAttribute[] = [];

  for (const name of WEB_ATTRIBUTE_NAMES) {
    const value = attributeValues.get(name);
    if (value) {
      attributes.push([name, value]);
    }
  }

  for (const [name, value] of attributeValues) {
    if (!WEB_ATTRIBUTE_NAME_SET.has(name)) {
      attributes.push([name, value]);
    }
  }

  return attributes;
}
