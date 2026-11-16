import { USER_JID_SUFFIX, normalizePhone } from '../modules/messages/phone.js'

export { phoneFromJid } from '../modules/messages/phone.js'

export function toUserJid(input: string): string {
  return input.includes('@') ? input : `${normalizePhone(input)}${USER_JID_SUFFIX}`
}

export function jidDecode(jid: string): { user: string; server: string } | null {
  const [userPart, server] = jid.split('@')
  if (!userPart || !server) return null
  return { user: userPart.split(':')[0] ?? userPart, server }
}

export function areJidsSameUser(left: string, right: string): boolean {
  const a = jidDecode(left)
  const b = jidDecode(right)
  return Boolean(a && b && a.user === b.user && a.server === b.server)
}

export function isIgnoredJid(jid: string): boolean {
  return jid.endsWith('@g.us') || jid.endsWith('@broadcast') || jid.endsWith('@newsletter')
}

export type ConversationJid = {
  waJid: string
  waJidAlt: string | null
}

export function resolveConversationJid(primary: string, alt?: string | null): ConversationJid {
  const candidates = [primary, alt].filter((jid): jid is string => Boolean(jid))
  const waJid = candidates.find((jid) => jidDecode(jid)?.server === 'lid') ?? primary
  const waJidAlt =
    candidates.find((jid) => jid !== waJid && jidDecode(jid)?.server === 's.whatsapp.net') ?? null
  return { waJid, waJidAlt }
}
