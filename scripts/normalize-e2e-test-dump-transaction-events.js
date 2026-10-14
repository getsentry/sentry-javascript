// @ts-check
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

const dumpDir = process.argv[2];
if (!dumpDir) {
  throw new Error('Usage: node normalize-e2e-test-dump-transaction-events.js <event-dumps-dir>');
}

const dumpPaths = fs.existsSync(dumpDir)
  ? fs
      .readdirSync(dumpDir)
      .filter(name => name.endsWith('.dump'))
      .map(name => path.join(dumpDir, name))
  : [];

dumpPaths.forEach(dumpPath => {
  const fileContents = fs.readFileSync(dumpPath, 'utf8');

  const transactionNodes = [];

  fileContents.split('\n').forEach(serializedEnvelope => {
    let envelope;
    try {
      envelope = JSON.parse(serializedEnvelope);
    } catch {
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
          if (node?.parent_span_id) {
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

  fs.writeFileSync(
    path.join(path.dirname(dumpPath), `normalized-transactions-${path.basename(dumpPath, '.dump')}.txt`),
    output,
    'utf-8',
  );
});

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
