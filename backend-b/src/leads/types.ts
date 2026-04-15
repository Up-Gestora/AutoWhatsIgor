export type LeadStatus = 'novo' | 'inativo' | 'aguardando' | 'em_processo' | 'cliente'

export type PostInteractionFeedbackCampaignStage =
  | 'awaiting_score'
  | 'awaiting_comment'
  | 'completed_positive'
  | 'completed_negative'
  | 'opted_out'

export type LeadCampaignType = 'onboarding_activation' | 'post_interaction_feedback'

export type PostInteractionFeedbackCampaignMeta = {
  sourceSessionId: string
  sourceChatId: string
  sourceCompanyName: string
  sourceSystem: 'autowhats' | 'dancing'
  qualificationKey: string
  whatsapp: string | null
  qualifiedAtMs: number
  userMessageCount: number
  aiReplyCount: number
  stage: PostInteractionFeedbackCampaignStage
  score: number | null
  comment: string | null
  scorePromptAttempts: number
  commentPromptAttempts: number
  lastPromptAtMs: number | null
  initialSentAtMs: number | null
  completedAtMs: number | null
}

export type LeadCampaignMeta = PostInteractionFeedbackCampaignMeta | null

export type LeadCampaignState = {
  type: LeadCampaignType
  targetSessionId: string
  attempt: number
  meta?: LeadCampaignMeta
}

export type LeadRecord = {
  id: string
  sessionId: string
  name: string | null
  whatsapp: string | null
  chatId: string | null
  aiTag: string | null
  status: LeadStatus
  lastContact: number | null
  nextContact: number | null
  observations: string | null
  createdAt: number | null
  lastMessage: string | null
  source: string | null
  updatedAt: number | null
  campaign: LeadCampaignState | null
}

export type LeadUpdate = {
  name?: string | null
  whatsapp?: string | null
  chatId?: string | null
  aiTag?: string | null
  status?: LeadStatus
  nextContact?: number | null
  observations?: string | null
  campaignType?: LeadCampaignType | null
  campaignTargetSessionId?: string | null
  campaignAttempt?: number
  campaignMeta?: LeadCampaignMeta
}

export type LeadInboundUpsert = {
  sessionId: string
  leadId: string
  name: string | null
  whatsapp: string | null
  chatId: string | null
  lastMessage: string | null
  source: string | null
  lastContactAtMs: number
  createdAtMs: number
}

export type LeadManualUpsert = {
  sessionId: string
  leadId: string
  name?: string | null
  whatsapp?: string | null
  chatId?: string | null
  aiTag?: string | null
  status?: LeadStatus
  lastContactAtMs?: number | null
  nextContactAtMs?: number | null
  observations?: string | null
  createdAtMs?: number | null
  lastMessage?: string | null
  source?: string | null
  campaignType?: LeadCampaignType | null
  campaignTargetSessionId?: string | null
  campaignAttempt?: number
  campaignMeta?: LeadCampaignMeta
}

export type LeadAutoFollowUpClaim = {
  sessionId: string
  leadId: string
  chatId: string
  status: LeadStatus
  nextContactAt: number
  autoFollowUpStep: number
  campaignType: LeadCampaignType | null
  campaignTargetSessionId: string | null
  campaignAttempt: number
  campaignMeta: LeadCampaignMeta
}
