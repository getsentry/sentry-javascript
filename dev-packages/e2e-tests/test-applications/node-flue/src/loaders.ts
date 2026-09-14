import DataLoader from 'dataloader';

// Exercised through a plain route rather than a tool, so the orchestrion assertion does not depend
// on a model call deciding to invoke it.
export const itemLoader = new DataLoader<number, number>(async keys => keys.map(key => key * 2));
