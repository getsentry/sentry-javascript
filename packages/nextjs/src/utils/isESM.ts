/**
 * Determine if the given source code represents a file written using ES6 modules.
 *
 * The regexes used are from https://github.com/component/is-module, which got them from
 * https://github.com/formatjs/js-module-formats, which says it got them from
 * https://github.com/ModuleLoader/es-module-loader, though the originals are now nowhere to be found.
 *
 * @param moduleSource The source code of the module
 * @returns True if the module contains ESM-patterned code, false otherwise.
 */
export function isESM(moduleSource: string): boolean {
  const importExportRegex =
    /(?:^\s*|[}{();,\n]\s*)(import\s+['"]|(import|module)\s+[^"'()\n;]+\s+from\s+['"]|export\s+(\*|\{|default|function|var|const|let|[_$a-zA-Z\xA0-\uFFFF][_$a-zA-Z0-9\xA0-\uFFFF]*))/;
  const exportStarRegex = /(?:^\s*|[}{();,\n]\s*)(export\s*\*\s*from\s*(?:'([^']+)'|"([^"]+)"))/;

  return importExportRegex.test(moduleSource) || exportStarRegex.test(moduleSource);
}
