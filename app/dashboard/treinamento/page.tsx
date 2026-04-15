'use client'

import { useAuth } from '@/providers/auth-provider'
import { TrainingEditor } from '@/components/training/training-editor'

export default function TreinamentoPage() {
  const { user } = useAuth()

  if (!user?.uid) {
    return null
  }

  return (
    <TrainingEditor
      targetUserId={user.uid}
      viewerMode="self"
      showHistory
      showGuidedTutorial
      showCopilotCta
    />
  )
}
