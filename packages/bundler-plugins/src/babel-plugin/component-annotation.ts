import { DEFAULT_IGNORED_ELEMENTS } from './constants';

export const WEB_COMPONENT_NAME = 'data-sentry-component';
export const WEB_ELEMENT_NAME = 'data-sentry-element';
export const WEB_SOURCE_FILE_NAME = 'data-sentry-source-file';

export const NATIVE_COMPONENT_NAME = 'dataSentryComponent';
export const NATIVE_ELEMENT_NAME = 'dataSentryElement';
export const NATIVE_SOURCE_FILE_NAME = 'dataSentrySourceFile';

export type ComponentAnnotationAttributeNames = readonly [string, string, string];

export type ComponentAnnotationAttribute = [string, string];

type ComponentAnnotationAttributesInput = {
  attributeNames: ComponentAnnotationAttributeNames;
  componentName: string;
  elementName: string;
  existingAttributes: ReadonlySet<string>;
  ignoredComponents: readonly string[];
  isFragment: boolean;
  sourceFileName?: string;
};

const DEFAULT_IGNORED_ELEMENTS_SET = new Set(DEFAULT_IGNORED_ELEMENTS);

export function getComponentAnnotationAttributes({
  attributeNames,
  componentName,
  elementName,
  existingAttributes,
  ignoredComponents,
  isFragment,
  sourceFileName,
}: ComponentAnnotationAttributesInput): ComponentAnnotationAttribute[] {
  if (isFragment || ignoredComponents.includes(componentName) || ignoredComponents.includes(elementName)) {
    return [];
  }

  const [componentAttributeName, elementAttributeName, sourceFileAttributeName] = attributeNames;
  const isIgnoredElement = DEFAULT_IGNORED_ELEMENTS_SET.has(elementName);
  const attributes: ComponentAnnotationAttribute[] = [];

  if (!isIgnoredElement && !existingAttributes.has(elementAttributeName)) {
    attributes.push([elementAttributeName, elementName]);
  }

  if (componentName && !existingAttributes.has(componentAttributeName)) {
    attributes.push([componentAttributeName, componentName]);
  }

  if (sourceFileName && (componentName || !isIgnoredElement) && !existingAttributes.has(sourceFileAttributeName)) {
    attributes.push([sourceFileAttributeName, sourceFileName]);
  }

  return attributes;
}
