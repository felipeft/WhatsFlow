export class ApiError extends Error {
  constructor(
    public readonly status: 400 | 404,
    public readonly code: 'INVALID_REQUEST' | 'CONVERSATION_NOT_FOUND',
  ) {
    super(code);
  }
}
