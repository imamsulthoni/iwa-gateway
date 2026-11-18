import {
  BROADCAST_STATUSES,
  MESSAGE_DIRECTIONS,
  MESSAGE_STATUSES,
  OPT_OUT_SOURCES,
  RECIPIENT_STATUSES,
  SESSION_STATUSES,
  USER_ROLES,
  type WebhookEventType,
  type WebhookPayload,
} from '@wa/shared'
import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  char,
  datetime,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core'

const createdAt = () =>
  datetime('created_at', { fsp: 3 })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`)

export const apiKeys = mysqlTable(
  'api_keys',
  {
    id: char('id', { length: 36 }).primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    keyHash: char('key_hash', { length: 64 }).notNull(),
    revokedAt: datetime('revoked_at', { fsp: 3 }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('api_keys_key_hash_uq').on(table.keyHash)],
)

export const users = mysqlTable(
  'users',
  {
    id: char('id', { length: 36 }).primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    phoneNumber: varchar('phone_number', { length: 32 }).notNull(),
    role: mysqlEnum('role', [...USER_ROLES]).notNull().default('sales'),
    pinHash: varchar('pin_hash', { length: 255 }).notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: datetime('updated_at', { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (table) => [uniqueIndex('users_phone_number_uq').on(table.phoneNumber)],
)

export const userSessions = mysqlTable(
  'user_sessions',
  {
    id: char('id', { length: 36 }).primaryKey(),
    userId: char('user_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: char('token_hash', { length: 64 }).notNull(),
    expiresAt: datetime('expires_at', { fsp: 3 }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('user_sessions_token_hash_uq').on(table.tokenHash),
    index('user_sessions_user_expires_idx').on(table.userId, table.expiresAt),
  ],
)

export const waSessions = mysqlTable(
  'wa_sessions',
  {
    id: char('id', { length: 36 }).primaryKey(),
    publicId: varchar('public_id', { length: 32 }).notNull(),
    label: varchar('label', { length: 255 }).notNull(),
    engine: mysqlEnum('engine', ['baileys']).notNull().default('baileys'),
    phoneNumber: varchar('phone_number', { length: 32 }),
    status: mysqlEnum('status', [...SESSION_STATUSES])
      .notNull()
      .default('created'),
    lastQr: text('last_qr'),
    lastConnectedAt: datetime('last_connected_at', { fsp: 3 }),
    tokenHash: char('token_hash', { length: 64 }),
    tokenRotatedAt: datetime('token_rotated_at', { fsp: 3 }),
    salesId: varchar('sales_id', { length: 64 }),
    agentId: varchar('agent_id', { length: 64 }),
    dailySendLimit: int('daily_send_limit').notNull().default(200),
    authFormat: varchar('auth_format', { length: 16 }).notNull().default('v7'),
    pairingMethod: mysqlEnum('pairing_method', ['qr', 'code']).notNull().default('qr'),
    createdAt: createdAt(),
    updatedAt: datetime('updated_at', { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (table) => [
    uniqueIndex('wa_sessions_public_id_uq').on(table.publicId),
    uniqueIndex('wa_sessions_phone_uq').on(table.phoneNumber),
  ],
)

export const waAuthCreds = mysqlTable('wa_auth_creds', {
  sessionId: char('session_id', { length: 36 })
    .primaryKey()
    .references(() => waSessions.id, { onDelete: 'cascade' }),
  creds: json('creds').$type<string>().notNull(),
  updatedAt: datetime('updated_at', { fsp: 3 })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`),
})

export const waAuthKeys = mysqlTable(
  'wa_auth_keys',
  {
    sessionId: char('session_id', { length: 36 })
      .notNull()
      .references(() => waSessions.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 50 }).notNull(),
    keyId: varchar('key_id', { length: 191 }).notNull(),
    value: json('value').$type<string>().notNull(),
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.type, table.keyId] })],
)

export const conversations = mysqlTable(
  'conversations',
  {
    id: char('id', { length: 36 }).primaryKey(),
    sessionId: char('session_id', { length: 36 })
      .notNull()
      .references(() => waSessions.id, { onDelete: 'cascade' }),
    waJid: varchar('wa_jid', { length: 191 }).notNull(),
    waJidAlt: varchar('wa_jid_alt', { length: 191 }),
    lastMessageAt: datetime('last_message_at', { fsp: 3 }),
    unreadCount: int('unread_count').notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('conversations_session_jid_uq').on(table.sessionId, table.waJid),
    index('conversations_session_recent').on(
      table.sessionId,
      sql.raw(`${table.lastMessageAt.name} DESC`),
    ),
  ],
)

