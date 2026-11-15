import type {
  BroadcastCurrentDto,
  CreateBroadcastInput,
  CreateBroadcastResponseDto,
  CreateSessionInput,
  MessageDto,
  MessageListDto,
  PairingResponseDto,
  QrResponseDto,
  SendMessageInput,
  SendMessageResponseDto,
  SessionDto,
  SessionListDto,
  SessionStatusDto,
  SessionTokenDto,
} from './types'

const MINUTE = 60_000
const now = () => Date.now()
const ago = (minutes: number) => new Date(now() - minutes * MINUTE).toISOString()

export const DEMO_TOKEN = 'wsk_live_8c4f2a91d7e3b6'

const sessions: SessionDto[] = [
  {
    id: 'demo-jakarta',
    publicId: 'sales-jakarta-01',
    label: 'Rani',
    phoneNumber: '6281233448890',
    status: 'connected',
    lastConnectedAt: ago(2),
    salesId: null,
    agentId: null,
    createdAt: new Date(now() - 3 * 24 * 60 * MINUTE).toISOString(),
  },
  {
    id: 'demo-bandung',
    publicId: 'sales-bandung-02',
    label: 'Dimas',
    phoneNumber: '6281322117788',
    status: 'connected',
    lastConnectedAt: ago(18),
    salesId: null,
    agentId: null,
    createdAt: new Date(now() - 5 * 24 * 60 * MINUTE).toISOString(),
  },
  {
    id: 'demo-surabaya',
    publicId: 'sales-surabaya-03',
    label: 'Ayu',
    phoneNumber: '6281199882233',
    status: 'qr_pending',
    lastConnectedAt: null,
    salesId: null,
    agentId: null,
    createdAt: ago(42),
  },
  {
    id: 'demo-medan',
    publicId: 'sales-medan-04',
    label: 'Bayu',
    phoneNumber: '6281266554433',
    status: 'disconnected',
    lastConnectedAt: ago(240),
    salesId: null,
    agentId: null,
    createdAt: new Date(now() - 9 * 24 * 60 * MINUTE).toISOString(),
  },
  {
    id: 'demo-bali',
    publicId: 'sales-bali-05',
    label: 'Sari',
    phoneNumber: '6287811223344',
    status: 'logged_out',
    lastConnectedAt: ago(1440),
    salesId: null,
    agentId: null,
    createdAt: new Date(now() - 20 * 24 * 60 * MINUTE).toISOString(),
  },
]

const agents: Record<string, string> = {
  'demo-jakarta': 'rani@ops',
  'demo-bandung': 'dimas@ops',
  'demo-surabaya': 'ayu@ops',
  'demo-medan': 'bayu@ops',
  'demo-bali': 'sari@ops',
}

function message(
  sessionId: string,
  to: string,
  referenceId: string,
  body: string,
  status: MessageDto['status'],
  minutesAgo: number,
): MessageDto {
  return {
    id: referenceId,
    sessionId,
    to: `${to}@s.whatsapp.net`,
    referenceId,
    body,
    status,
    waMessageId: status === 'queued' ? null : `3EB0${referenceId.toUpperCase()}`,
    error: status === 'failed' ? 'Nomor tidak terdaftar di WhatsApp' : null,
    createdAt: ago(minutesAgo),
    deletedAt: null,
  }
}

const customers: Record<string, string> = {
  '6281266554433': 'Hendra',
  '6281322117788': 'Maya',
  '6281199882233': 'Rizky',
  '6287811223344': 'Sari',
  '6281244556677': 'Bagas',
  '6281977889900': 'Bagas',
  '6281299887766': 'Tika',
  '62889533445566': 'Nadia',
}

