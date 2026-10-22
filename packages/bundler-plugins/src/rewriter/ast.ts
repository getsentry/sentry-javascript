// Minimal ESTree node shapes. Any parser that puts `start`/`end` offsets on
// every node fits (oxc, acorn, Rollup's `this.parse`).

export interface BaseNode {
  type: string;
  start: number;
  end: number;
}

export interface ProgramBody {
  body: BaseNode[];
  hashbang?: BaseNode | null;
}

export interface IdentifierNode extends BaseNode {
  name: string;
}

/** An `Identifier` or, for `export { x as "name" }`, a string `Literal`. */
export interface NameNode {
  type: string;
  name?: string;
  value?: unknown;
}

export interface CallExpressionNode extends BaseNode {
  callee?: { type: string; name?: string; property?: { type: string; name?: string } };
  arguments?: BaseNode[];
}

export interface MemberExpressionNode extends BaseNode {
  object?: { type: string; name?: string };
  property?: { type: string; name?: string };
}

export interface ClassDeclarationNode extends BaseNode {
  id?: IdentifierNode | null;
  superClass?: BaseNode | null;
}

export interface ExportDefaultNode extends BaseNode {
  declaration: BaseNode;
}

export interface ExportSpecifierNode extends BaseNode {
  local?: NameNode;
  exported?: NameNode;
  exportKind?: string;
}

export interface ExportNamedNode extends BaseNode {
  declaration?: BaseNode | null;
  source?: (BaseNode & { value?: unknown }) | null;
  specifiers?: ExportSpecifierNode[];
  exportKind?: string;
}

export interface ExportAllNode extends BaseNode {
  source?: { value?: unknown };
  exported?: NameNode | null;
  exportKind?: string;
}

export interface VariableDeclaratorNode {
  id?: BaseNode | null;
  init?: BaseNode | null;
}

export interface VariableDeclarationNode extends BaseNode {
  declarations?: VariableDeclaratorNode[];
}

export interface ImportSpecifierNode {
  type: string;
  imported?: NameNode;
  local?: NameNode;
  importKind?: string;
}

export interface ImportDeclarationNode extends BaseNode {
  source?: { value?: unknown };
  specifiers?: ImportSpecifierNode[];
  importKind?: string;
}

export interface ArrayExpressionNode extends BaseNode {
  elements?: Array<BaseNode | null>;
}

export interface PropertyNode extends BaseNode {
  key?: NameNode;
  value?: BaseNode;
  computed?: boolean;
}

/** The declaration a top-level statement makes, looking through `export` (`export const x = ...`). */
export function declarationOf(node: BaseNode): BaseNode | null | undefined {
  return node.type === 'ExportNamedDeclaration' ? (node as ExportNamedNode).declaration : node;
}

/** Whether `node` calls `methodName`, either bare (`fn()`) or as a member (`ns.fn()`). */
export function isCallToMethod(node: BaseNode, methodName: string): boolean {
  if (node.type !== 'CallExpression') return false;
  const callee = (node as CallExpressionNode).callee;
  if (!callee) return false;
  if (callee.type === 'Identifier' && callee.name === methodName) return true;
  return (
    callee.type === 'MemberExpression' && callee.property?.type === 'Identifier' && callee.property.name === methodName
  );
}

export function isAnonymousFunctionOrClass(node: BaseNode): boolean {
  if (node.type === 'ArrowFunctionExpression') return true;
  const isFunctionOrClass = [
    'FunctionExpression',
    'FunctionDeclaration',
    'ClassExpression',
    'ClassDeclaration',
  ].includes(node.type);
  return isFunctionOrClass && !(node as ClassDeclarationNode).id;
}

/** `export type { X }` or `export { type X }`, which TypeScript erases. */
export function isTypeOnlyExport(node: { exportKind?: string }): boolean {
  return node.exportKind === 'type';
}

/** The name an export or import specifier refers to, for both `x` and `"x"`. */
export function exportedName(node: NameNode | undefined): string | undefined {
  if (node?.type === 'Identifier') return node.name;
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  return undefined;
}

/**
 * The offset after the hashbang and the directive prologue (`'use server'`),
 * where code may be inserted without changing what the module means.
 */
export function directivesEnd(ast: ProgramBody): number {
  let end = ast.hashbang?.end ?? 0;
  for (const node of ast.body) {
    if (node.type !== 'ExpressionStatement' || typeof (node as { directive?: unknown }).directive !== 'string') break;
    end = node.end;
  }
  return end;
}

/**
 * The binding names a declaration introduces, including names inside
 * destructuring patterns. `undefined` for a declaration that binds no runtime
 * value (`interface`, `type`).
 */
export function declaredNames(declaration: BaseNode): string[] | undefined {
  switch (declaration.type) {
    case 'ClassDeclaration':
    case 'FunctionDeclaration': {
      const name = (declaration as ClassDeclarationNode).id?.name;
      return name ? [name] : undefined;
    }
    case 'VariableDeclaration': {
      const names: string[] = [];
      for (const declarator of (declaration as VariableDeclarationNode).declarations ?? []) {
        collectPatternNames(declarator.id, names);
      }
      return names;
    }
    default:
      return undefined;
  }
}

function collectPatternNames(pattern: BaseNode | null | undefined, names: string[]): void {
  if (!pattern) return;
  const node = pattern as BaseNode & {
    name?: string;
    properties?: Array<BaseNode & { value?: BaseNode; argument?: BaseNode }>;
    elements?: Array<BaseNode | null>;
    left?: BaseNode;
    argument?: BaseNode;
  };
  switch (node.type) {
    case 'Identifier':
      if (node.name) names.push(node.name);
      break;
    case 'ObjectPattern':
      for (const property of node.properties ?? []) {
        collectPatternNames(property.type === 'RestElement' ? property.argument : property.value, names);
      }
      break;
    case 'ArrayPattern':
      for (const element of node.elements ?? []) collectPatternNames(element, names);
      break;
    case 'AssignmentPattern':
      collectPatternNames(node.left, names);
      break;
    case 'RestElement':
      collectPatternNames(node.argument, names);
      break;
  }
}

/** Visit `node` and every node below it, parents first. */
export function walk(node: unknown, visit: (node: BaseNode) => void): void {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (!node || typeof node !== 'object' || typeof (node as BaseNode).type !== 'string') return;

  visit(node as BaseNode);
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') walk(value, visit);
  }
}
