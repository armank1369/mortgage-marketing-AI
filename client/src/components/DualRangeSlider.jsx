import { useRef } from 'react'

export default function DualRangeSlider({ min = 1, max = 100, value, onChange }) {
  const trackRef = useRef(null)
  const draggingRef = useRef(null)

  const valueFromClientX = (clientX) => {
    const rect = trackRef.current.getBoundingClientRect()
    const ratio = (clientX - rect.left) / rect.width
    const clamped = Math.min(Math.max(ratio, 0), 1)
    return Math.round(min + clamped * (max - min))
  }

  const startDrag = (which) => (e) => {
    e.preventDefault()
    draggingRef.current = which
    e.currentTarget.setPointerCapture(e.pointerId)
    const move = (ev) => {
      if (draggingRef.current !== which) return
      const v = valueFromClientX(ev.clientX)
      onChange((prev) => which === 'low' ? [Math.min(v, prev[1]), prev[1]] : [prev[0], Math.max(v, prev[0])])
    }
    const up = (ev) => {
      draggingRef.current = null
      e.currentTarget.releasePointerCapture?.(ev.pointerId)
      e.currentTarget.removeEventListener('pointermove', move)
      e.currentTarget.removeEventListener('pointerup', up)
    }
    e.currentTarget.addEventListener('pointermove', move)
    e.currentTarget.addEventListener('pointerup', up)
  }

  const pct = (v) => ((v - min) / (max - min)) * 100
  const lowPct = pct(value[0])
  const highPct = pct(value[1])

  return (
    <div ref={trackRef} className="relative h-6 select-none touch-none">
      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-slate-200" />
      <div
        className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-slate-900"
        style={{ left: `${lowPct}%`, right: `${100 - highPct}%` }}
      />
      <div
        onPointerDown={startDrag('low')}
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-white border-2 border-slate-900 shadow cursor-grab active:cursor-grabbing"
        style={{ left: `${lowPct}%` }}
        role="slider"
        aria-label="Minimum age"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value[0]}
      />
      <div
        onPointerDown={startDrag('high')}
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-white border-2 border-slate-900 shadow cursor-grab active:cursor-grabbing"
        style={{ left: `${highPct}%` }}
        role="slider"
        aria-label="Maximum age"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value[1]}
      />
    </div>
  )
}
