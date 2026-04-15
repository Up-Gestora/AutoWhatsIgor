'use client'

import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import { ConversationsPanel } from '@/components/conversations/conversations-panel'

export default function ConversasPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [isSubaccount, setIsSubaccount] = useState(false)

  useEffect(() => {
    if (!auth) return

    let cancelled = false
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setUserId(null)
        setIsSubaccount(false)
        return
      }

      setUserId(user.uid)

      if (!db) {
        setIsSubaccount(false)
        return
      }

      try {
        const profileSnapshot = await getDoc(doc(db, 'users', user.uid))
        if (cancelled) {
          return
        }
        const data = profileSnapshot.exists() ? profileSnapshot.data() : null
        setIsSubaccount(data?.accountType === 'subaccount')
      } catch {
        if (!cancelled) {
          setIsSubaccount(false)
        }
      }
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return <ConversationsPanel userId={userId} isSubaccount={isSubaccount} />
}
