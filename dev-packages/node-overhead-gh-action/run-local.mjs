import { getOverheadMeasurements } from './lib/getOverheadMeasurements.mjs';
import { formatResults } from './lib/markdown-table-formatter.mjs';

async function run() {
  const measurements = await getOverheadMeasurements();

  // eslint-disable-next-line no-console
  console.log(formatResults(undefined, measurements));
}

run();
