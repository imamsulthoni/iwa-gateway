import {
  BROADCAST_STATUSES,
  MESSAGE_DIRECTIONS,
  MESSAGE_STATUSES,
  RECIPIENT_STATUSES,
  SESSION_STATUSES,
} from '@wa/shared'
import { sql } from 'drizzle-orm'
import {
  bigint,
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

export const waSessions = mysqlTable(
  'wa_sessions',
  {
    id: char('id', { length: 36 }).primaryKey(),
    publicId: varchar('public_id', { length: 32 }).notNull(),
    label: varchar('label', { length: 255 }).notNull(),
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

export const messages = mysqlTable(
  'messages',
  {
    id: char('id', { length: 36 }).primaryKey(),
    sessionId: char('session_id', { length: 36 })
      .notNull()
      .references(() => waSessions.id, { onDelete: 'cascade' }),
    waMessageId: varchar('wa_message_id', { length: 191 }),
    referenceId: varchar('reference_id', { length: 191 }),
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
    uniqueIndex('messages_session_reference_uq').on(table.sessionId, table.referenceId),
    uniqueIndex('messages_session_wa_id_uq').on(table.sessionId, table.waMessageId),
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

export const broadcasts = mysqlTable(
  'broadcasts',
  {
    id: char('id', { length: 36 }).primaryKey(),
    sessionId: char('session_id', { length: 36 })
      .notNull()
      .references(() => waSessions.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    template: text('template').notNull(),
    status: mysqlEnum('status', [...BROADCAST_STATUSES])
      .notNull()
      .default('pending'),
    minDelayMs: int('min_delay_ms').notNull().default(10000),
    maxDelayMs: int('max_delay_ms').notNull().default(30000),
    referenceId: varchar('reference_id', { length: 191 }),
    createdAt: createdAt(),
    updatedAt: datetime('updated_at', { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (table) => [
    uniqueIndex('broadcasts_session_reference_uq').on(table.sessionId, table.referenceId),
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
    contactId: char('contact_id', { length: 36 }),
    messageId: char('message_id', { length: 36 }),
    status: mysqlEnum('status', [...RECIPIENT_STATUSES])
      .notNull()
      .default('pending'),
    error: text('error'),
  },
  (table) => [uniqueIndex('broadcast_recipients_to_uq').on(table.broadcastId, table.toJid)],
)

export type ApiKeyRow = typeof apiKeys.$inferSelect
export type WaSessionRow = typeof waSessions.$inferSelect
export type WaAuthCredsRow = typeof waAuthCreds.$inferSelect
export type WaAuthKeyRow = typeof waAuthKeys.$inferSelect
export type MessageRow = typeof messages.$inferSelect
export type MessageStatusEventRow = typeof messageStatusEvents.$inferSelect
export type BroadcastRow = typeof broadcasts.$inferSelect
export type BroadcastRecipientRow = typeof broadcastRecipients.$inferSelect
