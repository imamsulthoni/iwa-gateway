import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'

import { AppShell } from '../components/AppShell'
import { getApiKey, isPreviewMode } from '../lib/auth'

export const Route = createFileRoute('/_auth')({
  beforeLoad: () => {
    if (!getApiKey() && !isPreviewMode()) throw redirect({ to: '/login' })
  },
  component: AuthLayout,
})

function AuthLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
