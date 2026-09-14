import DataLoader from 'dataloader';

export const itemLoader = new DataLoader<number, number>(async keys => keys.map(key => key * 2));
