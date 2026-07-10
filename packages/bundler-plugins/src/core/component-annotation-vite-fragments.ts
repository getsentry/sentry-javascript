import type { AstNode, FragmentContext } from './component-annotation-vite-ast';
import { isAstNode, isObjectLike, walkAst } from './component-annotation-vite-ast';
import { getStringName } from './component-annotation-vite-jsx';

export function collectFragmentContext(ast: AstNode): FragmentContext {
  const context: FragmentContext = {
    fragmentAliases: new Set<string>(),
    reactNamespaceAliases: new Set<string>(['React']),
  };

  walkAst(ast, node => {
    collectFragmentAliasesFromImport(node, context);
    collectFragmentAliasesFromVariableDeclarator(node, context);
  });

  return context;
}

function collectFragmentAliasesFromImport(node: AstNode, context: FragmentContext): void {
  if (node.type !== 'ImportDeclaration' || !isObjectLike(node.source)) {
    return;
  }

  const source = node.source.value;
  if (source !== 'react' && source !== 'React') {
    return;
  }

  const specifiers = Array.isArray(node.specifiers) ? node.specifiers : [];

  for (const specifier of specifiers) {
    if (!isAstNode(specifier) || !isObjectLike(specifier.local)) {
      continue;
    }

    const localName = getStringName(specifier.local);
    if (!localName) {
      continue;
    }

    if (specifier.type === 'ImportDefaultSpecifier' || specifier.type === 'ImportNamespaceSpecifier') {
      context.reactNamespaceAliases.add(localName);
    } else if (isImportedReactFragment(specifier)) {
      context.fragmentAliases.add(localName);
    }
  }
}

function collectFragmentAliasesFromVariableDeclarator(node: AstNode, context: FragmentContext): void {
  if (node.type !== 'VariableDeclarator' || !isObjectLike(node.id) || !isObjectLike(node.init)) {
    return;
  }

  if (node.id.type === 'Identifier') {
    collectFragmentAliasFromIdentifier(node.id, node.init, context);
    return;
  }

  if (node.id.type === 'ObjectPattern') {
    collectFragmentAliasFromObjectPattern(node.id, node.init, context);
  }
}

function collectFragmentAliasFromIdentifier(
  id: Record<string, unknown>,
  init: Record<string, unknown>,
  context: FragmentContext,
): void {
  const localName = getStringName(id);
  if (!localName) {
    return;
  }

  if (init.type === 'Identifier' && context.fragmentAliases.has(getStringName(init) ?? '')) {
    context.fragmentAliases.add(localName);
  }

  if (isReactFragmentMemberExpression(init, context)) {
    context.fragmentAliases.add(localName);
  }
}

function collectFragmentAliasFromObjectPattern(
  id: Record<string, unknown>,
  init: Record<string, unknown>,
  context: FragmentContext,
): void {
  if (
    init.type !== 'Identifier' ||
    !context.reactNamespaceAliases.has(getStringName(init) ?? '') ||
    !Array.isArray(id.properties)
  ) {
    return;
  }

  for (const property of id.properties) {
    if (!isFragmentObjectPatternProperty(property)) {
      continue;
    }

    const localName = getStringName(property.value);
    if (localName) {
      context.fragmentAliases.add(localName);
    }
  }
}

function isImportedReactFragment(specifier: AstNode): boolean {
  return (
    specifier.type === 'ImportSpecifier' &&
    isObjectLike(specifier.imported) &&
    getStringName(specifier.imported) === 'Fragment'
  );
}

function isReactFragmentMemberExpression(init: Record<string, unknown>, context: FragmentContext): boolean {
  return (
    init.type === 'MemberExpression' &&
    isObjectLike(init.object) &&
    isObjectLike(init.property) &&
    context.reactNamespaceAliases.has(getStringName(init.object) ?? '') &&
    getStringName(init.property) === 'Fragment'
  );
}

function isFragmentObjectPatternProperty(property: unknown): property is { value: unknown } {
  return (
    isObjectLike(property) &&
    (property.type === 'Property' || property.type === 'ObjectProperty') &&
    isObjectLike(property.key) &&
    getStringName(property.key) === 'Fragment' &&
    isObjectLike(property.value)
  );
}
