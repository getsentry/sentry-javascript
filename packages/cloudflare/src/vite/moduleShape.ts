import type { BaseNode, ProgramBody } from './transform';

// ---------------------------------------------------------------------------
// Minimal ESTree node shapes for structural Agent detection.
// ---------------------------------------------------------------------------

interface IdentifierNode extends BaseNode {
  name: string;
}

interface ClassNode extends BaseNode {
  id?: IdentifierNode | null;
  superClass?: BaseNode | null;
}

interface MemberExpressionNode extends BaseNode {
  object?: { type: string; name?: string };
  property?: { type: string; name?: string };
}

interface ImportSpecifierNode {
  type: string;
  imported?: { type: string; name?: string };
  local?: { type: string; name?: string };
}

interface ImportDeclarationNode extends BaseNode {
  source?: { value?: unknown };
  specifiers?: ImportSpecifierNode[];
}

interface ExportSpecifierNode {
  type: string;
  local?: { type: string; name?: string };
  exported?: { type: string; name?: string };
}

interface ExportNamedNode extends BaseNode {
  declaration?: BaseNode | null;
  source?: { value?: unknown } | null;
  specifiers?: ExportSpecifierNode[];
}

interface ExportDefaultNode extends BaseNode {
  declaration: BaseNode;
}

interface ExportAllNode extends BaseNode {
  source?: { value?: unknown };
  exported?: { type: string; name?: string } | null;
}

/** Binding name used for a module's default export. */
export const DEFAULT_EXPORT = 'default';

/** A resolved superclass reference: a bare identifier or a `ns.Member` expression. */
export type SuperRef = { kind: 'identifier'; name: string } | { kind: 'member'; object: string; property: string };

/** The declarations of a single module that binding resolution needs. */
export interface ModuleShape {
  /** Top-level class names → their superclass reference (absent when the class has no `extends`). */
  classes: Map<string, SuperRef | undefined>;
  /** Local binding name → the import it came from (`imported` is `default` for a default import). */
  imports: Map<string, { source: string; imported: string }>;
  /** Local binding name → module specifier, for `import * as ns from '...'`. */
  namespaces: Map<string, string>;
  /** Exported name → the re-export it came from, for `export { x as y } from '...'`. */
  reexports: Map<string, { source: string; imported: string }>;
  /** Exported name → local binding name, for `export { x as y }` without a source. */
  localExports: Map<string, string>;
  /** Module specifiers of bare `export * from '...'` declarations. */
  starExports: string[];
  /** `export default <Identifier>` — the local name it refers to. */
  defaultExportName?: string;
  /** True when the module's default export is a class declaration/expression. */
  defaultExportIsClass?: boolean;
  /** Superclass of an anonymous `export default class extends X`. */
  defaultExportSuper?: SuperRef;
}

function emptyShape(): ModuleShape {
  return {
    classes: new Map(),
    imports: new Map(),
    namespaces: new Map(),
    reexports: new Map(),
    localExports: new Map(),
    starExports: [],
  };
}

// ---------------------------------------------------------------------------
// Shape from a parsed AST (used for the entry module)
// ---------------------------------------------------------------------------

/** Collect the shape of a module from its parsed AST — used for the already-parsed entry module. */
export function shapeFromAst(ast: ProgramBody): ModuleShape {
  const shape = emptyShape();

  for (const node of ast.body) {
    switch (node.type) {
      case 'ClassDeclaration':
        addAstClass(shape, node);
        break;
      case 'ImportDeclaration':
        addAstImports(shape, node);
        break;
      case 'ExportNamedDeclaration':
        addAstNamedExport(shape, node);
        break;
      case 'ExportDefaultDeclaration': {
        const decl = (node as ExportDefaultNode).declaration;
        if (decl.type === 'ClassDeclaration' || decl.type === 'ClassExpression') {
          shape.defaultExportIsClass = true;
          shape.defaultExportSuper = superRefFromNode((decl as ClassNode).superClass);
          // `export default class Foo {}` also binds `Foo` locally.
          addAstClass(shape, decl);
        } else if (decl.type === 'Identifier') {
          shape.defaultExportName = (decl as IdentifierNode).name;
        }
        break;
      }
      case 'ExportAllDeclaration': {
        const starNode = node as ExportAllNode;
        // `export * as ns from '...'` binds a namespace object, not the individual exports.
        const source = starNode.exported ? undefined : asString(starNode.source?.value);
        if (source) shape.starExports.push(source);
        break;
      }
    }
  }

  return shape;
}

