import { isObjectLike } from '@sentry/core';
import type { SourceMap } from 'magic-string';

import type { ComponentAnnotationAttribute } from '../babel-plugin/component-annotation';

export { isObjectLike };

export type AstNode = {
  type: string;
  start?: number;
  end?: number;
  [key: string]: unknown;
};

export type JSXElementNode = AstNode & {
  type: 'JSXElement';
  openingElement: JSXOpeningElementNode;
  children?: AstNode[];
};

export type JSXFragmentNode = AstNode & {
  type: 'JSXFragment';
  children?: AstNode[];
};

export type JSXRootNode = JSXElementNode | JSXFragmentNode;

export type JSXOpeningElementNode = AstNode & {
  type: 'JSXOpeningElement';
  name: AstNode;
  attributes?: AstNode[];
  selfClosing?: boolean;
};

export type FragmentContext = {
  fragmentAliases: Set<string>;
  reactNamespaceAliases: Set<string>;
};

export type AttributeInsertion = {
  offset: number;
  attributes: ComponentAnnotationAttribute[];
};

export type ParseAstAsync = (code: string, options: { lang: 'jsx' | 'tsx' }) => Promise<unknown>;

export type MagicStringLike = {
  appendLeft(offset: number, content: string): void;
  toString(): string;
  generateMap?(options: {
    file?: string;
    source?: string;
    includeContent?: boolean;
    hires?: boolean | 'boundary';
  }): SourceMap | string;
};

export type ComponentAnnotationTransformMeta = {
  magicString?: MagicStringLike;
};

export type ComponentAnnotationTransformResult =
  | {
      code: string;
      map?: SourceMap | string;
    }
  | null
  | undefined;

export function isAstNode(value: unknown): value is AstNode {
  return isObjectLike(value) && typeof value.type === 'string';
}

export function walkAst(node: unknown, visit: (node: AstNode) => void): void {
  if (!isAstNode(node)) {
    return;
  }

  visit(node);

  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const child of value) {
        walkAst(child, visit);
      }
    } else if (isAstNode(value)) {
      walkAst(value, visit);
    }
  }
}
