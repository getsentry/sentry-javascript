import { readFile } from 'node:fs/promises';
import * as recast from 'recast';
import type { Plugin } from 'vite';
import { parser } from './recastTypescriptParser';
import type { AutoInstrumentRSCOptions } from './types';

import t = recast.types.namedTypes;

const JS_EXTENSIONS_RE = /\.(ts|tsx|js|jsx|mjs|mts)$/;
const WRAPPED_MODULE_SUFFIX = '?sentry-rsc-wrap';

// Prevents the Sentry bundler plugin from transforming this import path
const SENTRY_PACKAGE = '@sentry/react-router';

/** Exported for testing. */
export interface ModuleAnalysis {
  hasUseClientDirective: boolean;
  hasUseServerDirective: boolean;
  hasDefaultExport: boolean;
  hasManualServerFunctionWrapping: boolean;
  namedExports: string[];
}

// Babel-specific extensions not present in recast's type definitions
interface BabelExpressionStatement extends t.ExpressionStatement {
  directive?: string;
}
interface BabelExportNamedDeclaration extends t.ExportNamedDeclaration {
  exportKind?: string;
}
interface BabelExportSpecifier extends t.ExportSpecifier {
  exportKind?: string;
}

/** Extracts directive values ("use client"/"use server") from the program. */
function extractDirectives(program: t.Program): { useClient: boolean; useServer: boolean } {
  let useClient = false;
  let useServer = false;

  // Babel puts directives in program.directives (e.g. "use strict", "use server")
  if (program.directives) {
    for (const d of program.directives) {
      const value = d.value?.value;
      if (value === 'use client') {
        useClient = true;
      }
      if (value === 'use server') {
        useServer = true;
      }
    }
  }

  // Some Babel versions may place directive-like expression statements in the body
  for (const node of program.body) {
    if (node.type !== 'ExpressionStatement') {
      break;
    }
    const expr = node as BabelExpressionStatement;
    let value = expr.directive;
    if (!value && expr.expression.type === 'StringLiteral') {
      value = expr.expression.value;
    }
    if (typeof value !== 'string') {
      break;
    }
    if (value === 'use client') {
      useClient = true;
    }
    if (value === 'use server') {
      useServer = true;
    }
  }

  return { useClient, useServer };
}

/**
 * Collects named export identifiers from an ExportNamedDeclaration node.
 * Returns `true` when the node contains `export { x as default }`, which
 * counts as a default export even though it is syntactically an
 * ExportNamedDeclaration.
 */
function collectNamedExports(node: BabelExportNamedDeclaration, into: Set<string>): boolean {
  if (node.exportKind === 'type') {
    return false;
  }

  let hasDefault = false;

  const decl = node.declaration;
  if (decl) {
    if (decl.type === 'TSTypeAliasDeclaration' || decl.type === 'TSInterfaceDeclaration') {
      return false;
    }

    if (decl.type === 'VariableDeclaration') {
      decl.declarations
        .filter(declarator => declarator.type === 'VariableDeclarator' && declarator.id.type === 'Identifier')
        .forEach(declarator => {
          into.add((declarator.id as t.Identifier).name);
        });
    } else {
      const name = getDeclarationName(decl);
      if (name) {
        into.add(name);
      }
    }
  }

  if (node.specifiers) {
    node.specifiers
      .filter(spec => spec.type === 'ExportSpecifier' && (spec as BabelExportSpecifier).exportKind !== 'type')
      .forEach(spec => {
        const name = getExportedName(spec.exported as t.Identifier | t.StringLiteral);
        if (name === 'default') {
          hasDefault = true;
        } else if (name) {
          into.add(name);
        }
      });
  }

  return hasDefault;
}

function getExportedName(node: t.Identifier | t.StringLiteral): string | undefined {
  if (node.type === 'Identifier') {
    return node.name;
  }
  if (node.type === 'StringLiteral') {
    return node.value;
  }
  return undefined;
}

function getDeclarationName(decl: t.Declaration): string | undefined {
  if (decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') {
    const id = decl.id as t.Identifier | null | undefined;
    return id?.type === 'Identifier' ? id.name : undefined;
  }
  return undefined;
}

function importsWrapServerFunction(node: t.ImportDeclaration): boolean {
  if (node.source.value !== SENTRY_PACKAGE || !node.specifiers) {
    return false;
  }
  return node.specifiers.some(
    spec =>
      spec.type === 'ImportSpecifier' &&
      spec.imported.type === 'Identifier' &&
      spec.imported.name === 'wrapServerFunction',
  );
}

/**
 * AST-based analysis of a module's directives, exports, and Sentry wrapping.
 * Uses recast + @babel/parser so that patterns inside comments or strings
 * are never matched.
 *
 * Returns `null` when the file cannot be parsed (the caller should skip it).
 *
 * Exported for testing.
 */
