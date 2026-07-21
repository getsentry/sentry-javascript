import type { BaseNode, ProgramBody } from './transform';

// ---------------------------------------------------------------------------
// Minimal ESTree node shapes for structural WorkerEntrypoint detection.
// ---------------------------------------------------------------------------

interface IdentifierNode extends BaseNode {
  name: string;
}

interface MemberExpressionNode extends BaseNode {
  object?: { type: string; name?: string };
  property?: { type: string; name?: string };
}

interface ClassDeclarationNode extends BaseNode {
  id?: IdentifierNode | null;
  superClass?: BaseNode | null;
}

interface ExportNamedDeclNode extends BaseNode {
  declaration?: BaseNode | null;
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

interface WorkerEntrypointBases {
  /** Local identifiers bound to the named `WorkerEntrypoint` import. */
  named: Set<string>;
  /** Local identifiers bound to a `* as ns` import of `cloudflare:workers`. */
  namespaces: Set<string>;
}

/**
 * Find top-level classes that (transitively, within this module) extend
 * `WorkerEntrypoint` imported from `cloudflare:workers`. esbuild has already
 * stripped TypeScript by transform time, so a superclass is a plain identifier
 * (`extends WorkerEntrypoint`) or member access (`extends cf.WorkerEntrypoint`).
 *
 * Only same-file base chains are resolvable here; a base class imported from
 * another module is invisible and relies on the config self-binding fallback.
 */
export function detectWorkerEntrypointClasses(ast: ProgramBody): Set<string> {
  const bases = collectWorkerEntrypointImports(ast);
  if (bases.named.size === 0 && bases.namespaces.size === 0) {
    return new Set<string>();
  }

  // Every top-level class, including the `export class Foo {}` form (where the
  // class is nested inside an ExportNamedDeclaration) so directly-exported
  // entrypoints are seen too.
  const classes = new Map<string, ClassDeclarationNode>();
  for (const node of ast.body) {
    const classNode = asClassDeclaration(node);
    if (classNode?.id?.name) classes.set(classNode.id.name, classNode);
  }

  const entrypoints = new Set<string>();
  // Iterate to a fixed point so an indirect chain (A extends B extends WE) is
  // fully resolved regardless of declaration order.
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, classNode] of classes) {
      if (entrypoints.has(name)) continue;
      if (extendsWorkerEntrypoint(classNode.superClass, bases, entrypoints)) {
        entrypoints.add(name);
        changed = true;
      }
    }
  }
  return entrypoints;
}

/** Unwrap `export class Foo {}` to its ClassDeclaration; pass bare classes through. */
function asClassDeclaration(node: BaseNode): ClassDeclarationNode | undefined {
  if (node.type === 'ClassDeclaration') return node as ClassDeclarationNode;
  if (node.type === 'ExportNamedDeclaration') {
    const decl = (node as ExportNamedDeclNode).declaration;
    if (decl?.type === 'ClassDeclaration') return decl as ClassDeclarationNode;
  }
  return undefined;
}

function collectWorkerEntrypointImports(ast: ProgramBody): WorkerEntrypointBases {
  const named = new Set<string>();
  const namespaces = new Set<string>();
  for (const node of ast.body) {
    if (node.type !== 'ImportDeclaration') continue;
    const importNode = node as ImportDeclarationNode;
    if (importNode.source?.value !== 'cloudflare:workers') continue;
    for (const specifier of importNode.specifiers ?? []) {
      if (
        specifier.type === 'ImportSpecifier' &&
        specifier.imported?.name === 'WorkerEntrypoint' &&
        specifier.local?.name
      ) {
        named.add(specifier.local.name);
      } else if (specifier.type === 'ImportNamespaceSpecifier' && specifier.local?.name) {
        namespaces.add(specifier.local.name);
      }
    }
  }
  return { named, namespaces };
}

/**
 * Whether a superclass expression resolves to `WorkerEntrypoint` — either a bare
 * identifier from the named import (or an already-detected local subclass), or a
 * `ns.WorkerEntrypoint` member access off a namespace import.
 */
function extendsWorkerEntrypoint(
  superClass: BaseNode | null | undefined,
  bases: WorkerEntrypointBases,
  detected: Set<string>,
): boolean {
  if (!superClass) return false;
  if (superClass.type === 'Identifier') {
    const name = (superClass as IdentifierNode).name;
    return bases.named.has(name) || detected.has(name);
  }
  if (superClass.type === 'MemberExpression') {
    const member = superClass as MemberExpressionNode;
    return (
      member.object?.type === 'Identifier' &&
      !!member.object.name &&
      bases.namespaces.has(member.object.name) &&
      member.property?.name === 'WorkerEntrypoint'
    );
  }
  return false;
}