const messages: Record<string, MessageDto[]> = {
  'demo-jakarta': [
    message('demo-jakarta', '6281266554433', 'msg_8841', 'Halo Hendra, promo Ramadan batch 2 dimulai.', 'delivered', 2),
    message('demo-jakarta', '6281322117788', 'bc_ramadan_02', 'Halo Maya, stok kaos premium tersedia lagi.', 'read', 8),
    message('demo-jakarta', '6281266554433', 'msg_8836', 'Pengingat: konsultasi Anda pukul 14.00 WIB.', 'sent', 74),
    message('demo-jakarta', '6281977889900', 'msg_8830', 'Invoice #INV-8890 sudah kami terbitkan.', 'failed', 128),
    message('demo-jakarta', '6281244556677', 'msg_8824', 'Pesanan #A2291 dikirim hari ini via JNE.', 'delivered', 176),
    message('demo-jakarta', '6287811223344', 'msg_8818', 'Terima kasih, pembayaran Anda sudah masuk.', 'read', 204),
    message('demo-jakarta', '6281199882233', 'msg_8812', 'Jadwal pengiriman Anda kami majukan.', 'sent', 238),
  ],
  'demo-bandung': [
    message('demo-bandung', '6281322117788', 'msg_7781', 'Konfirmasi pesanan Anda sudah kami proses.', 'delivered', 21),
    message('demo-bandung', '6281299887766', 'msg_7774', 'Kurir tiba sekitar pukul 15.00 WIB.', 'sent', 96),
  ],
  'demo-surabaya': [
    message(
      'demo-surabaya',
      '62889533445566',
      'msg_6612',
      'Halo Nadia, berikut katalog terbaru untuk bulan ini.',
      'queued',
      33,
    ),
  ],
}

let broadcast: { sessionId: string; data: BroadcastCurrentDto } | null = {
  sessionId: 'demo-jakarta',
  data: {
    jobId: 'job_01HQ9X4K8',
    status: 'running',
    total: 500,
    done: 142,
    sent: 139,
    failed: 3,
    recipients: [
      { id: 1, to: '+62 812 6655 4433', name: 'Hendra', status: 'sent', error: null },
      { id: 2, to: '+62 813 2211 7788', name: 'Maya', status: 'sent', error: null },
      { id: 3, to: '+62 811 9988 2233', name: 'Rizky', status: 'sent', error: null },
      { id: 4, to: '+62 878 1122 3344', name: 'Sari', status: 'failed', error: 'Nomor tidak aktif' },
      { id: 5, to: '+62 812 4455 6677', name: 'Bagas', status: 'pending', error: null },
    ],
  },
}

