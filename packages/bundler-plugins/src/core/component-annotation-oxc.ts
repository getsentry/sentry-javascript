import path from 'node:path';

import MagicString, { SourceMap } from 'magic-string';

import { KNOWN_INCOMPATIBLE_PLUGINS } from '../babel-plugin/constants';
import { stripQueryAndHashFromPath } from './utils';
import { isAstNode, walkAst } from './component-annotation-oxc-ast';
import { collectOxcComponentAnnotationInsertions } from './component-annotation-oxc-walk';
import type {
  AstNode,
  AttributeInsertion,
  ComponentAnnotationTransformMeta,
  ComponentAnnotationTransformResult,
  MagicStringLike,
  ParseAstAsync,
} from './component-annotation-oxc-ast';

export type {
  ComponentAnnotationTransformMeta,
  ComponentAnnotationTransformResult,
} from './component-annotation-oxc-ast';

let oxcParseAstAsyncPromise: Promise<ParseAstAsync | null> | undefined;

export function getOxcParseAstAsync(): Promise<ParseAstAsync | null> {
  if (!oxcParseAstAsyncPromise) {
    oxcParseAstAsyncPromise = import('oxc-parser')
      .then(({ parse }): ParseAstAsync => {
        return async (code, { lang }) => {
          // preserveParens: false matches the AST Vite 8 produces. The walker
          // does not look through ParenthesizedExpression nodes.
          const { program, errors } = await parse(`component.${lang}`, code, { lang, preserveParens: false });

          if (errors.length > 0) {
            throw new Error(errors[0]?.message);
          }

          return program;
        };
      })
      .catch(() => null);
  }

  return oxcParseAstAsyncPromise;
}

// Keep this as a superset of all JSX tag starts, because a miss skips the file.
const JSX_TAG_START_REGEXP = /<[$_\p{ID_Start}][$_\u200c\u200d\p{ID_Continue}.:-]*|<>/u;
const JSX_FILE_REGEXP = /\.[jt]sx$/;

function isAnnotationFile(idWithoutQueryAndHash: string): boolean {
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

function collectIdentifierNamesByOffset(ast: AstNode): Map<number, string> {
  const namesByOffset = new Map<number, string>();

  walkAst(ast, node => {
    if (
      (node.type === 'Identifier' || node.type === 'JSXIdentifier') &&
      typeof node.name === 'string' &&
      typeof node.start === 'number'
    ) {
      namesByOffset.set(node.start, node.name);
    }
  });

  return namesByOffset;
}

// SWC, which runs after this transform in Next.js, takes names only from the
// input map when it composes maps. Without names here, stack frames show
// minified function names.
function generateMapWithNames(magicString: MagicString, code: string, ast: AstNode, source: string): SourceMap {
  const map = magicString.generateDecodedMap({
    source,
    includeContent: true,
    hires: true,
  });

  const namesByOffset = collectIdentifierNamesByOffset(ast);
  const lineOffsets = [0];
  for (let i = code.indexOf('\n'); i !== -1; i = code.indexOf('\n', i + 1)) {
    lineOffsets.push(i + 1);
  }

  const nameIndices = new Map<string, number>();
  for (const line of map.mappings) {
    for (let i = 0; i < line.length; i++) {
      const segment = line[i];
      if (segment?.length !== 4) {
        continue;
      }

      const [generatedColumn, sourceIndex, sourceLine, sourceColumn] = segment;
      const name = namesByOffset.get((lineOffsets[sourceLine] ?? NaN) + sourceColumn);
      if (name === undefined) {
        continue;
      }

      let nameIndex = nameIndices.get(name);
      if (nameIndex === undefined) {
        nameIndex = map.names.push(name) - 1;
        nameIndices.set(name, nameIndex);
      }

      line[i] = [generatedColumn, sourceIndex, sourceLine, sourceColumn, nameIndex];
    }
  }

  return new SourceMap(map);
}

async function annotateWithOxcParser(
  code: string,
  idWithoutQueryAndHash: string,
  ignoredComponents: string[],
  parseAstAsync: ParseAstAsync,
  injectIntoHtml: boolean,
  meta?: ComponentAnnotationTransformMeta,
): Promise<ComponentAnnotationTransformResult> {
  const ast = await parseAstAsync(code, {
    lang: idWithoutQueryAndHash.endsWith('.jsx') ? 'jsx' : 'tsx',
  });

  if (!isAstNode(ast)) {
    return null;
  }

  const insertions = collectOxcComponentAnnotationInsertions(
    code,
    ast,
    ignoredComponents,
    path.basename(idWithoutQueryAndHash),
    injectIntoHtml,
  );

  if (insertions.length === 0) {
    return null;
  }

  if (meta?.magicString) {
    applyInsertions(meta.magicString, code, insertions);
    return { code: meta.magicString as unknown as string };
  }

  const magicString = new MagicString(code);
  applyInsertions(magicString, code, insertions);

  return {
    code: magicString.toString(),
    // No `file`, because magic-string would then make `source` relative to it
    // and drop the directory from `sources`.
    map: generateMapWithNames(magicString, code, ast, idWithoutQueryAndHash),
  };
}

function applyInsertions(magicString: MagicStringLike, code: string, insertions: AttributeInsertion[]): void {
  for (const insertion of insertions) {
    magicString.appendLeft(insertion.offset, makeAttributeText(code, insertion.offset, insertion.attributes));
  }
}

export function createOxcComponentNameAnnotateHooks(
  ignoredComponents: string[],
  getParseAstAsync: () => Promise<ParseAstAsync | null>,
  injectIntoHtml = false,
): {
  transform(
    code: string,
    id: string,
    meta?: ComponentAnnotationTransformMeta,
  ): Promise<ComponentAnnotationTransformResult>;
} {
  return {
    async transform(code, id, meta) {
      const idWithoutQueryAndHash = stripQueryAndHashFromPath(id);

      if (
        !idWithoutQueryAndHash ||
        !isAnnotationFile(idWithoutQueryAndHash) ||
        !shouldTryParse(code) ||
        shouldSkipIncompatibleFile(idWithoutQueryAndHash)
      ) {
        return null;
      }

      try {
        const parseAstAsync = await getParseAstAsync();

        if (!parseAstAsync) {
          return null;
        }

        return await annotateWithOxcParser(
          code,
          idWithoutQueryAndHash,
          ignoredComponents,
          parseAstAsync,
          injectIntoHtml,
          meta,
        );
      } catch {
        // Leave files the parser cannot read unchanged. The bundler reports the syntax error.
        return null;
      }
    },
  };
}
