import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { SEMANTIC_ATTRIBUTE_SENTRY_PARENT_IS_REMOTE } from '../semanticAttributes';

export interface SpanNode {
  id: string;
  span?: ReadableSpan;
  parentNode?: SpanNode | undefined;
  children: SpanNode[];
}

type SpanMap = Map<string, SpanNode>;

/**
 * This function runs through a list of OTEL Spans, and wraps them in an `SpanNode`
 * where each node holds a reference to their parent node.
 */
export function groupSpansWithParents(spans: ReadableSpan[]): SpanNode[] {
  const nodeMap: SpanMap = new Map<string, SpanNode>();

  for (const span of spans) {
    createOrUpdateSpanNodeAndRefs(nodeMap, span);
  }

  return Array.from(nodeMap, function ([_id, spanNode]) {
    return spanNode;
  });
}

function createOrUpdateSpanNodeAndRefs(nodeMap: SpanMap, span: ReadableSpan): void {
  const parentIsRemote = span.attributes[SEMANTIC_ATTRIBUTE_SENTRY_PARENT_IS_REMOTE] === true;

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

function createOrGetParentNode(nodeMap: SpanMap, id: string): SpanNode {
  const existing = nodeMap.get(id);

  if (existing) {
    return existing;
  }

  return createOrUpdateNode(nodeMap, { id, children: [] });
}

function createOrUpdateNode(nodeMap: SpanMap, spanNode: SpanNode): SpanNode {
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
