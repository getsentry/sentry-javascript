import type * as Sentry from "@sentry/remix";
import type { Integration} from "@sentry/types";

interface ISentry extends Sentry {
  replayIntegration: (options?: unknown) => Integration;
}
