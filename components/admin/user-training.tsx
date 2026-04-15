'use client'

import { TrainingEditor } from '@/components/training/training-editor'

interface AdminUserTrainingProps {
  userId: string
  userName?: string
}

export function AdminUserTraining({ userId, userName }: AdminUserTrainingProps) {
  if (!userId) {
    return null
  }

  return (
    <TrainingEditor
      targetUserId={userId}
      viewerMode="admin"
      userName={userName}
      showHistory
      showGuidedTutorial={false}
      showCopilotCta={false}
    />
  )
}
