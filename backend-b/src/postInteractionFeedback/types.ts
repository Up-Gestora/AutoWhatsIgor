import type { LeadAutoFollowUpClaim, PostInteractionFeedbackCampaignMeta } from '../leads'

export type PostInteractionFeedbackEventName =
  | 'qualified'
  | 'cooldown_skipped'
  | 'active_campaign_skipped'
  | 'initial_message_sent'
  | 'initial_message_failed'
  | 'score_reminder_sent'
  | 'score_received'
  | 'comment_request_sent'
  | 'comment_reminder_sent'
  | 'comment_received'
  | 'offer_sent'
  | 'closed_negative'
  | 'closed_no_score'
  | 'opted_out'

export type PostInteractionFeedbackEventInput = {
  senderSessionId: string
  chatId: string
  phone: string
  sourceSessionId: string
  sourceCompanyName: string
  sourceSystem: 'autowhats' | 'dancing'
  qualificationKey?: string | null
  eventName: PostInteractionFeedbackEventName
  score?: number | null
  payload?: Record<string, unknown>
  occurredAtMs: number
}

export type PostInteractionFeedbackSummary = {
  qualified: number
  approachesSent: number
  feedbacksReceived: number
  averageScore: number
  offersSent: number
  timeoutsNoScore: number
  optOuts: number
}

export type PostInteractionFeedbackSenderLookupStatus =
  | 'ok'
  | 'disabled'
  | 'sender_email_missing'
  | 'sender_lookup_failed'

export type PostInteractionFeedbackSummaryDiagnostics = {
  enabled: boolean
  senderEmail: string | null
  senderSessionId: string | null
  lookupStatus: PostInteractionFeedbackSenderLookupStatus
  failureReason: string | null
  lastScoreAtMs: number | null
  rawScoreEvents: number
  scoreCandidatesDetected: number
  missingScoreEvents: number
  missingCommentEvents: number
}

export type PostInteractionFeedbackSummaryReport = {
  summary: PostInteractionFeedbackSummary
  diagnostics: PostInteractionFeedbackSummaryDiagnostics
}

export type PostInteractionFeedbackDetailsFocus =
  | 'qualified'
  | 'approachesSent'
  | 'feedbacksReceived'
  | 'averageScore'
  | 'offersSent'

export type PostInteractionFeedbackDetailsFilters = {
  fromMs: number
  toMs: number
  focus?: PostInteractionFeedbackDetailsFocus | null
  company?: string | null
  scoreMin?: number | null
  scoreMax?: number | null
  cursor?: string | null
  limit?: number | null
}

export type PostInteractionFeedbackDetailsRow = {
  qualificationKey: string
  score: number
  companyName: string
  phone: string
  feedbackAtMs: number
  sourceSystem: 'autowhats' | 'dancing'
  chatId: string
}

export type PostInteractionFeedbackDetailsByScore = {
  score: number
  count: number
}

export type PostInteractionFeedbackDetailsByCompany = {
  companyName: string
  count: number
  averageScore: number
}

export type PostInteractionFeedbackDetailsByDay = {
  day: string
  count: number
  averageScore: number
}

export type PostInteractionFeedbackDetailsStats = {
  feedbacksReceived: number
  averageScore: number
  byScore: PostInteractionFeedbackDetailsByScore[]
  byCompany: PostInteractionFeedbackDetailsByCompany[]
  byDay: PostInteractionFeedbackDetailsByDay[]
}

export type PostInteractionFeedbackDetailsPageInfo = {
  limit: number
  nextCursor: string | null
  hasMore: boolean
}

export type PostInteractionFeedbackDetailsReport = {
  rows: PostInteractionFeedbackDetailsRow[]
  stats: PostInteractionFeedbackDetailsStats
  pageInfo: PostInteractionFeedbackDetailsPageInfo
}

export type PostInteractionFeedbackSenderResolution = {
  enabled: boolean
  senderEmail: string | null
  sessionId: string | null
  lookupStatus: PostInteractionFeedbackSenderLookupStatus
  failureReason: string | null
}

export type PostInteractionFeedbackRecoveryCandidate = {
  leadId: string | null
  chatId: string
  phone: string
  sourceSessionId: string
  sourceCompanyName: string
  sourceSystem: 'autowhats' | 'dancing'
  qualificationKey: string
  score: number
  comment: string | null
  messageTimestampMs: number
  inboundMessageId: number
  hasScoreEvent: boolean
  hasCommentEvent: boolean
}

export type PostInteractionFeedbackRecoveryPreview = {
  scoreCandidatesDetected: number
  missingScoreEvents: number
  missingCommentEvents: number
  candidates: PostInteractionFeedbackRecoveryCandidate[]
}

export type PostInteractionFeedbackQualifiedEventContext = {
  senderSessionId: string
  chatId: string
  phone: string
  sourceSessionId: string
  sourceCompanyName: string
  sourceSystem: 'autowhats' | 'dancing'
  qualificationKey: string
  qualifiedAtMs: number
  userMessageCount: number
  aiReplyCount: number
  triggerOutboundId: number | null
}

export type PostInteractionFeedbackAiReplySent = {
  sessionId: string
  chatId: string
  inboundId: number
  outboundId: number
}

export type PostInteractionFeedbackQualifiedInteraction = {
  sourceSystem: 'autowhats' | 'dancing'
  sourceSessionId: string
  sourceChatId: string
  whatsapp: string
  contactName?: string | null
  sourceCompanyName?: string | null
  qualifiedAtMs: number
  userMessageCount: number
  aiReplyCount: number
  qualificationKey: string
  triggerOutboundId?: number | null
}

export type PostInteractionFeedbackEnrollmentStatus =
  | 'enrolled'
  | 'duplicate'
  | 'cooldown_skipped'
  | 'active_campaign_skipped'

export type PostInteractionFeedbackEnrollmentResult = {
  status: PostInteractionFeedbackEnrollmentStatus
  senderSessionId: string | null
  leadId?: string
}

export type PostInteractionFeedbackInboundResult = {
  handled: boolean
}

export type PostInteractionFeedbackDueLead = LeadAutoFollowUpClaim & {
  campaignType: 'post_interaction_feedback'
  campaignMeta: PostInteractionFeedbackCampaignMeta
}
