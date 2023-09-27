import { getOtelSpanParent } from '../opentelemetry/spanData';
import type { OtelSpan } from '../types';

export interface OtelSpanNode {
  id: string;
  span?: OtelSpan;
  parentNode?: OtelSpanNode | undefined;
  children: OtelSpanNode[];
}

type OtelSpanMap = Map<string, OtelSpanNode>;

/**
 * This function runs through a list of OTEL Spans, and wraps them in an `OtelSpanNode`
 * where each node holds a reference to their parent node.
 */
export function groupOtelSpansWithParents(otelSpans: OtelSpan[]): OtelSpanNode[] {
  const nodeMap: OtelSpanMap = new Map<string, OtelSpanNode>();

  for (const span of otelSpans) {
    createOrUpdateSpanNodeAndRefs(nodeMap, span);
  }

  return Array.from(nodeMap, function ([_id, spanNode]) {
    return spanNode;
  });
}

function createOrUpdateSpanNodeAndRefs(nodeMap: OtelSpanMap, span: OtelSpan): void {
  const parentSpan = getOtelSpanParent(span);
  const parentIsRemote = parentSpan ? !!parentSpan.spanContext().isRemote : false;

  const id = span.spanContext().spanId;

  // If the parentId is the trace parent ID, we pretend it's undefined
  // As this means the parent exists somewhere else
  const parentId = !parentIsRemote ? span.parentSpanId : undefined;

  if (!parentId) {
    createOrUpdateNode(nodeMap, { id, span, children: [] });
    return;
  }

  // Else make sure to create parent node as well
  // Note that the parent may not know it's parent _yet_, this may be updated in a later pass
  const parentNode = createOrGetParentNode(nodeMap, parentId);
  const node = createOrUpdateNode(nodeMap, { id, span, parentNode, children: [] });
  parentNode.children.push(node);
}

function createOrGetParentNode(nodeMap: OtelSpanMap, id: string): OtelSpanNode {
  const existing = nodeMap.get(id);

  if (existing) {
    return existing;
  }

  return createOrUpdateNode(nodeMap, { id, children: [] });
}

function createOrUpdateNode(nodeMap: OtelSpanMap, spanNode: OtelSpanNode): OtelSpanNode {
  const existing = nodeMap.get(spanNode.id);

  // If span is already set, nothing to do here
  if (existing && existing.span) {
    return existing;
  }

  // If it exists but span is not set yet, we update it
  if (existing && !existing.span) {
    existing.span = spanNode.span;
    existing.parentNode = spanNode.parentNode;
    return existing;
  }

  // Else, we create a new one...
  nodeMap.set(spanNode.id, spanNode);
  return spanNode;
}
