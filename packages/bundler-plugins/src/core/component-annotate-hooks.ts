import { createOxcComponentNameAnnotateHooks, getOxcParseAstAsync } from './component-annotation-oxc';
import type { ComponentAnnotationTransformMeta, ParseAstAsync } from './component-annotation-oxc-ast';
import type { Logger } from './logger';

const PARSER_UNAVAILABLE_MESSAGE =
  'Could not load `oxc-parser` for this platform. React components will not be annotated.';

// Module level, because the Turbopack loader creates new hooks for
// every file.
let warnedParserUnavailable = false;

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createComponentNameAnnotateHooks(
  ignoredComponents: string[],
  injectIntoHtml: boolean,
  options: { getParseAstAsync?: () => Promise<ParseAstAsync | null>; logger?: Logger } = {},
) {
  const hooks = createOxcComponentNameAnnotateHooks(
    ignoredComponents,
    async () => {
      const parseAstAsync = (await options.getParseAstAsync?.()) ?? (await getOxcParseAstAsync());

      if (!parseAstAsync && !warnedParserUnavailable) {
        warnedParserUnavailable = true;
        if (options.logger) {
          options.logger.warn(PARSER_UNAVAILABLE_MESSAGE);
        } else {
          // eslint-disable-next-line no-console
          console.warn(`[@sentry/bundler-plugins] ${PARSER_UNAVAILABLE_MESSAGE}`);
        }
      }

      return parseAstAsync;
    },
    injectIntoHtml,
  );

  return {
    transform(this: void, code: string, id: string, meta?: ComponentAnnotationTransformMeta) {
      return hooks.transform(code, id, meta);
    },
  };
}
