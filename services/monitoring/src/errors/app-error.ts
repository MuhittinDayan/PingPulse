export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_FAILED'
  | 'INVALID_JSON'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_ENCODING'
  | 'MISSING_TOKEN'
  | 'INVALID_TOKEN'
  | 'TARGET_NOT_ALLOWED'
  | 'MONITOR_NOT_FOUND'
  | 'MONITOR_ALREADY_EXISTS'
  | 'ROUTE_NOT_FOUND'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}
