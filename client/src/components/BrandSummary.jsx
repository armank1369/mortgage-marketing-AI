import { TONE_SCALES } from '../lib/legacyRecovery.js'

export default function BrandSummary({ persona, brand }) {
  return <div className="space-y-5 text-sm text-slate-700">
    <section><h3 className="text-xs uppercase tracking-wide text-slate-500">Selected persona</h3>
      <p className="mt-2 font-semibold">{persona?.name || 'Persona unavailable'}</p><p>{persona?.description}</p></section>
    <section><h3 className="text-xs uppercase tracking-wide text-slate-500">Audience and communication guidance</h3>
      {Object.entries(persona?.audience_profile || {}).map(([key, value]) => <div className="mt-2" key={key}><span className="font-medium">{key.replaceAll('_', ' ')}: </span>
        <span className="whitespace-pre-wrap">{Array.isArray(value) && value.every((item) => typeof item === 'string') ? value.join('; ') : typeof value === 'string' ? value : JSON.stringify(value)}</span></div>)}
      <p className="mt-2 whitespace-pre-wrap">{persona?.prompt_guidance || 'No additional content guidance configured.'}</p></section>
    <section><h3 className="text-xs uppercase tracking-wide text-slate-500">Shared workspace brand</h3>
      <p className="mt-2">{brand?.business_name}</p><p className="whitespace-pre-wrap">{typeof brand?.tone?.voice === 'string' ? brand.tone.voice : 'Brand voice not configured.'}</p>
      <p className="mt-2">Values: {brand?.values?.join(', ') || 'Not configured'}</p>
      <div className="space-y-3 mt-3">{TONE_SCALES.map(([key, left, right]) => <div key={key}><div className="flex justify-between text-xs"><span>{left}</span><span>{right}</span></div>
        <div className="flex gap-1 mt-1" aria-label={`${left} to ${right}: ${brand?.tone?.[key] ?? 'Not configured'}`}>{[1, 2, 3, 4, 5].map((value) => <span key={value} className={`h-2 flex-1 rounded ${brand?.tone?.[key] === value ? 'bg-blue-800' : 'bg-slate-200'}`} />)}</div></div>)}</div></section>
    <p className="text-xs text-slate-500">Current configuration applies to future generations. Saved results retain their historical persona labels and publication copy.</p>
  </div>
}
