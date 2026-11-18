const notices = {
  possible_fair_housing_language: 'Potential fair-housing-sensitive language needs human review.',
  forbidden_word_used: 'A restricted marketing phrase or brand-banned word needs review.',
  restricted_pricing_offer_removed: 'A pricing or promotional offer was withheld. Review the replacement before publishing.',
  possible_respa_review: 'Referral or partnership content needs human RESPA review before publishing.',
  embedded_compliance_note_removed: 'A generated review note was separated from publication copy. Human review is still required.',
}

// UI-only advisory: never feed this text to clipboard/export or model content.
export default function ComplianceNotice({ flags = [] }) {
  const messages = [...new Set(flags)].map((flag) => notices[flag]).filter(Boolean)
  if (!messages.length) return null
  return <aside role="note" aria-label="Compliance review" className="my-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
    <p className="font-semibold">Human review required before publishing</p>
    <ul className="mt-1 list-disc pl-5">{messages.map((message) => <li key={message}>{message}</li>)}</ul>
  </aside>
}
