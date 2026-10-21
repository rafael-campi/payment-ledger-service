/** A business rule was violated. Mapped to 422 at the HTTP boundary. */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

/** The request contradicts state that already exists. Mapped to 409. */
export class ConflictError extends DomainError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'ConflictError';
  }
}

/** The resource does not exist for this caller. Mapped to 404. */
export class NotFoundError extends DomainError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'NotFoundError';
  }
}
