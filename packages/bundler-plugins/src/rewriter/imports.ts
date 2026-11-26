import type { ImportDeclarationNode, ProgramBody } from './ast';
import { directivesEnd, exportedName } from './ast';
import type { RewriteState } from './rewriter';

/** Whether the module already binds `name` to the export of the same name from `module`. */
export function hasImport(ast: ProgramBody, module: string, name: string): boolean {
  return ast.body.some(node => {
    if (node.type !== 'ImportDeclaration') return false;
    const importNode = node as ImportDeclarationNode;
    if (importNode.source?.value !== module || importNode.importKind === 'type') return false;
    return (importNode.specifiers ?? []).some(
      specifier =>
        specifier.type === 'ImportSpecifier' &&
        specifier.importKind !== 'type' &&
        exportedName(specifier.imported) === name &&
        specifier.local?.name === name,
    );
  });
}

/** Adds an import statement after the hashbang and directives, once per module. */
export function addImport(state: RewriteState, ast: ProgramBody, statement: string): void {
  if (state.imports.has(statement)) return;
  state.imports.add(statement);

  const position = directivesEnd(ast);
  state.ms.appendLeft(position, position === 0 ? `${statement}\n` : `\n${statement}`);
}
