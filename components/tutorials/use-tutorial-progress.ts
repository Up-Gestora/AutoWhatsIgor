'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type StoredProgress = {
  completedTopicIds: string[]
  updatedAt: number
}

const DEFAULT_PROGRESS: StoredProgress = { completedTopicIds: [], updatedAt: 0 }

function safeParseProgress(raw: string | null): StoredProgress {
  if (!raw) return DEFAULT_PROGRESS
  try {
    const parsed = JSON.parse(raw) as Partial<StoredProgress>
    const completedTopicIds = Array.isArray(parsed.completedTopicIds)
      ? parsed.completedTopicIds.filter((id) => typeof id === 'string')
      : []
    const updatedAt = typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0
    return { completedTopicIds, updatedAt }
  } catch {
    return DEFAULT_PROGRESS
  }
}

export function useTutorialProgress(props: { userId?: string | null; topicIds: string[] }) {
  const storageKey = useMemo(() => {
    const keyUser = props.userId ? String(props.userId) : 'anon'
    return `tutorials_progress:${keyUser}`
  }, [props.userId])

  const [completedIds, setCompletedIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = safeParseProgress(window.localStorage.getItem(storageKey))
    setCompletedIds(new Set(stored.completedTopicIds))
  }, [storageKey])

  const persist = useCallback(
    (next: Set<string>) => {
      if (typeof window === 'undefined') return
      const payload: StoredProgress = {
        completedTopicIds: Array.from(next.values()),
        updatedAt: Date.now(),
      }
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(payload))
      } catch {
        // ignore
      }
    },
    [storageKey]
  )

  const toggleCompleted = useCallback(
    (topicId: string) => {
      setCompletedIds((prev) => {
        const next = new Set(prev)
        if (next.has(topicId)) {
          next.delete(topicId)
        } else {
          next.add(topicId)
        }
        persist(next)
        return next
      })
    },
    [persist]
  )

  const isCompleted = useCallback((topicId: string) => completedIds.has(topicId), [completedIds])

  const totalCount = props.topicIds.length
  const completedCount = useMemo(() => {
    if (props.topicIds.length === 0) return 0
    let count = 0
    for (const id of props.topicIds) {
      if (completedIds.has(id)) count += 1
    }
    return count
  }, [completedIds, props.topicIds])

  const percent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0

  return {
    isCompleted,
    toggleCompleted,
    completedCount,
    totalCount,
    percent,
  }
}

