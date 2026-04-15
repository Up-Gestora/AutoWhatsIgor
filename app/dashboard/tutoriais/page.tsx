'use client'

import { TutorialsHub } from '@/components/tutorials/tutorials-hub'
import { TutorialsHubEn } from '@/components/tutorials/tutorials-hub-en'
import { useI18n } from '@/lib/i18n/client'

export default function TutoriaisPage() {
  const { locale } = useI18n()

  if (locale === 'en') {
    return <TutorialsHubEn />
  }

  return <TutorialsHub />
}
