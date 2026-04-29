export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  meta?: Record<string, any>;
}

export const successResponse = <T>(
  data: T,
  message = 'Success',
  meta?: Record<string, any>,
): ApiResponse<T> => ({ success: true, message, data, ...(meta && { meta }) });

export const errorResponse = (message: string): ApiResponse =>
  ({ success: false, message });