function superRefFromNode(superClass: BaseNode | null | undefined): SuperRef | undefined {
  if (!superClass) return undefined;

  if (superClass.type === 'Identifier') {
    return { kind: 'identifier', name: (superClass as IdentifierNode).name };
  }

  if (superClass.type === 'MemberExpression') {
    const member = superClass as MemberExpressionNode;
    const object = member.object?.type === 'Identifier' ? member.object.name : undefined;
    const property = member.property?.name;
    if (object && property) return { kind: 'member', object, property };
  }

  return undefined;
}

function addAstClass(shape: ModuleShape, classNode: ClassNode): void {
  if (classNode.id?.name) shape.classes.set(classNode.id.name, superRefFromNode(classNode.superClass));
}

function addAstImports(shape: ModuleShape, node: ImportDeclarationNode): void {
  const source = asString(node.source?.value);
  if (!source) return;

  for (const specifier of node.specifiers ?? []) {
    const local = specifier.local?.name;
    if (!local) continue;

    if (specifier.type === 'ImportSpecifier' && specifier.imported?.name) {
      shape.imports.set(local, { source, imported: specifier.imported.name });
    } else if (specifier.type === 'ImportDefaultSpecifier') {
      shape.imports.set(local, { source, imported: DEFAULT_EXPORT });
    } else if (specifier.type === 'ImportNamespaceSpecifier') {
      shape.namespaces.set(local, source);
    }
  }
}

function addAstNamedExport(shape: ModuleShape, node: ExportNamedNode): void {
  if (node.declaration?.type === 'ClassDeclaration') {
    addAstClass(shape, node.declaration);
    return;
  }

  const source = asString(node.source?.value);
  for (const specifier of node.specifiers ?? []) {
    const exported = specifier.exported?.name;
    const local = specifier.local?.name;
    if (!exported || !local) continue;

    if (source) {
      shape.reexports.set(exported, { source, imported: local });
    } else {
      shape.localExports.set(exported, local);
    }
  }
}

// ---------------------------------------------------------------------------
// Shape from raw source (used for sibling modules read off disk)
// ---------------------------------------------------------------------------

/**
 * Extract the module shape from **unprocessed source**.
 *
 * Sibling modules are read straight from disk (the plugin context's `load()` would deadlock inside a
 * transform hook), so they may still be TypeScript — which no JS parser will accept. Only
 * import/export statements and `class X extends Y` headers matter here, and those are
 * declaration-level syntax a scan can pick out reliably; class bodies, type annotations and generics
 * are irrelevant and simply skipped.
 */
