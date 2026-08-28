export class AuthHttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AuthHttpError';
    this.status = status;
  }
}

/** True when the server rejected credentials — safe to clear stored refresh token. */
export function isFatalAuthError(error: unknown): boolean {
  if (error instanceof AuthHttpError) {
    return error.status === 401 || error.status === 403;
  }
  return false;
}
