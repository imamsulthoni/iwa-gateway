import { createFileRoute, redirect } from '@tanstack/react-router'

import { getApiKey, isPreviewMode } from '../lib/auth'

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    const signedIn = getApiKey() || isPreviewMode()
    throw redirect({ to: signedIn ? '/overview' : '/login' })
  },
})
