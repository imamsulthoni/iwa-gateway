import { ConflictError, NotFoundError, ValidationError } from '../errors.js'

export class InvalidPublicIdError extends ValidationError {
  constructor() {
    super('public_id hanya boleh huruf, angka, _ dan -, maksimal 32 karakter')
  }
}

export class DuplicatePublicIdError extends ConflictError {
  constructor(publicId: string) {
    super(`public_id "${publicId}" sudah dipakai`)
  }
}

export class DuplicatePhoneError extends ConflictError {
  constructor(phoneNumber: string) {
    super(`Nomor ${phoneNumber} sudah dipakai sesi lain`)
  }
}

export class SessionNotFoundError extends NotFoundError {
  constructor() {
    super('Sesi tidak ditemukan')
  }
}