function fakeQr(seed = 7): string {
  let state = seed
  const random = () => {
    state = (state * 1103515245 + 12345) % 2147483648
    return state / 2147483648
  }
  const cells: string[] = []
  for (let y = 0; y < 21; y += 1) {
    for (let x = 0; x < 21; x += 1) {
      if (random() > 0.56) cells.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`)
    }
  }
  const finder = (x: number, y: number) =>
    `<rect x="${x}" y="${y}" width="7" height="7" fill="#0A0A0A"/><rect x="${x + 1}" y="${y + 1}" width="5" height="5" fill="#FFFFFF"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3" fill="#0A0A0A"/>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21" shape-rendering="crispEdges"><rect width="21" height="21" fill="#FFFFFF"/><g fill="#0A0A0A">${cells.join('')}</g>${finder(0, 0)}${finder(14, 0)}${finder(0, 14)}</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const pairingCodes: Record<string, string | null> = {
  'demo-surabaya': '4F2A 91KD',
}

export function demoListSessions(): SessionListDto {
  return { items: sessions.map((session) => ({ ...session })), nextCursor: null }
}

export function demoGetSession(id: string): SessionDto {
  const session = sessions.find((item) => item.id === id)
  if (!session) throw new Error('Sesi demo tidak ditemukan')
  return { ...session }
}

export function demoCreateSession(
  input: CreateSessionInput & { agentId?: string },
): SessionTokenDto {
  const publicId = input.publicId ?? `demo-${sessions.length + 1}`
  const session: SessionDto = {
    id: `demo-${Date.now()}`,
    publicId,
    label: input.label,
    phoneNumber: input.phoneNumber ?? null,
    status: 'created',
    lastConnectedAt: null,
    salesId: null,
    agentId: input.agentId ?? null,
    createdAt: new Date().toISOString(),
  }
  sessions.push(session)
  agents[session.id] = input.agentId ?? ''
  messages[session.id] = []
  return { token: DEMO_TOKEN, session }
}

export function demoRemoveSession(id: string): void {
  const index = sessions.findIndex((session) => session.id === id)
  if (index >= 0) sessions.splice(index, 1)
}

export function demoRotateToken(id: string): SessionTokenDto {
  return { token: `${DEMO_TOKEN.slice(0, -4)}${Math.random().toString(16).slice(2, 6)}`, session: demoGetSession(id) }
}

export function demoStatus(id: string): SessionStatusDto {
  const session = demoGetSession(id)
  return {
    status: session.status,
    statusLabel: session.status,
    phoneNumber: session.phoneNumber,
    salesId: session.label,
    agentId: agents[id] ?? null,
  }
}

export function demoQr(id: string): QrResponseDto {
  const session = demoGetSession(id)
  return { qr: session.status === 'connected' || session.status === 'logged_out' ? null : fakeQr(id.length), status: session.status }
}

export function demoPairing(id: string): PairingResponseDto {
  const session = demoGetSession(id)
  return { code: pairingCodes[id] ?? null, status: session.status }
}

export function demoRequestPairing(id: string, phoneNumber: string): void {
  const session = sessions.find((item) => item.id === id)
  if (session) {
    session.phoneNumber = phoneNumber
    session.status = 'connecting'
    pairingCodes[id] = '4F2A 91KD'
  }
}

export function demoLogin(id: string): void {
  const session = sessions.find((item) => item.id === id)
  if (session) session.status = 'connecting'
}

export function demoLogout(id: string): void {
  const session = sessions.find((item) => item.id === id)
  if (session) session.status = 'logged_out'
}

export function demoCurrentBroadcast(id: string): BroadcastCurrentDto {
  if (broadcast?.sessionId === id) return broadcast.data
  return { jobId: null, status: null, total: 0, done: 0, sent: 0, failed: 0, recipients: [] }
}

export function demoStartBroadcast(id: string, input: CreateBroadcastInput): CreateBroadcastResponseDto {
  const recipients = input.recipients.map((recipient, index) => ({
    id: index + 1,
    to: recipient.to,
    name: recipient.name ?? null,
    status: 'pending' as const,
    error: null,
  }))
  const jobId = `job_${Math.random().toString(36).slice(2, 10).toUpperCase()}`
  broadcast = {
    sessionId: id,
    data: {
      jobId,
      status: 'running',
      total: recipients.length,
      done: 0,
      sent: 0,
      failed: 0,
      recipients,
    },
  }
  return { broadcastId: jobId, jobId, status: 'running' }
}

export type HistoryMessageDto = MessageDto & {
  sessionPublicId: string
  customerName: string
}

export function demoListHistory(limit = 50): HistoryMessageDto[] {
  return Object.entries(messages)
    .flatMap(([sessionId, items]) => {
      const publicId = sessions.find((session) => session.id === sessionId)?.publicId ?? sessionId
      return items.map((item) => ({
        ...item,
        sessionPublicId: publicId,
        customerName: customers[(item.to ?? '').split('@')[0] ?? ''] ?? '—',
      }))
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
}

export function demoListMessages(sessionId: string, limit = 20, cursor?: string): MessageListDto {
  const all = messages[sessionId] ?? []
  const start = cursor ? Number(cursor) : 0
  const page = all.slice(start, start + limit)
  const next = start + limit < all.length ? String(start + limit) : null
  return { items: page, nextCursor: next }
}

export function demoSendMessage(sessionId: string, input: SendMessageInput): SendMessageResponseDto {
  const list = messages[sessionId] ?? []
  const created: MessageDto = {
    id: `msg_${Date.now()}`,
    sessionId,
    to: `${input.to}@s.whatsapp.net`,
    referenceId: input.referenceId,
    body: input.text,
    status: 'queued',
    waMessageId: null,
    error: null,
    createdAt: new Date().toISOString(),
    deletedAt: null,
  }
  messages[sessionId] = [created, ...list]
  return { message: created, duplicate: false }
}