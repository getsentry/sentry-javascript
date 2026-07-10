export type FeatureGate = {
  readonly name: string;
  readonly value: boolean;
};

export type Experiment = {
  readonly name: string;
  // readonly value: Record<string, unknown>;
  readonly groupName: string;
};

export type EventNameToEventDataMap = {
  experiment_evaluation: { experiment: Experiment };
  gate_evaluation: { gate: FeatureGate };
};

export type EventName = keyof EventNameToEventDataMap;

export interface StatsigClient {
  on<T extends EventName>(event: T, callback: (data: EventNameToEventDataMap[T]) => void): void;
}