export const messages = mysqlTable(
  'messages',
  {
    id: char('id', { length: 36 }).primaryKey(),
    conversationId: char('conversation_id', { length: 36 }).references(() => conversations.id, {
      onDelete: 'cascade',
    }),
    sessionId: char('session_id', { length: 36 })
      .notNull()
      .references(() => waSessions.id, { onDelete: 'cascade' }),
    waMessageId: varchar('wa_message_id', { length: 191 }),
    clientRef: varchar('client_ref', { length: 191 }),
    direction: mysqlEnum('direction', [...MESSAGE_DIRECTIONS])
      .notNull()
      .default('out'),
    type: varchar('type', { length: 32 }).notNull().default('text'),
    body: text('body'),
    raw: json('raw'),
    status: mysqlEnum('status', [...MESSAGE_STATUSES])
      .notNull()
      .default('queued'),
    error: text('error'),
    toJid: varchar('to_jid', { length: 191 }),
    customerId: varchar('customer_id', { length: 64 }),
    customerName: varchar('customer_name', { length: 255 }),
    broadcastId: char('broadcast_id', { length: 36 }),
    createdAt: createdAt(),
    waTimestamp: datetime('wa_timestamp', { fsp: 3 }),
    deletedAt: datetime('deleted_at', { fsp: 3 }),
  },
  (table) => [
    uniqueIndex('messages_client_ref_uq').on(table.sessionId, table.clientRef),
    uniqueIndex('messages_session_wa_id_uq').on(table.sessionId, table.waMessageId),
    index('messages_conv_time').on(table.conversationId, sql.raw(`${table.createdAt.name} DESC`)),
    index('messages_session_created_idx').on(table.sessionId, table.createdAt),
    index('messages_created_idx').on(table.createdAt),
  ],
)

export const messageStatusEvents = mysqlTable(
  'message_status_events',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    messageId: char('message_id', { length: 36 })
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 32 }).notNull(),
    occurredAt: datetime('occurred_at', { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (table) => [index('message_status_events_message_idx').on(table.messageId)],
)

export const optOuts = mysqlTable(
  'opt_outs',
  {
    id: char('id', { length: 36 }).primaryKey(),
    phoneE164: varchar('phone_e164', { length: 32 }).notNull(),
    source: mysqlEnum('source', [...OPT_OUT_SOURCES])
      .notNull()
      .default('keyword'),
    optedOutAt: datetime('opted_out_at', { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (table) => [uniqueIndex('opt_outs_phone_uq').on(table.phoneE164)],
)

export const broadcasts = mysqlTable(
  'broadcasts',
  {
    id: char('id', { length: 36 }).primaryKey(),
    sessionId: char('session_id', { length: 36 })
      .notNull()
      .references(() => waSessions.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    status: mysqlEnum('status', [...BROADCAST_STATUSES])
      .notNull()
      .default('pending'),
    minDelayMs: int('min_delay_ms').notNull().default(5000),
    maxDelayMs: int('max_delay_ms').notNull().default(15000),
    clientRef: varchar('client_ref', { length: 191 }),
    scheduledAt: datetime('scheduled_at', { fsp: 3 }),
    startedAt: datetime('started_at', { fsp: 3 }),
    finishedAt: datetime('finished_at', { fsp: 3 }),
    pauseReason: text('pause_reason'),
    createdAt: createdAt(),
    updatedAt: datetime('updated_at', { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (table) => [
    uniqueIndex('broadcasts_client_ref_uq').on(table.sessionId, table.clientRef),
    index('broadcasts_session_created_idx').on(table.sessionId, table.createdAt),
  ],
)

export const broadcastRecipients = mysqlTable(
  'broadcast_recipients',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    broadcastId: char('broadcast_id', { length: 36 })
      .notNull()
      .references(() => broadcasts.id, { onDelete: 'cascade' }),
    toJid: varchar('to_jid', { length: 191 }).notNull(),
    name: varchar('name', { length: 255 }),
    messageId: char('message_id', { length: 36 }),
    status: mysqlEnum('status', [...RECIPIENT_STATUSES])
      .notNull()
      .default('pending'),
    error: text('error'),
  },
  (table) => [uniqueIndex('broadcast_recipients_to_uq').on(table.broadcastId, table.toJid)],
)

export const webhookEndpoints = mysqlTable('webhook_endpoints', {
  id: char('id', { length: 36 }).primaryKey(),
  url: text('url').notNull(),
  secret: varchar('secret', { length: 255 }).notNull(),
  events: json('events').$type<WebhookEventType[]>().notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
})

export const webhookDeliveries = mysqlTable(
  'webhook_deliveries',
  {
    id: char('id', { length: 36 }).primaryKey(),
    endpointId: char('endpoint_id', { length: 36 })
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    payload: json('payload').$type<WebhookPayload>().notNull(),
    status: mysqlEnum('status', ['pending', 'delivered', 'failed']).notNull().default('pending'),
    attempts: int('attempts').notNull().default(0),
    nextAttemptAt: datetime('next_attempt_at', { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
    lastStatusCode: int('last_status_code'),
    lastError: text('last_error'),
    createdAt: createdAt(),
  },
  (table) => [
    index('webhook_deliveries_due').on(table.status, table.nextAttemptAt),
    index('webhook_deliveries_endpoint_fk').on(table.endpointId),
  ],
)

export type ApiKeyRow = typeof apiKeys.$inferSelect
export type UserRow = typeof users.$inferSelect
export type UserSessionRow = typeof userSessions.$inferSelect
export type WaSessionRow = typeof waSessions.$inferSelect
export type WaAuthCredsRow = typeof waAuthCreds.$inferSelect
export type WaAuthKeyRow = typeof waAuthKeys.$inferSelect
export type ConversationRow = typeof conversations.$inferSelect
export type MessageRow = typeof messages.$inferSelect
export type MessageStatusEventRow = typeof messageStatusEvents.$inferSelect
export type OptOutRow = typeof optOuts.$inferSelect
export type BroadcastRow = typeof broadcasts.$inferSelect
export type BroadcastRecipientRow = typeof broadcastRecipients.$inferSelect
export type WebhookEndpointRow = typeof webhookEndpoints.$inferSelect
export type WebhookDeliveryRow = typeof webhookDeliveries.$inferSelect
