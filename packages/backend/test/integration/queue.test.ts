import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { validateEnv } from '../../src/infra/env.js'
import { closeQueues, createQueues, enqueue, type QueueRegistry } from '../../src/infra/queue.js'
import { closeRedis, createRedis, type RedisClient } from '../../src/infra/redis.js'
import { RUN_INTEGRATION } from './setup.js'

const describeIntegration = RUN_INTEGRATION ? describe : describe.skip

describeIntegration('queue Redis', () => {
  let redis: RedisClient
  let queues: QueueRegistry

  beforeAll(() => {
    redis = createRedis(validateEnv().REDIS_URL)
    queues = createQueues(redis)
  })

  afterAll(async () => {
    await closeQueues(queues)
    await closeRedis(redis)
  })

  it('enqueue lalu baca kembali payload job', async () => {
    const jobId = `test-${Date.now()}`
    const payload = { sessionId: 's1', messageId: 'm1' }

    await enqueue(queues.send, 'send-message', payload, jobId)
    const job = await queues.send.getJob(jobId)

    expect(job?.data).toEqual(payload)
    expect(job?.name).toBe('send-message')

    await job?.remove()
  })
})
