export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message)
    this.name = new.target.name
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR')
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string) {
    super(message, 'NOT_FOUND')
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, 'CONFLICT')
  }
}

/** Socket sesi belum siap; user perlu mengirim ulang setelah sesi terhubung. */
export class SessionNotReadyError extends DomainError {
  constructor() {
    super('Sesi belum terhubung. Kirim ulang setelah status Terhubung.', 'SESSION_NOT_READY')
  }
}

/** Socket tidak merespons; user perlu mengirim ulang. */
export class SendTimeoutError extends DomainError {
  constructor() {
    super('Tidak ada respons dari WhatsApp. Kirim ulang.', 'SEND_TIMEOUT')
  }
}
