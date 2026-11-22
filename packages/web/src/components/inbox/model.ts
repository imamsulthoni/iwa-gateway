import { MESSAGE_STATUS_LABELS } from '@wbc/shared'

import type { RoomMessageDto } from '../../lib/types'

export type InboxRoom = {
  id: string
  sessionPublicId: string
  sessionStatus: string
  address: string
  waJid: string
  lastMessageAt: string | null
  unreadCount: number
}

const TYPE_LABELS: Record<string, string> = {
  image: 'Gambar',
  video: 'Video',
  audio: 'Audio',
  document: 'Dokumen',
  sticker: 'Stiker',
  location: 'Lokasi',
  contact: 'Kontak',
  poll: 'Polling',
  reaction: 'Reaksi',
  unknown: 'Pesan',
}

export function messageLabel(row: RoomMessageDto): string {
  if (row.type === 'text') return row.body ?? ''
  return TYPE_LABELS[row.type] ?? row.type
}

export function clock(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${hour}:${minute}`
}

export function dayLabel(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const today = new Date()
  const day = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short' })
    .format(date)
    .replace('.', '')
    .toUpperCase()
  const isToday =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  return isToday ? `HARI INI · ${day}` : day
}

export function messageMeta(row: RoomMessageDto): string {
  const who = row.direction === 'in' ? 'PELANGGAN' : 'AGENT'
  const status = row.direction === 'out' ? MESSAGE_STATUS_LABELS[row.status] : null
  return [who, clock(row.createdAt), status].filter(Boolean).join(' · ').toUpperCase()
}

export function initials(address: string): string {
  const digits = address.replace(/\D/g, '')
  return digits.slice(-2) || '—'
}

export function roomPreview(room: InboxRoom): string {
  if (room.unreadCount > 0) return `${room.unreadCount} pesan belum dibaca`
  return 'Tidak ada pesan baru'
}
