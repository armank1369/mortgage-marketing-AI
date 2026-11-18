import { useState } from 'react'
import CampaignResponse from './CampaignResponse.jsx'
import PostsResponse from './PostsResponse.jsx'
import ClarificationResponse from './ClarificationResponse.jsx'
import ContentBriefCard from './ContentBriefCard.jsx'
import SocialImageGenerator from './socialImage/SocialImageGenerator.jsx'
import ComplianceNotice from './ComplianceNotice.jsx'
import Section from './Section.jsx'
import { stripReviewNotes, buildCampaignEntryCopy } from '../lib/publicationCopy.js'

const button = 'text-xs rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed'

export default function PersistedMessage({ message: msg, nmls, persona, onAction, disabled = false, providerDisabled = disabled, readOnly = false, legacy = false }) {
  const [copyError, setCopyError] = useState('')
  const locked = readOnly || disabled
  const act = (action, extra = {}) => onAction?.({ action, source_message_id: msg.id, ...extra })
  function mediaProps(collection, index) {
    const target = { collection, index }
    const artifacts = msg.artifacts?.[`${collection}:${index}`] || {}
    const image = artifacts.social_image
    return { durable: true, readOnly, disabled: providerDisabled,
      savedResult: image ? { ...image.structured_data.payload, compliance_flags: image.compliance_flags } : null,
      onGenerate: () => onAction?.({ action: 'social_image', source_message_id: image?.id || msg.id, target }) }
  }
  function campaignProps(index) {
    const artifact = msg.artifacts?.[`content_calendar:${index}`]?.video
    return { durable: true, readOnly, disabled: providerDisabled, imageProps: mediaProps('content_calendar', index),
      onGenerateVideo: () => onAction?.({ action: 'video', source_message_id: artifact?.id || msg.id, target: { collection: 'content_calendar', index } }), artifact }
  }
  const campaign = msg.campaign ? { ...msg.campaign, content_calendar: msg.campaign.content_calendar?.map((entry, index) => {
    const video = campaignProps(index).artifact
    return video ? { ...entry, video: { ...video.video, compliance_flags: video.compliance_flags } } : entry
  }) } : null
  const copy = async () => {
    try { await navigator.clipboard.writeText(stripReviewNotes(msg.text)); setCopyError('') }
    catch { setCopyError('Copy failed. Select the text and copy it manually.') }
  }
  const video = msg.video || {}
  return <article className="space-y-2" data-message-id={msg.id}>
    {msg.role === 'assistant' && <>
      <div className="flex items-center gap-2 text-[11px] text-slate-500">
        <span>{msg.persona_snapshot?.name || (legacy ? 'Local history' : 'Lucie')}</span>
        {!legacy && <span>· Saved</span>}
      </div>
      <ComplianceNotice flags={msg.compliance_flags} />
    </>}
    {msg.role !== 'assistant' ? <div className="flex justify-end"><p className="max-w-[85%] rounded-2xl bg-imessage-blue text-white px-5 py-3 whitespace-pre-wrap text-sm">{msg.text}</p></div>
      : msg.type === 'campaign' ? <CampaignResponse data={campaign} nmls={nmls} persona={persona} batchId={msg.id} complianceFlags={msg.compliance_flags} entryPropsFor={campaignProps} />
        : msg.type === 'posts' ? <PostsResponse data={msg.posts} nmls={nmls} persona={persona} batchId={msg.id} complianceFlags={msg.compliance_flags} imagePropsFor={(index) => mediaProps('posts', index)} />
          : msg.type === 'clarification' ? <ClarificationResponse data={msg.clarification} submitted={msg.submitted} savedAnswers={msg.answers} disabled={locked || providerDisabled} onSubmit={(_text, answers) => act('clarify', { answers })} />
            : msg.type === 'social_image' ? <SocialImageGenerator durable savedResult={{ ...msg.structured_data.payload, compliance_flags: msg.compliance_flags }} readOnly title="Saved social image" />
              : msg.type === 'video' ? <ContentBriefCard title="Saved video script" format="video" script={['intro', 'body', 'cta'].map((key) => ({ label: key, ...video.script?.[key] }))} direction={video.creative_direction || {}} details={video.quick_details || {}} onCopyText={() => buildCampaignEntryCopy({ video })} />
                : <Section icon="💬" title={msg.type === 'unsupported' ? 'Unsupported saved format' : 'AI Response'}>
                  <p className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">{msg.type === 'unsupported' ? 'This response was saved with a newer format. Update the app to view it. Its content remains preserved.' : msg.text}</p>
                </Section>}
    {msg.role === 'assistant' && <div className="flex flex-wrap gap-2">
      {msg.type === 'text' && <button className={button} onClick={copy}>Copy</button>}
      {!readOnly && ['text', 'posts', 'campaign'].includes(msg.type) && <button className={button} disabled={providerDisabled} onClick={() => act('regenerate')}>Regenerate</button>}
      {!readOnly && msg.type === 'text' && <button className={button} disabled={disabled} onClick={() => act('shorten')}>Make it shorter</button>}
    </div>}
    {copyError && <p role="alert" className="text-xs text-red-700">{copyError}</p>}
    {msg.previous?.length > 0 && <details className="rounded-lg border border-slate-200 p-3">
      <summary className="cursor-pointer text-xs text-slate-600">Previous versions ({msg.previous.length})</summary>
      <div className="mt-3 space-y-5">{msg.previous.map((prior) => <PersistedMessage key={prior.id} message={{ ...prior, previous: [] }} nmls={nmls} readOnly />)}</div>
    </details>}
    {Object.values(msg.artifacts || {}).flatMap((types) => Object.values(types)).filter((artifact) => artifact.previous?.length).map((artifact) => <details key={artifact.id} className="rounded-lg border p-3">
      <summary className="text-xs cursor-pointer">Previous {artifact.type === 'social_image' ? 'image' : 'video'} versions</summary>
      {artifact.previous.map((prior) => <PersistedMessage key={prior.id} message={{ ...prior, previous: [] }} nmls={nmls} readOnly />)}
    </details>)}
  </article>
}
