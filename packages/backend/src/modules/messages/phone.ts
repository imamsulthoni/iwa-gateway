import { ValidationError } from '../errors.js'

export const USER_JID_SUFFIX = '@s.whatsapp.net'

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  let phone = digits
  if (phone.startsWith('0')) {
    phone = `62${phone.slice(1)}`
  } else if (phone.startsWith('8')) {
    phone = `62${phone}`
  } else if (phone.startsWith('620')) {
    phone = `62${phone.slice(3)}`
  }
  if (phone.length < 8 || phone.length > 15) {
    throw new ValidationError('Nomor harus 8-15 digit dengan kode negara')
  }
  return phone
}

export function toUserJid(raw: string): string {
  return raw.includes('@') ? raw : `${normalizePhone(raw)}${USER_JID_SUFFIX}`
}

export function phoneFromJid(jid: string): string {
  return jid.split('@')[0]?.split(':')[0] ?? jid
}
