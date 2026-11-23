import { z } from 'zod'

export const sessionIdSchema = z.uuid('sessionId harus UUID wa_sessions.id')
