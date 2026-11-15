import { createFileRoute, redirect } from '@tanstack/react-router'

import { getApiKey } from '../lib/auth'

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: getApiKey() ? '/overview' : '/login' })
  },
})
