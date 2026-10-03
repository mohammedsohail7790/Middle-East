/**
 * Client-input error. Named "ValidationError" because the global error
 * handler (middleware/error-handler.ts) maps that name to HTTP 400 instead of
 * the generic 500.
 */
export class InputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
