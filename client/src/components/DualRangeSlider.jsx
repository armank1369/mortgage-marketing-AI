import { useRef } from 'react'

export default function DualRangeSlider({ min = 1, max = 100, value, onChange, disabled = false }) {
  const track = useRef(null)
  const dragging = useRef(null)
  const update = (which, n) => {
    const clamped = Math.max(min, Math.min(max, n))
    onChange(which === 'low' ? [Math.min(clamped, value[1]), value[1]] : [value[0], Math.max(clamped, value[0])])
  }
  const move = (event) => {
    if (!dragging.current || disabled) return
    const rect = track.current.getBoundingClientRect()
    if (rect.width) update(dragging.current, Math.round(min + (event.clientX - rect.left) / rect.width * (max - min)))
  }
  const stop = (event) => {
    dragging.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const pct = (n) => (n - min) / (max - min) * 100
  return <div ref={track} className={`relative h-6 touch-none select-none ${disabled ? 'opacity-50' : ''}`}>
    <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-slate-200" />
    <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-sky-700" style={{ left: `${pct(value[0])}%`, right: `${100 - pct(value[1])}%` }} />
    {['low', 'high'].map((which, index) => <button key={which} type="button" role="slider" disabled={disabled}
      aria-label={index === 0 ? 'Minimum age' : 'Maximum age'} aria-valuemin={index === 0 ? min : value[0]} aria-valuemax={index === 0 ? value[1] : max} aria-valuenow={value[index]}
      className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-sky-700 bg-white shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 active:cursor-grabbing disabled:cursor-not-allowed"
      style={{ left: `${pct(value[index])}%` }}
      onPointerDown={(event) => { if (disabled) return; event.preventDefault(); event.currentTarget.focus(); dragging.current = which; event.currentTarget.setPointerCapture(event.pointerId) }}
      onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={() => { dragging.current = null }}
      onKeyDown={(event) => {
        const next = ({ ArrowRight: value[index] + 1, ArrowUp: value[index] + 1, ArrowLeft: value[index] - 1, ArrowDown: value[index] - 1, Home: min, End: max, PageUp: value[index] + 10, PageDown: value[index] - 10 })[event.key]
        if (next !== undefined) { event.preventDefault(); update(which, next) }
      }} />)}
  </div>
}
