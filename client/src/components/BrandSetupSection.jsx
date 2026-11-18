export default function BrandSetupSection({ number, title, note, children }) {
  return <section className="mb-10">
    <div className="mb-4 flex items-center gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-700 text-xs font-bold text-white">{number}</span>
      <h2 className="text-base font-bold text-slate-900">{title}</h2>
    </div>
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5 sm:p-6">
      {note && <p className="mb-4 text-xs text-slate-500">{note}</p>}
      {children}
    </div>
  </section>
}
