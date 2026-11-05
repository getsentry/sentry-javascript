# MCP semantic attributes

MCP server instrumentation uses the shared constants from `@sentry/conventions/attributes`.
The attribute mapping follows the [OpenTelemetry MCP conventions at e07f4eb](https://github.com/open-telemetry/semantic-conventions-genai/blob/e07f4ebacb08f56db8c4c882d117720333fbca04/docs/gen-ai/mcp.md),
which are in Development. This migration covers attributes, not every recommendation in that document.

## Canonical and legacy attributes

| Canonical attribute            | Source                                                         | Legacy attribute retained                                                       |
| ------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `jsonrpc.request.id`           | Request ID, converted to a string; absent/null IDs are omitted | `mcp.request.id`                                                                |
| `gen_ai.tool.name`             | Tool name for `tools/call`                                     | `mcp.tool.name`                                                                 |
| `gen_ai.prompt.name`           | Prompt name for `prompts/get`                                  | `mcp.prompt.name`                                                               |
| `gen_ai.operation.name`        | `execute_tool`, only for `tools/call`                          | No equivalent                                                                   |
| `gen_ai.prompt.variable.<key>` | Prompt arguments, preserving key case and string values        | `mcp.request.argument.<key>` with its existing lowercase keys and JSON encoding |
| `gen_ai.tool.call.arguments`   | JSON-serialized tool arguments                                 | Existing individual `mcp.request.argument.<key>` attributes                     |
| `gen_ai.tool.call.result`      | JSON-serialized successful tool output                         | Existing `mcp.tool.result.*` attributes                                         |

Both forms are emitted during the transition so existing queries continue to work.
Their values are not always interchangeable: the canonical content attributes represent structured
payloads, while the legacy attributes preserve their existing flattened representation.
Removing legacy attributes requires a separate migration.

## Content capture

Canonical inputs and outputs use the same resolved `recordInputs` and `recordOutputs` options as
legacy content, including the existing `dataCollection.genAI` setting. This migration does not
change option defaults or precedence. Protocol IDs and tool/prompt names do not require content capture.

Tool results include only `content` and `structuredContent`, excluding response-level `_meta`,
continuation state, and other protocol fields. Protocol `_meta` is also omitted from content blocks
and embedded resources; similarly named keys in user-provided arguments or `structuredContent` are preserved.
Following the [MCP tool result specification](https://modelcontextprotocol.io/specification/2026-07-28/server/tools),
`structuredContent` can be any JSON value. Results with `isError: true` or a `resultType` other than
`complete` are omitted from the canonical result attribute. An absent `resultType` is treated as a
legacy complete result. Legacy error and content metadata remain unchanged.

The new tool payload attributes are omitted if serialization fails or the serialized value exceeds
20,000 characters. Prompt variables share a 20,000-character budget for argument keys and values;
variables exceeding that budget are omitted. These are Sentry capture limits, not OpenTelemetry
requirements. JSON payloads are omitted as a whole instead of being truncated into invalid JSON.
The limits do not change legacy attribute behavior.

## Sentry-specific metadata

`mcp.transport` records the transport implementation name, including a custom constructor name.
It is distinct from OpenTelemetry's `network.transport`. Likewise, `mcp.resource.protocol` records
the resource URI scheme, which need not match the network protocol used to communicate with the server.
These Sentry attributes remain separate from their network counterparts.

MCP client/server implementation identity, registered OAuth client identity, progress metadata,
and Sentry span operations are Sentry extensions rather than attributes defined by the OpenTelemetry
MCP registry. Shared conventions record that provenance; using an OpenTelemetry-compatible span name
does not make the Sentry span operation an OpenTelemetry convention.
