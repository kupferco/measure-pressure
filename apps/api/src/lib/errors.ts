/** An error we intend the client to see. Anything else becomes a generic 500. */
export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, 'bad_request', message, details);
  }
  static unauthorized(message = 'Sign in to continue') {
    return new ApiError(401, 'unauthorized', message);
  }
  static forbidden(message = 'You do not have access to that') {
    return new ApiError(403, 'forbidden', message);
  }
  static notFound(message = 'Not found') {
    return new ApiError(404, 'not_found', message);
  }
  static conflict(message: string) {
    return new ApiError(409, 'conflict', message);
  }
  static tooLarge(message: string) {
    return new ApiError(413, 'payload_too_large', message);
  }
  static unprocessable(message: string, details?: unknown) {
    return new ApiError(422, 'unprocessable', message, details);
  }
  static upstream(message: string) {
    return new ApiError(502, 'upstream_failed', message);
  }
}