export function analyzeModule(code: string): ModuleAnalysis | null {
  let program: t.Program | undefined;
  try {
    const ast = recast.parse(code, { parser });
    program = (ast as { program?: t.Program }).program;
  } catch {
    return null;
  }

  if (!program) {
    return null;
  }

  const directives = extractDirectives(program);

  let hasDefaultExport = false;
  let hasManualServerFunctionWrapping = false;
  const namedExportSet = new Set<string>();

  recast.visit(program, {
    visitExportDefaultDeclaration() {
      hasDefaultExport = true;
      return false;
    },
    visitExportNamedDeclaration(path) {
      if (collectNamedExports(path.node as BabelExportNamedDeclaration, namedExportSet)) {
        hasDefaultExport = true;
      }
      return false;
    },
    visitImportDeclaration(path) {
      if (importsWrapServerFunction(path.node)) {
        hasManualServerFunctionWrapping = true;
      }
      return false;
    },
  });

  return {
    hasUseClientDirective: directives.useClient,
    hasUseServerDirective: directives.useServer,
    hasDefaultExport,
    hasManualServerFunctionWrapping,
    namedExports: [...namedExportSet],
  };
}

/** Exported for testing. */
export function getServerFunctionWrapperCode(
  originalId: string,
  exportNames: string[],
  includeDefault: boolean = false,
): string {
  const wrappedId = JSON.stringify(`${originalId}${WRAPPED_MODULE_SUFFIX}`);
  const lines = [
    "'use server';",
    `import { wrapServerFunction } from '${SENTRY_PACKAGE}';`,
    `import * as _sentry_original from ${wrappedId};`,
    ...exportNames.map(
      name =>
        `export const ${name} = wrapServerFunction(${JSON.stringify(name)}, _sentry_original[${JSON.stringify(name)}]);`,
    ),
  ];
  if (includeDefault) {
    lines.push('export default wrapServerFunction("default", _sentry_original.default);');
  }
  return lines.join('\n');
}

/** @experimental May change in minor releases. */
export function makeAutoInstrumentRSCPlugin(options: AutoInstrumentRSCOptions = {}): Plugin {
  const { enabled = true, debug = false } = options;

  let rscDetected = false;

  return {
    name: 'sentry-react-router-rsc-auto-instrument',
    enforce: 'pre',

    configResolved(config) {
      rscDetected = config.plugins.some(p => p.name.startsWith('react-router/rsc'));
      // eslint-disable-next-line no-console
      debug && console.log(`[Sentry RSC] RSC mode ${rscDetected ? 'detected' : 'not detected'}`);
    },

    resolveId(source) {
      return source.includes(WRAPPED_MODULE_SUFFIX) ? source : null;
    },

    async load(id: string) {
      if (!id.includes(WRAPPED_MODULE_SUFFIX)) {
        return null;
      }
      const originalPath = id.slice(0, -WRAPPED_MODULE_SUFFIX.length);
      try {
        return await readFile(originalPath, 'utf-8');
      } catch {
        // eslint-disable-next-line no-console
        debug && console.log(`[Sentry RSC] Failed to read original file: ${originalPath}`);
        return null;
      }
    },

    transform(code: string, id: string) {
      if (id.includes(WRAPPED_MODULE_SUFFIX)) {
        return null;
      }
      if (!enabled || !rscDetected || !JS_EXTENSIONS_RE.test(id)) {
        return null;
      }

      const analysis = analyzeModule(code);
      if (!analysis) {
        // eslint-disable-next-line no-console
        debug && console.log(`[Sentry RSC] Skipping unparseable: ${id}`);
        return null;
      }

      // Only handle "use server" files — server components must be wrapped manually
      if (!analysis.hasUseServerDirective) {
        return null;
      }

      if (analysis.hasManualServerFunctionWrapping) {
        // eslint-disable-next-line no-console
        debug && console.log(`[Sentry RSC] Skipping already wrapped: ${id}`);
        return null;
      }

      const exportNames = analysis.namedExports;
      const includeDefault = analysis.hasDefaultExport;
      if (exportNames.length === 0 && !includeDefault) {
        // eslint-disable-next-line no-console
        debug && console.log(`[Sentry RSC] Skipping server function file with no exports: ${id}`);
        return null;
      }
      const exportList = includeDefault ? [...exportNames, 'default'] : exportNames;
      // eslint-disable-next-line no-console
      debug && console.log(`[Sentry RSC] Auto-wrapping server functions: ${id} -> [${exportList.join(', ')}]`);
      return { code: getServerFunctionWrapperCode(id, exportNames, includeDefault), map: null };
    },
  };
}
