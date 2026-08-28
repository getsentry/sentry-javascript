/**
 * Binding vocabulary shared by the wrangler config reader and the AST transform.
 *
 * It lives apart from `wranglerConfig.ts` so the transform never has to import that module, which
 * pulls in `wrangler` and with it a Node 20+ runtime.
 */

/** Stands in for a class name where a binding targets the module's default export. */
export const DEFAULT_EXPORT = Symbol('defaultExport');

/** The name a binding or an export is known by, either an exported class name or the default export. */
export type ExportName = string | typeof DEFAULT_EXPORT;

export interface SameWorkerBinding {
  bindingName: string;
  className: ExportName;
}