export function shapeFromSource(rawCode: string): ModuleShape {
  const code = stripComments(rawCode);
  const shape = emptyShape();

  // `class X extends Y {` / `class X<T> extends Y<T> {`, optionally exported and/or abstract.
  const CLASS_RE = /\b(?:export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)([^{]*)\{/g;
  for (const match of code.matchAll(CLASS_RE)) {
    const className = match[1]!;
    const isDefault = /\bexport\s+default\b/.test(match[0]);
    const superRef = superRefFromHeader(match[2] ?? '');

    shape.classes.set(className, superRef);
    if (isDefault) {
      shape.defaultExportIsClass = true;
      shape.defaultExportSuper = superRef;
    }
  }

  // `export default Identifier;`
  const defaultExprMatch = /\bexport\s+default\s+([A-Za-z_$][\w$]*)\s*;/.exec(code);
  if (defaultExprMatch && !shape.defaultExportIsClass) {
    shape.defaultExportName = defaultExprMatch[1];
  }

  // `export * from '...'` (but not `export * as ns from '...'`).
  for (const match of code.matchAll(/\bexport\s*\*\s*from\s*['"]([^'"]+)['"]/g)) {
    if (match[1]) shape.starExports.push(match[1]);
  }

  // `export { a, b as c } from '...'` and `export { a, b as c }`.
  for (const match of code.matchAll(/\bexport\s*\{([^}]*)\}\s*(?:from\s*['"]([^'"]+)['"])?/g)) {
    const source = match[2];
    for (const { imported, local } of parseSpecifierList(match[1] ?? '')) {
      // In an export clause the first name is local and the alias is the exported name.
      if (source) {
        shape.reexports.set(local, { source, imported });
      } else {
        shape.localExports.set(local, imported);
      }
    }
  }

  // `import Default, { a as b }, * as ns from '...'` in its various shapes.
  for (const match of code.matchAll(/\bimport\s+([^'";]+?)\s+from\s*['"]([^'"]+)['"]/g)) {
    addSourceImports(shape, match[1] ?? '', match[2]!);
  }

  return shape;
}

/** Pull the superclass out of the text between a class name and its body. */
function superRefFromHeader(header: string): SuperRef | undefined {
  // The header still carries the class's own generic parameter list (`<T extends S>`), whose
  // constraint `extends` would otherwise be mistaken for the superclass clause. Strip a leading
  // balanced `<...>` first, then read the (possibly dotted) base name. Trailing generic args on the
  // base (`extends Agent<Env>`) stop the match naturally.
  const withoutParams = stripLeadingGenerics(header);
  const match = /\bextends\s+([A-Za-z_$][\w$]*)\s*(?:\.\s*([A-Za-z_$][\w$]*))?/.exec(withoutParams);
  if (!match) return undefined;

  return match[2] ? { kind: 'member', object: match[1]!, property: match[2] } : { kind: 'identifier', name: match[1]! };
}

/**
 * Remove a leading `<...>` generic parameter list, honoring nesting (`<T extends Map<K, V>>`).
 * Anything after the balanced close — the superclass clause — is returned unchanged. When the
 * header doesn't start with `<` (no generics), it is returned as-is.
 */
function stripLeadingGenerics(header: string): string {
  const start = header.indexOf('<');
  // Only treat it as a parameter list when `<` is the first meaningful token — a `<` appearing
  // later is part of the superclass's own generic args and must be left alone.
  if (start === -1 || header.slice(0, start).trim() !== '') return header;

  let depth = 0;
  for (let i = start; i < header.length; i++) {
    const char = header[i];
    if (char === '<') depth++;
    else if (char === '>') {
      depth--;
      if (depth === 0) return header.slice(i + 1);
    }
  }
  // Unbalanced `<` — fall back to the untouched header rather than dropping the superclass.
  return header;
}

/** Parse `a, b as c` into `{ imported: 'b', local: 'c' }` pairs (type-only specifiers dropped). */
function parseSpecifierList(clause: string): Array<{ imported: string; local: string }> {
  const specifiers: Array<{ imported: string; local: string }> = [];

  for (const rawPart of clause.split(',')) {
    const part = rawPart.trim().replace(/^type\s+/, '');
    if (!part) continue;

    const aliased = /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(part);
    if (aliased) {
      specifiers.push({ imported: aliased[1]!, local: aliased[2]! });
    } else if (/^[A-Za-z_$][\w$]*$/.test(part)) {
      specifiers.push({ imported: part, local: part });
    }
  }

  return specifiers;
}

function addSourceImports(shape: ModuleShape, clause: string, source: string): void {
  // Type-only imports never contribute a runtime base class.
  if (/^type\s/.test(clause.trim())) return;

  const namespaceMatch = /\*\s*as\s+([A-Za-z_$][\w$]*)/.exec(clause);
  if (namespaceMatch) {
    shape.namespaces.set(namespaceMatch[1]!, source);
  }

  const bracesMatch = /\{([^}]*)\}/.exec(clause);
  if (bracesMatch) {
    for (const { imported, local } of parseSpecifierList(bracesMatch[1] ?? '')) {
      shape.imports.set(local, { source, imported });
    }
  }

  // A leading bare identifier (before any brace/star) is the default import.
  const defaultMatch = /^\s*([A-Za-z_$][\w$]*)\s*(?:,|$)/.exec(clause);
  if (defaultMatch) {
    shape.imports.set(defaultMatch[1]!, { source, imported: DEFAULT_EXPORT });
  }
}

/** Remove line and block comments, leaving string literals (module specifiers) intact. */
function stripComments(code: string): string {
  let result = '';
  let index = 0;

  while (index < code.length) {
    const char = code[index]!;
    const next = code[index + 1];

    if (char === '/' && next === '/') {
      while (index < code.length && code[index] !== '\n') index++;
      continue;
    }

    if (char === '/' && next === '*') {
      index += 2;
      while (index < code.length && !(code[index] === '*' && code[index + 1] === '/')) index++;
      index += 2;
      // Keep a separator so `*/class` doesn't fuse into one token.
      result += ' ';
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      const quote = char;
      result += char;
      index++;
      while (index < code.length) {
        const inner = code[index]!;
        result += inner;
        index++;
        if (inner === '\\') {
          if (index < code.length) {
            result += code[index]!;
            index++;
          }
          continue;
        }
        if (inner === quote) break;
      }
      continue;
    }

    result += char;
    index++;
  }

  return result;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}
