import { SUPPORTS_REQUIRE_OF_ESM } from '../../utils';

type HonoMajor = {
  major: 4 | 5;
  minNode?: number;
  options: {
    /** Installed in the tmp dir of the suite. Without them, the scenario uses the root dependencies. */
    additionalDependencies?: Record<string, string>;
    failsOnCjs?: boolean;
  };
};

// Exact versions: these are required CI jobs, so a new Hono release must not break them.
// The Hono E2E apps use version ranges and show new releases.
export const HONO_MAJORS: HonoMajor[] = [
  { major: 4, options: {} },
  {
    major: 5,
    minNode: 22,
    options: {
      additionalDependencies: { hono: '5.0.0-rc.1', '@hono/node-server': '2.1.7' },
      // Hono 5 ships only ES modules, and not every runtime can `require()` them.
      failsOnCjs: !SUPPORTS_REQUIRE_OF_ESM,
    },
  },
];
