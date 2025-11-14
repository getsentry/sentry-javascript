export type SerializedAttributes = Record<string, SerializedAttribute>;
export type SerializedAttribute = (
  | {
      type: 'string';
      value: string;
    }
  | {
      type: 'integer';
      value: number;
    }
  | {
      type: 'double';
      value: number;
    }
  | {
      type: 'boolean';
      value: boolean;
    }
) & { unit?: 'ms' | 's' | 'bytes' | 'count' | 'percent' };
export type SerializedAttributeType = 'string' | 'integer' | 'double' | 'boolean';
