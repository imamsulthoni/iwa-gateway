export type MessageStatusUpdate = {
  waMessageId: string
  status: number | string | null
}

export function parseMessagesUpdate(updates: unknown): MessageStatusUpdate[] {
  if (!Array.isArray(updates)) return []
  const parsed: MessageStatusUpdate[] = []
  for (const update of updates) {
    if (typeof update !== 'object' || update === null) continue
    const candidate = update as {
      key?: { id?: string | null }
      update?: { status?: number | string | null }
    }
    const id = candidate.key?.id
    if (!id) continue
    parsed.push({ waMessageId: id, status: candidate.update?.status ?? null })
  }
  return parsed
}
