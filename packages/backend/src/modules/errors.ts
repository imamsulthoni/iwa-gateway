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

export class UnauthorizedError extends DomainError {
  constructor(message = 'Tidak terautentikasi') {
    super(message, 'UNAUTHORIZED')
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'Akses ditolak') {
    super(message, 'FORBIDDEN')
  }
}

/** Nomor sudah terdaftar tetapi belum punya sesi WhatsApp yang ditautkan. */
export class NoSessionError extends DomainError {
  constructor(message = 'Nomor ini belum memiliki sesi WhatsApp') {
    super(message, 'NO_SESSION')
  }
}

/** Kuota akun sales sudah penuh; admin perlu menaikkan batas atau menghapus sales. */
export class SalesLimitReachedError extends DomainError {
  constructor(message = 'Batas jumlah sales tercapai') {
    super(message, 'SALES_LIMIT_REACHED')
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
