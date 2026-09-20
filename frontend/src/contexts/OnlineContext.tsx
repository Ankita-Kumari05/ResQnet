// Offline/Online connectivity context — Step 6.14 Policy Reconciled
// Manages network connectivity, offline queue sync triggers, and sync lock guard.
import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { flushSyncQueue } from '../lib/syncEngine'
import { getPendingOpsCount } from '../lib/db'

interface OnlineContextType {
  isOnline: boolean
  pendingOpsCount: number
  isSyncing: boolean
  setPendingOps: (count: number) => void
  triggerSync: (token: string | null) => Promise<void>
}

const OnlineContext = createContext<OnlineContextType>({
  isOnline: true,
  pendingOpsCount: 0,
  isSyncing: false,
  setPendingOps: () => {},
  triggerSync: async () => {},
})

export function OnlineProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [pendingOpsCount, setPendingOps] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)

  // Sync lock guard: prevents overlapping sync executions
  const syncInFlightRef = useRef(false)

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getPendingOpsCount()
      setPendingOps(count)
    } catch {
      // Non-critical
    }
  }, [])

  const triggerSync = useCallback(async (token: string | null) => {
    if (syncInFlightRef.current) return
    if (!token) {
      // No token: retain all local operations, do not attempt sync
      return
    }

    syncInFlightRef.current = true
    setIsSyncing(true)

    try {
      const result = await flushSyncQueue(token)

      if (result.authError) {
        // JWT expired/missing — local operations preserved, do NOT delete them
        // Mark as retryable when auth is restored
        console.warn('[OnlineContext] Sync skipped: authentication required')
      }

      await refreshPendingCount()
    } catch (err) {
      // Transient network/server error — sync engine handles local status updates
      console.warn('[OnlineContext] Sync error (will retry next trigger):', err)
    } finally {
      setIsSyncing(false)
      syncInFlightRef.current = false
    }
  }, [refreshPendingCount])

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      // Trigger 1: Browser online transition
      const token = localStorage.getItem('resqnet_token')
      triggerSync(token)
    }

    const handleOffline = () => {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Trigger 2: App startup — attempt sync if online
    if (navigator.onLine) {
      const token = localStorage.getItem('resqnet_token')
      if (token) {
        triggerSync(token)
      }
    }

    // Initialize pending count
    refreshPendingCount()

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [triggerSync, refreshPendingCount])

  return (
    <OnlineContext.Provider value={{ isOnline, pendingOpsCount, isSyncing, setPendingOps, triggerSync }}>
      {children}
    </OnlineContext.Provider>
  )
}

export function useOnline() {
  return useContext(OnlineContext)
}
