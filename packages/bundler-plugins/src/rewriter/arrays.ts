import type { ArrayExpressionNode, BaseNode, IdentifierNode } from './ast';
import type { RewriteState } from './rewriter';

/**
 * Replace an array literal of identifiers with `build(names)`, where `names`
 * holds each identifier once, in source order. An empty array is left alone.
 * An array holding anything other than plain identifiers is left alone and
 * recorded as skipped under `label`.
 *
 * @returns whether the array was replaced
 */
export function wrapArrayLiteral(
  state: RewriteState,
  arrayNode: BaseNode,
  label: string,
  build: (names: string[]) => string,
): boolean {
  const elements = (arrayNode as ArrayExpressionNode).elements ?? [];
  if (elements.length === 0) return false;

  if (!elements.every(element => element?.type === 'Identifier')) {
    state.report.skipped.push(label);
    return false;
  }

  const names = [...new Set(elements.map(element => (element as IdentifierNode).name))];
  state.ms.overwrite(arrayNode.start, arrayNode.end, build(names));
  state.needsImport = true;
  state.report.wrapped.push(label);
  return true;
}
