import type {
  BaseNode,
  ClassDeclarationNode,
  ExportAllNode,
  ExportDefaultNode,
  ExportNamedNode,
  IdentifierNode,
  ImportDeclarationNode,
  MemberExpressionNode,
  ProgramBody,
} from './ast';
import { exportedName, isTypeOnlyExport } from './ast';
import { langFromId, parseModule } from './parse';

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

/** Collect the shape of a module from its parsed AST. */
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
          shape.defaultExportSuper = superRefFromNode((decl as ClassDeclarationNode).superClass);
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
        const source = starNode.exported || isTypeOnlyExport(starNode) ? undefined : asString(starNode.source?.value);
        if (source) shape.starExports.push(source);
        break;
      }
    }
  }

  return shape;
}

/**
 * Extract the module shape from unprocessed source, such as a sibling module
 * read off disk. Returns `undefined` when the source does not parse.
 */
export function shapeFromSource(code: string, id: string): ModuleShape | undefined {
  const lang = langFromId(id);
  // A module read off disk may hold TypeScript or JSX whatever its id says,
  // and `tsx` reads everything the other dialects do.
  for (const candidate of lang === 'tsx' ? [lang] : [lang, 'tsx' as const]) {
    try {
      return shapeFromAst(parseModule(code, id, candidate));
    } catch {
      // Try the next dialect.
    }
  }
  return undefined;
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

function addAstClass(shape: ModuleShape, classNode: ClassDeclarationNode): void {
  if (classNode.id?.name) shape.classes.set(classNode.id.name, superRefFromNode(classNode.superClass));
}

function addAstImports(shape: ModuleShape, node: ImportDeclarationNode): void {
  const source = asString(node.source?.value);
  // Type-only imports never contribute a runtime base class.
  if (!source || node.importKind === 'type') return;

  for (const specifier of node.specifiers ?? []) {
    const local = specifier.local?.name;
    if (!local || specifier.importKind === 'type') continue;

    const imported = exportedName(specifier.imported);
    if (specifier.type === 'ImportSpecifier' && imported) {
      shape.imports.set(local, { source, imported });
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
  if (isTypeOnlyExport(node)) return;

  const source = asString(node.source?.value);
  for (const specifier of node.specifiers ?? []) {
    const exported = exportedName(specifier.exported);
    const local = exportedName(specifier.local);
    if (!exported || !local || isTypeOnlyExport(specifier)) continue;

    if (source) {
      shape.reexports.set(exported, { source, imported: local });
    } else {
      shape.localExports.set(exported, local);
    }
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}
