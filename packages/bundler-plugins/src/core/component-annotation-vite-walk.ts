import type { AstNode, AttributeInsertion, FragmentContext, JSXRootNode } from './component-annotation-vite-ast';
import {
  addPendingAttributes,
  getStringName,
  isJSXElement,
  isJSXRoot,
  toAttributeInsertions,
} from './component-annotation-vite-jsx';
import { isAstNode, isObject, walkAst } from './component-annotation-vite-ast';
import { collectFragmentContext } from './component-annotation-vite-fragments';

type ComponentJSXRoots = { name: string; roots: JSXRootNode[] };

export function collectViteComponentAnnotationInsertions(
  code: string,
  ast: AstNode,
  ignoredComponents: string[],
  sourceFileName: string,
): AttributeInsertion[] {
  const fragmentContext = collectFragmentContext(ast);
  const components = collectComponentJSXRoots(ast);
  const insertionsByOffset = new Map<number, { offset: number; attributeValues: Map<string, string> }>();

  for (const component of components) {
    for (const root of component.roots) {
      processJSX(code, root, component.name, ignoredComponents, fragmentContext, sourceFileName, insertionsByOffset);
    }
  }

  return toAttributeInsertions(insertionsByOffset);
}

function getJSXRootsFromReturnArgument(argument: unknown): JSXRootNode[] {
  if (isJSXRoot(argument)) {
    return [argument];
  }

  if (isObject(argument) && argument.type === 'ConditionalExpression') {
    return [argument.consequent, argument.alternate].filter(isJSXRoot);
  }

  return [];
}

function getReturnedJSXFromFunction(functionNode: AstNode): JSXRootNode[] {
  const body = functionNode.body;

  if (isJSXRoot(body)) {
    return [body];
  }

  if (!isObject(body) || body.type !== 'BlockStatement') {
    return [];
  }

  const bodyStatements = Array.isArray(body.body) ? body.body : [];
  const returnStatement = bodyStatements.find(statement => {
    return isAstNode(statement) && statement.type === 'ReturnStatement';
  });

  return isObject(returnStatement) ? getJSXRootsFromReturnArgument(returnStatement.argument) : [];
}

function pushFunctionComponent(components: ComponentJSXRoots[], nameNode: unknown, functionNode: AstNode): void {
  const name = getStringName(nameNode);

  if (name) {
    components.push({
      name,
      roots: getReturnedJSXFromFunction(functionNode),
    });
  }
}

function collectComponentJSXRoots(ast: AstNode): ComponentJSXRoots[] {
  const components: ComponentJSXRoots[] = [];

  walkAst(ast, node => {
    if (node.type === 'FunctionDeclaration' && isObject(node.id)) {
      pushFunctionComponent(components, node.id, node);
      return;
    }

    if (node.type === 'VariableDeclarator' && isObject(node.id)) {
      if (isAstNode(node.init) && node.init.type === 'ArrowFunctionExpression') {
        pushFunctionComponent(components, node.id, node.init);
      }

      return;
    }

    if (node.type === 'ClassDeclaration') {
      pushClassComponent(components, node);
    }
  });

  return components;
}

function pushClassComponent(components: ComponentJSXRoots[], node: AstNode): void {
  const renderMethodBody = getClassRenderMethodBody(node);

  if (!renderMethodBody) {
    return;
  }

  const roots: JSXRootNode[] = [];

  walkAst(renderMethodBody, child => {
    if (child.type === 'ReturnStatement' && isJSXRoot(child.argument)) {
      roots.push(child.argument);
    }
  });

  components.push({
    name: getStringName(node.id) ?? '',
    roots,
  });
}

function getClassRenderMethodBody(node: AstNode): AstNode | null {
  if (!isObject(node.body) || !Array.isArray(node.body.body)) {
    return null;
  }

  const renderMethod = node.body.body.find(member => {
    return (
      isObject(member) &&
      isObject(member.key) &&
      getStringName(member.key) === 'render' &&
      (isObject(member.value) || isObject(member.body))
    );
  });

  if (!isObject(renderMethod)) {
    return null;
  }

  if (isAstNode(renderMethod.value)) {
    return renderMethod.value;
  }

  return isAstNode(renderMethod) ? renderMethod : null;
}

function processJSX(
  code: string,
  node: JSXRootNode,
  componentName: string,
  ignoredComponents: string[],
  fragmentContext: FragmentContext,
  sourceFileName: string,
  insertionsByOffset: Map<number, { offset: number; attributeValues: Map<string, string> }>,
): void {
  if (isJSXElement(node)) {
    addPendingAttributes(
      code,
      node.openingElement,
      componentName,
      ignoredComponents,
      fragmentContext,
      sourceFileName,
      insertionsByOffset,
    );
  }

  for (const child of node.children ?? []) {
    if (isJSXRoot(child)) {
      processJSX(code, child, '', ignoredComponents, fragmentContext, sourceFileName, insertionsByOffset);
    }
  }
}
