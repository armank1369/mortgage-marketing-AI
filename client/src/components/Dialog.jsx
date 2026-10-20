import { useEffect, useRef } from 'react'

// Native modal provides focus containment, Escape, background inertness and focus restoration.
export default function Dialog({ title, onClose, children }) {
  const ref = useRef(null)
  useEffect(() => { const dialog = ref.current; dialog.showModal(); return () => dialog.close() }, [])
  return <dialog ref={ref} aria-label={title} onCancel={(event) => { event.preventDefault(); onClose() }} className="w-[calc(100%_-_2rem)] max-w-lg max-h-[85dvh] overflow-y-auto rounded-2xl p-6 shadow-xl backdrop:bg-slate-900/50">
    <div className="mb-5 flex justify-between items-center gap-3"><h2 className="font-bold text-slate-900">{title}</h2><button autoFocus type="button" aria-label={`Close ${title}`} onClick={onClose} className="rounded-lg border px-3 py-1">Close</button></div>
    {children}
  </dialog>
}
