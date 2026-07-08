import path from 'node:path';

import MagicString from 'magic-string';

import { KNOWN_INCOMPATIBLE_PLUGINS } from '../babel-plugin/constants';
import { stripQueryAndHashFromPath } from './utils';
import { isAstNode } from './component-annotation-vite-ast';
import { collectViteComponentAnnotationInsertions } from './component-annotation-vite-walk';
import type {
  AttributeInsertion,
  ComponentAnnotationTransformMeta,
  ComponentAnnotationTransformResult,
  MagicStringLike,
  ParseAstAsync,
} from './component-annotation-vite-ast';

export type {
  ComponentAnnotationTransformMeta,
  ComponentAnnotationTransformResult,
} from './component-annotation-vite-ast';

// Keep this as a superset of JSX tag starts Babel can annotate, because a miss suppresses Babel fallback.
const JSX_TAG_START_REGEXP = /<[$_\p{ID_Start}][$_\u200c\u200d\p{ID_Continue}.:-]*|<>/u;
const JSX_FILE_REGEXP = /\.[jt]sx$/;

function isViteAnnotationFile(idWithoutQueryAndHash: string): boolean {
  if (idWithoutQueryAndHash.match(/\\node_modules\\|\/node_modules\//)) {
    return false;
  }

  return JSX_FILE_REGEXP.test(idWithoutQueryAndHash);
}

function shouldTryParse(code: string): boolean {
  return JSX_TAG_START_REGEXP.test(code);
}

function shouldSkipIncompatibleFile(idWithoutQueryAndHash: string): boolean {
  return KNOWN_INCOMPATIBLE_PLUGINS.some(pluginName => {
    return (
      idWithoutQueryAndHash.includes(`/node_modules/${pluginName}/`) ||
      idWithoutQueryAndHash.includes(`\\node_modules\\${pluginName}\\`)
    );
  });
}

function escapeAttributeValue(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function makeAttributeText(
  code: string,
  insertionOffset: number,
  attributes: AttributeInsertion['attributes'],
): string {
  const previousCharIsWhitespace = insertionOffset > 0 && /\s/.test(code[insertionOffset - 1] ?? '');
  const prefix = previousCharIsWhitespace ? '' : ' ';
  const suffix = previousCharIsWhitespace && code[insertionOffset] === '/' ? ' ' : '';
  const attributeText = attributes.map(([name, value]) => `${name}="${escapeAttributeValue(value)}"`).join(' ');

  return `${prefix}${attributeText}${suffix}`;
}

function getMagicString(
  code: string,
  meta?: ComponentAnnotationTransformMeta,
): { magicString: MagicStringLike; isNative: boolean } {
  if (meta?.magicString) {
    return { magicString: meta.magicString, isNative: true };
  }

  return { magicString: new MagicString(code), isNative: false };
}

async function annotateWithViteParser(
  code: string,
  id: string,
  ignoredComponents: string[],
  parseAstAsync: ParseAstAsync,
  meta?: ComponentAnnotationTransformMeta,
): Promise<ComponentAnnotationTransformResult> {
  const idWithoutQueryAndHash = stripQueryAndHashFromPath(id);

  if (
    !idWithoutQueryAndHash ||
    !isViteAnnotationFile(idWithoutQueryAndHash) ||
    !shouldTryParse(code) ||
    shouldSkipIncompatibleFile(idWithoutQueryAndHash)
  ) {
    return null;
  }

  const ast = await parseAstAsync(code, {
    lang: idWithoutQueryAndHash.endsWith('.jsx') ? 'jsx' : 'tsx',
  });

  if (!isAstNode(ast)) {
    return null;
  }

  const insertions = collectViteComponentAnnotationInsertions(
    code,
    ast,
    ignoredComponents,
    path.basename(idWithoutQueryAndHash),
  );

  if (insertions.length === 0) {
    return null;
  }

  const { magicString, isNative } = getMagicString(code, meta);

  for (const insertion of insertions) {
    magicString.appendLeft(insertion.offset, makeAttributeText(code, insertion.offset, insertion.attributes));
  }

  if (isNative) {
    return { code: magicString as unknown as string };
  }

  return {
    code: magicString.toString(),
    map: magicString.generateMap?.({
      file: id,
      source: idWithoutQueryAndHash,
      includeContent: true,
      hires: true,
    }),
  };
}

export function createViteComponentNameAnnotateHooks(
  ignoredComponents: string[],
  getParseAstAsync: () => Promise<ParseAstAsync | null>,
): {
  transform(
    code: string,
    id: string,
    meta?: ComponentAnnotationTransformMeta,
  ): Promise<ComponentAnnotationTransformResult>;
} {
  return {
    async transform(code, id, meta) {
      try {
        const parseAstAsync = await getParseAstAsync();

        if (!parseAstAsync) {
          return undefined;
        }

        return await annotateWithViteParser(code, id, ignoredComponents, parseAstAsync, meta);
      } catch {
        return undefined;
      }
    },
  };
}
