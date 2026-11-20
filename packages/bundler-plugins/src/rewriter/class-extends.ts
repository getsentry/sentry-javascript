import type {
  BaseNode,
  ClassDeclarationNode,
  IdentifierNode,
  ImportDeclarationNode,
  MemberExpressionNode,
  ProgramBody,
} from './ast';
import { declarationOf } from './ast';

/** A base class, named by the module it is imported from and its export name. */
export interface BaseClassRef {
  module: string;
  name: string;
}

interface BaseBindings {
  /** Local identifiers bound to the named import of the base class. */
  named: Set<string>;
  /** Local identifiers bound to a `* as ns` import of the base module. */
  namespaces: Set<string>;
}

/**
 * Find top-level classes that (transitively, within this module) extend the
 * given base class. A superclass must be a plain identifier (`extends Base`)
 * or member access (`extends ns.Base`).
 *
 * Only same-file base chains are resolvable here; a base class imported from
 * another module under a different name is invisible.
 */
export function findClassesExtending(ast: ProgramBody, base: BaseClassRef): Set<string> {
  const bases = collectBaseImports(ast, base);
  if (bases.named.size === 0 && bases.namespaces.size === 0) {
    return new Set<string>();
  }

  // Every top-level class, including the `export class Foo {}` form.
  const classes = new Map<string, ClassDeclarationNode>();
  for (const node of ast.body) {
    const declaration = declarationOf(node);
    if (declaration?.type !== 'ClassDeclaration') continue;
    const classNode = declaration as ClassDeclarationNode;
    if (classNode.id?.name) classes.set(classNode.id.name, classNode);
  }

  const found = new Set<string>();
  // Iterate to a fixed point so an indirect chain (A extends B extends Base) is
  // fully resolved regardless of declaration order.
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, classNode] of classes) {
      if (found.has(name)) continue;
      if (extendsBase(classNode.superClass, base, bases, found)) {
        found.add(name);
        changed = true;
      }
    }
  }
  return found;
}

function collectBaseImports(ast: ProgramBody, base: BaseClassRef): BaseBindings {
  const named = new Set<string>();
  const namespaces = new Set<string>();
  for (const node of ast.body) {
    if (node.type !== 'ImportDeclaration') continue;
    const importNode = node as ImportDeclarationNode;
    if (importNode.source?.value !== base.module) continue;
    for (const specifier of importNode.specifiers ?? []) {
      if (specifier.type === 'ImportSpecifier' && specifier.imported?.name === base.name && specifier.local?.name) {
        named.add(specifier.local.name);
      } else if (specifier.type === 'ImportNamespaceSpecifier' && specifier.local?.name) {
        namespaces.add(specifier.local.name);
      }
    }
  }
  return { named, namespaces };
}

function extendsBase(
  superClass: BaseNode | null | undefined,
  base: BaseClassRef,
  bases: BaseBindings,
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
      member.property?.name === base.name
    );
  }
  return false;
}
