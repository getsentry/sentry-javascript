export const SeverityLevels = ['fatal', 'error', 'warning', 'log', 'info', 'debug', 'critical'] as const;
export type SeverityLevel = typeof SeverityLevels[number];
