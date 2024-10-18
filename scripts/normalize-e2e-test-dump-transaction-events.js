/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

if (process.argv.length < 4) {
  throw new Error('Please provide an input and output file path as an argument.');
}

const resolvedInputPath = path.resolve(process.argv[2]);
const resolvedOutputPath = path.resolve(process.argv[3]);

const fileContents = fs.readFileSync(resolvedInputPath, 'utf8');

const transactionNodes = [];

fileContents.split('\n').forEach(serializedEnvelope => {
  let envelope;
  try {
    envelope = JSON.parse(serializedEnvelope);
  } catch (e) {
    return;
    // noop
  }

  const envelopeItems = envelope[1];

  envelopeItems.forEach(([envelopeItemHeader, transaction]) => {
    if (envelopeItemHeader.type === 'transaction') {
      const rootNode = {
        runtime: transaction.contexts.runtime?.name,
        op: transaction.contexts.trace.op,
        name: transaction.transaction,
        children: [],
      };

      const spanMap = new Map();
      spanMap.set(transaction.contexts.trace.span_id, rootNode);

      transaction.spans.forEach(span => {
        const node = {
          op: span.data['sentry.op'],
          name: span.description,
          parent_span_id: span.parent_span_id,
          children: [],
        };
        spanMap.set(span.span_id, node);
      });

      transaction.spans.forEach(span => {
        const node = spanMap.get(span.span_id);
        if (node && node.parent_span_id) {
          const parentNode = spanMap.get(node.parent_span_id);
          parentNode.children.push(node);
        }
      });

      transactionNodes.push(rootNode);
    }
  });
});

const output = transactionNodes
  .sort((a, b) => {
    const aSerialized = serializeNode(a);
    const bSerialized = serializeNode(b);
    if (aSerialized < bSerialized) {
      return -1;
    } else if (aSerialized > bSerialized) {
      return 1;
    } else {
      return 0;
    }
  })
  .map(node => buildDeterministicStringFromNode(node))
  .join('\n\n-----------------------\n\n');

fs.writeFileSync(resolvedOutputPath, output, 'utf-8');

// ------- utility fns ----------

function buildDeterministicStringFromNode(node, depth = 0) {
  const mainParts = [];
  if (node.runtime) {
    mainParts.push(`(${node.runtime})`);
  }
  mainParts.push(`${node.op ?? 'default'} -`);
  mainParts.push(node.name);
  const main = mainParts.join(' ');
  const children = node.children
    .sort((a, b) => {
      const aSerialized = serializeNode(a);
      const bSerialized = serializeNode(b);
      if (aSerialized < bSerialized) {
        return -1;
      } else if (aSerialized > bSerialized) {
        return 1;
      } else {
        return 0;
      }
    })
    .map(child => '\n' + buildDeterministicStringFromNode(child, depth + 1))
    .join('');
  return `${main}${children}`.split('\n').join('\n  ');
}

function serializeNode(node) {
  return [node.op, node.name, node.runtime].join('---');
}
