export const platformSupportsStreaming = (): boolean => !process.env.LAMBDA_TASK_ROOT && !process.env.VERCEL;
