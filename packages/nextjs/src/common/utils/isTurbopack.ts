export const isTurbopack = process.env.TURBOPACK === '1' || (typeof process !== 'undefined' && 'turbopack' in process && process.turbopack);
