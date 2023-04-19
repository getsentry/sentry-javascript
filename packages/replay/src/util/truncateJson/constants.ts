export const OBJ = 'OBJ' as const;
export const OBJ_KEY = 'OBJ_KEY' as const;
export const OBJ_KEY_STR = 'OBJ_KEY_STR' as const;
export const OBJ_VAL = 'OBJ_VAL' as const;
export const OBJ_VAL_STR = 'OBJ_VAL_STR' as const;
export const OBJ_VAL_COMPLETED = 'OBJ_VAL_COMPLETED' as const;

export const ARR = 'ARR' as const;
export const ARR_VAL = 'ARR_VAL' as const;
export const ARR_VAL_STR = 'ARR_VAL_STR' as const;
export const ARR_VAL_COMPLETED = 'ARR_VAL_COMPLETED' as const;

export type JsonToken =
  | typeof OBJ
  | typeof OBJ_KEY
  | typeof OBJ_KEY_STR
  | typeof OBJ_VAL
  | typeof OBJ_VAL_STR
  | typeof OBJ_VAL_COMPLETED
  | typeof ARR
  | typeof ARR_VAL
  | typeof ARR_VAL_STR
  | typeof ARR_VAL_COMPLETED;
