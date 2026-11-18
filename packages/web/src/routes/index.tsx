import { createFileRoute, redirect } from '@tanstack/react-router'

import { getAuth, isAdmin } from '../lib/auth'

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    if (!getAuth()) throw redirect({ to: '/login' })
    throw redirect({ to: isAdmin() ? '/overview' : '/numbers' })
  },
})