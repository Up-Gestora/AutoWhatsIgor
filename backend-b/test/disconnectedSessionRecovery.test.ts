import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyRecoveryOutboundKind,
  extractFindmyangelWelcomeBaseRequestId,
  hasNewerChatActivity,
  mergeChatActivities
} from '../src/recovery/disconnectedSessionRecovery'

test('classifyRecoveryOutboundKind classifies backlog request ids', () => {
  assert.equal(classifyRecoveryOutboundKind('ai:175033:0'), 'ai_reply')
  assert.equal(classifyRecoveryOutboundKind('auto_followup:lead:abc:0'), 'auto_followup')
  assert.equal(
    classifyRecoveryOutboundKind('findmyangel:user:uid-1:welcome-v1'),
    'findmyangel_welcome'
  )
  assert.equal(
    classifyRecoveryOutboundKind('findmyangel:user:uid-1:welcome-v1:failover:v1'),
    'findmyangel_welcome'
  )
  assert.equal(
    classifyRecoveryOutboundKind('findmyangel:user:uid-1:welcome-v1:recovery:v1'),
    'findmyangel_welcome'
  )
  assert.equal(classifyRecoveryOutboundKind('manual:message:1'), 'other')
})

test('extractFindmyangelWelcomeBaseRequestId strips failover and recovery suffixes', () => {
  assert.equal(
    extractFindmyangelWelcomeBaseRequestId('findmyangel:user:uid-1:welcome-v1'),
    'findmyangel:user:uid-1:welcome-v1'
  )
  assert.equal(
    extractFindmyangelWelcomeBaseRequestId('findmyangel:user:uid-1:welcome-v1:failover:v1'),
    'findmyangel:user:uid-1:welcome-v1'
  )
  assert.equal(
    extractFindmyangelWelcomeBaseRequestId('findmyangel:user:uid-1:welcome-v1:recovery:v1'),
    'findmyangel:user:uid-1:welcome-v1'
  )
  assert.equal(
    extractFindmyangelWelcomeBaseRequestId('findmyangel:user:uid-1:welcome-v1:recovery:v1:failover:v1'),
    'findmyangel:user:uid-1:welcome-v1'
  )
  assert.equal(extractFindmyangelWelcomeBaseRequestId('ai:123:0'), null)
})

test('chat activity helpers merge and detect newer activity', () => {
  const merged = mergeChatActivities([
    {
      newerUserInbound: false,
      newerPhoneHuman: false,
      newerDashboardHuman: false
    },
    {
      newerUserInbound: true,
      newerPhoneHuman: false,
      newerDashboardHuman: false
    },
    {
      newerUserInbound: false,
      newerPhoneHuman: false,
      newerDashboardHuman: true
    }
  ])

  assert.equal(merged.newerUserInbound, true)
  assert.equal(merged.newerPhoneHuman, false)
  assert.equal(merged.newerDashboardHuman, true)
  assert.equal(hasNewerChatActivity(merged), true)
  assert.equal(
    hasNewerChatActivity({
      newerUserInbound: false,
      newerPhoneHuman: false,
      newerDashboardHuman: false
    }),
    false
  )
})
