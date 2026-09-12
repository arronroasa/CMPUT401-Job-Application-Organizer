export interface ApiResponse<T> {
  data: T;
  error?: string;
  status: number;
}

export const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export const MOCK_DELAY_MS = 120;
