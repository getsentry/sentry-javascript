import { readFileSync } from 'node:fs';
import { DEFAULT_EXPORT, type ModuleShape, shapeFromAst, shapeFromSource, type SuperRef } from './moduleShape';
import type { ProgramBody } from './transform';

/**
 * Agent base classes, keyed by the module specifier they are imported from. A class extending any
 * of these — directly or through a chain of local/imported subclasses — is an `agents` Agent rather
 * than a plain Durable Object.
 *
 * `McpAgent`, `AIChatAgent` and `Think` all extend `Agent` themselves, but they live in packages
 * whose sources we never walk into (see {@link followImport}), so each needs its own entry.
 */
const AGENT_BASE_CLASSES: Record<string, ReadonlySet<string>> = {
  agents: new Set(['Agent']),
  'agents/mcp': new Set(['McpAgent']),
  '@cloudflare/ai-chat': new Set(['AIChatAgent']),
  '@cloudflare/think': new Set(['Think']),
};

/**
 * How many modules deep the base-class chain is followed. Guards against pathological module graphs;
 * real Agent hierarchies are only a few levels deep.
 */
const MAX_DEPTH = 8;

/**
 * The subset of the Vite/Rollup plugin context needed to walk the module graph.
 *
 * `resolve` is optional: without it detection still works, but only for base-class chains declared
 * inside the entry module itself. `readFile` is injectable for tests and defaults to reading disk.
 *
 * Deliberately **no `load`**: awaiting the plugin context's `load()` from inside a `transform` hook
 * deadlocks the build — the module cannot finish loading while its own transform is still pending
 * (Rollup documents this hazard, and Vite's Rolldown pipeline is stricter still). Sibling modules
 * are therefore read straight off disk; see {@link getModuleShape}.
 */
export interface ModuleResolver {
  parse(code: string): ProgramBody;
  resolve?(source: string, importer: string): Promise<{ id: string } | null | undefined>;
  readFile?(id: string): string | undefined;
}

interface DetectContext {
  resolver: ModuleResolver;
  modules: Map<string, ModuleShape | undefined>;
}

/**
 * Find which of `candidates` (top-level class names in the entry module) are Cloudflare
 * [`agents`](https://www.npmjs.com/package/agents) Agents.
 *
 * An Agent is a Durable Object under the hood, so wrangler configures it as one and the transform
 * would otherwise reach for `instrumentDurableObjectWithSentry`. Detecting the Agent base chain lets
 * it pick `instrumentAgentWithSentry` instead, which adds the Agent-specific telemetry on top.
 *
 * Unlike `WorkerEntrypoint` detection, the chain is followed *across* modules: base classes commonly
 * live in their own file (`import { MyBase } from './base'`), and there is no runtime fallback that
 * would catch a missed one. Resolution stops at package boundaries — a base class imported from
 * `node_modules` is only recognized when it is one of {@link AGENT_BASE_CLASSES}.
 */
export async function detectAgentClasses(
  ast: ProgramBody,
  entryId: string,
  candidates: Iterable<string>,
  resolver: ModuleResolver,
): Promise<Set<string>> {
  // The entry's shape comes from the AST Vite already handed us (TypeScript stripped, full
  // fidelity); only sibling modules fall back to source scanning.
  const ctx: DetectContext = { resolver, modules: new Map([[entryId, shapeFromAst(ast)]]) };

  const detected = new Set<string>();
  for (const name of candidates) {
    // A fresh cycle guard per candidate: a shared one would record "not an Agent" for bindings
    // visited while resolving an earlier candidate that turned out to be unrelated.
    if (await isAgentBinding(ctx, entryId, name, 0, new Set())) {
      detected.add(name);
    }
  }
  return detected;
}

/**
 * The entry-module binding names a configured class name could refer to — a class declared under
 * that name, an import of it from another module, a `export { X } from './x'` re-export, or the
 * local binding an `export { Local as Configured }` specifier aliases.
 *
 * Keeps detection (which reads and scans other modules) off names no binding points at.
 */
export function collectAgentCandidates(ast: ProgramBody, configuredNames: Iterable<string>): Set<string> {
  const shape = shapeFromAst(ast);
  const candidates = new Set<string>();

  const isResolvable = (name: string): boolean =>
    shape.classes.has(name) || shape.imports.has(name) || shape.reexports.has(name);

  for (const configured of configuredNames) {
    if (isResolvable(configured)) {
      candidates.add(configured);
    }
    const local = shape.localExports.get(configured);
    if (local && isResolvable(local)) {
      candidates.add(local);
    }
  }

  return candidates;
}

