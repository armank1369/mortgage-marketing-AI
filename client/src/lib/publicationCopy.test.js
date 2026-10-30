import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPostCopy, buildCampaignEntryCopy, stripReviewNotes } from './publicationCopy.js'
import { saveChatsToStorage, loadChatsFromStorage, saveCalendarEntriesToStorage, loadCalendarEntriesFromStorage } from '../utils/storage.js'

const footer = 'Synthetic Licensee | NMLS #123456 | DRE #00123456 | Equal Housing Opportunity\nSupplemental disclosure.'

test('post clipboard includes slides and hashtags but ends with disclosure, excluding metadata', () => {
  const post = { script: { hook: 'Education', body: ['First slide', `Closing slide\n\n${footer}`], cta: `Learn more\n\n${footer}` },
    hashtags: ['#Education'], compliance_flags: ['possible_fair_housing_language'], advisory: 'REVIEW_ONLY' }
  const original = structuredClone(post)
  const text = buildPostCopy(post)
  assert.ok(text.includes('First slide') && text.includes('Closing slide') && text.includes('#Education'))
  assert.ok(text.endsWith(footer))
  assert.ok(!text.includes('REVIEW_ONLY') && !text.includes('possible_fair_housing_language'))
  assert.deepEqual(post, original)
})

test('campaign clipboard includes carousel slides and places hashtags before complete disclosure', () => {
  const entry = { caption: `Education\n\n${footer}`, slides: ['First', `Last\n\n${footer}`], hashtags: ['#Education'],
    compliance_flags: ['forbidden_word_used'], advisory: 'REVIEW_ONLY' }
  const text = buildCampaignEntryCopy(entry)
  assert.ok(text.includes('Slide 1: First') && text.includes('Slide 2: Last'))
  assert.ok(text.includes('#Education') && text.endsWith(footer))
  assert.ok(!text.includes('REVIEW_ONLY') && !text.includes('forbidden_word_used'))
})

test('video brief copy keeps script/end card and production details, excluding review flags', () => {
  const entry = { caption: `Education\n\n${footer}`, hashtags: ['#Education'], video: {
    script: { intro: { text: 'Intro' }, body: { text: 'Body' }, cta: { text: `Contact us\n\n[END CARD: ${footer}]` } },
    creative_direction: { camera: 'Medium shot' }, quick_details: { duration: '20s' },
    compliance_flags: ['possible_respa_review'], advisory: 'REVIEW_ONLY' } }
  const text = buildCampaignEntryCopy(entry)
  assert.ok(text.includes('[END CARD:') && text.includes('Medium shot') && text.includes('20s'))
  assert.ok(text.endsWith(footer))
  assert.ok(!text.includes('possible_respa_review') && !text.includes('REVIEW_ONLY'))
})

test('copy excludes recognized legacy inline notes without changing stored history or synthesizing identity', () => {
  const text = `Education\n\n${footer}\n\n⚠️ Compliance note (auto-flagged, human review required): REVIEW_ONLY\nAdvisory continuation.`
  const clean = stripReviewNotes(text)
  assert.ok(clean.endsWith(footer) && !clean.includes('REVIEW_ONLY') && !clean.includes('Advisory continuation'))
  assert.ok(text.includes('REVIEW_ONLY'))
  assert.equal(stripReviewNotes('Legacy text without configured identity'), 'Legacy text without configured identity')
})

test('review flag metadata survives the existing browser chat save/reload path', () => {
  const data = new Map()
  globalThis.localStorage = { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value) }
  const scope = JSON.stringify(['synthetic-user', 'synthetic-workspace'])
  try {
    saveChatsToStorage([{ id: 'chat', persona: null, messages: [{ id: 'reply', role: 'assistant', text: `Education\n\n${footer}`,
      compliance_flags: ['possible_fair_housing_language'] }] }], 'chat', scope)
    const reply = loadChatsFromStorage(scope).chats[0].messages[0]
    assert.deepEqual(reply.compliance_flags, ['possible_fair_housing_language'])
    assert.equal(reply.text, `Education\n\n${footer}`)
    saveCalendarEntriesToStorage([{ id: 'scheduled', date: new Date('2026-10-19T12:00:00Z'),
      details: { script: [{ label: 'Caption', text: reply.text }], compliance_flags: reply.compliance_flags } }], scope)
    const saved = loadCalendarEntriesFromStorage(scope)[0]
    assert.deepEqual(saved.details.compliance_flags, reply.compliance_flags)
    assert.equal(saved.details.script[0].text, reply.text)
  } finally { delete globalThis.localStorage }
})
