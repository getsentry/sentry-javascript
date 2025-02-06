export type FeatureGate = {
  readonly name: string;
  readonly value: boolean;
  // readonly ruleID: string;
  // readonly details: EvaluationDetails;
  // readonly __evaluation: GateEvaluation | null;
};

type EventNameToEventDataMap = {
  gate_evaluation: { gate: FeatureGate };
};

export interface StatsigClient {
  on(
    event: keyof EventNameToEventDataMap,
    callback: (data: EventNameToEventDataMap[keyof EventNameToEventDataMap]) => void,
  ): void;
}