async function isAgentBinding(
  ctx: DetectContext,
  moduleId: string,
  name: string,
  depth: number,
  visited: Set<string>,
): Promise<boolean> {
  if (depth > MAX_DEPTH) return false;

  const key = `${moduleId} ${name}`;
  if (visited.has(key)) return false;
  visited.add(key);

  const shape = await getModuleShape(ctx, moduleId);
  if (!shape) return false;

  if (shape.classes.has(name)) {
    return extendsAgent(ctx, shape, moduleId, shape.classes.get(name), depth, visited);
  }

  const imported = shape.imports.get(name);
  if (imported) {
    return followImport(ctx, moduleId, imported.source, imported.imported, depth, visited);
  }

  if (name === DEFAULT_EXPORT) {
    if (shape.defaultExportIsClass) {
      return extendsAgent(ctx, shape, moduleId, shape.defaultExportSuper, depth, visited);
    }
    if (shape.defaultExportName) {
      return isAgentBinding(ctx, moduleId, shape.defaultExportName, depth + 1, visited);
    }
  }

  // `export { Local as Requested }` — the caller asked by exported name.
  const localName = shape.localExports.get(name);
  if (localName) {
    return isAgentBinding(ctx, moduleId, localName, depth + 1, visited);
  }

  const reexport = shape.reexports.get(name);
  if (reexport) {
    return followImport(ctx, moduleId, reexport.source, reexport.imported, depth, visited);
  }

  // Barrel modules (`export * from './base'`) don't name the binding, so every star source is a
  // candidate home for it.
  for (const source of shape.starExports) {
    if (await followImport(ctx, moduleId, source, name, depth, visited)) {
      return true;
    }
  }

  return false;
}

/**
 * Whether a superclass reference resolves to an Agent base — a bare identifier (imported, or a
 * subclass declared in the same module) or `ns.Agent` off a namespace import.
 */
async function extendsAgent(
  ctx: DetectContext,
  shape: ModuleShape,
  moduleId: string,
  superClass: SuperRef | undefined,
  depth: number,
  visited: Set<string>,
): Promise<boolean> {
  if (!superClass) return false;

  if (superClass.kind === 'identifier') {
    return isAgentBinding(ctx, moduleId, superClass.name, depth + 1, visited);
  }

  const source = shape.namespaces.get(superClass.object);
  if (source) {
    return followImport(ctx, moduleId, source, superClass.property, depth, visited);
  }

  return false;
}

/** Resolve an import to its module and continue the search there, stopping at package boundaries. */
async function followImport(
  ctx: DetectContext,
  importerId: string,
  source: string,
  importedName: string,
  depth: number,
  visited: Set<string>,
): Promise<boolean> {
  if (AGENT_BASE_CLASSES[source]?.has(importedName)) return true;

  if (!ctx.resolver.resolve) return false;

  let resolved: { id: string } | null | undefined;
  try {
    resolved = await ctx.resolver.resolve(source, importerId);
  } catch {
    return false;
  }
  if (!resolved?.id) return false;

  // Third-party sources are not walked: they are large, may not be plain JS by the time we see
  // them, and any Agent base worth knowing about is listed in AGENT_BASE_CLASSES.
  if (resolved.id.includes('/node_modules/') || resolved.id.includes('\\node_modules\\')) return false;

  return isAgentBinding(ctx, resolved.id, importedName, depth + 1, visited);
}

async function getModuleShape(ctx: DetectContext, moduleId: string): Promise<ModuleShape | undefined> {
  if (ctx.modules.has(moduleId)) return ctx.modules.get(moduleId);

  let shape: ModuleShape | undefined;
  try {
    const code = ctx.resolver.readFile
      ? ctx.resolver.readFile(moduleId)
      : readFileSync(moduleId.replace(/[?#].*$/, ''), 'utf8');
    if (typeof code === 'string') {
      shape = shapeFromSource(code);
    }
  } catch {
    // Unreadable or not a source file — treat as "not an Agent" rather than failing the build.
  }

  ctx.modules.set(moduleId, shape);
  return shape;
}
