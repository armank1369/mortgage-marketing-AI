import { useId } from 'react'
import { parseFilmingSetup, SHOT_LABELS, ANGLE_LABELS } from '../lib/filmingSetup.js'
import { DIRECTION_FIELDS, filledFields } from '../lib/creativeSketch.js'

// Animated stick-figure filming-setup diagram for a video brief. Two panels in one frame:
// a top-down "where everything goes" view and a "what the camera sees" phone frame.
// Pure SVG drawn from the creative direction text: no image model, no per-use cost, and a
// neutral stick figure instead of a photo of a person (what Joseph asked for on 11/17).
const INK = '#334155'
const ACCENT = '#2563eb'
const LIGHT = '#f59e0b'

const NUMBER = Object.fromEntries(DIRECTION_FIELDS.map(([key], i) => [key, i + 1]))

// Numbered marker that matches the badge on the text card for the same field. Hovering a card
// (active) enlarges and recolors its marker so the eye can jump text -> picture.
function Badge({ field, x, y, has, active }) {
  if (!has.has(field)) return null
  const on = active === field
  return (
    <g transform={`translate(${x} ${y})`} aria-hidden="true">
      <circle r={on ? 11 : 8.5} fill={on ? '#ea580c' : ACCENT} stroke="#fff" strokeWidth="1.5" />
      <text textAnchor="middle" y="3.5" fontSize={on ? 11 : 9.5} fontWeight="700" fill="#fff">{NUMBER[field]}</text>
    </g>
  )
}

function StickFigure({ x, y, scale = 1, clothing = false }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} stroke={INK} strokeWidth={3 / scale} fill="none" strokeLinecap="round">
      <circle cx="0" cy="-60" r="14" fill="#fff" />
      <path d="M-5 -62 a2 2 0 1 0 0.1 0 M5 -62 a2 2 0 1 0 0.1 0" strokeWidth={2.5 / scale} />
      <path d="M-6 -54 q6 5 12 0" strokeWidth={2 / scale} />
      <path d="M0 -46 v46 M0 -36 l-20 18 M0 -36 l20 18 M0 0 l-14 34 M0 0 l14 34" />
      {clothing && <path d="M-12 -44 L0 -28 L12 -44 M0 -28 v16" stroke={ACCENT} strokeWidth={3.5 / scale} />}
    </g>
  )
}

function TopView({ setup, has, active }) {
  const keyX = setup.keySide === 'left' ? 70 : setup.keySide === 'right' ? 210 : 140
  return (
    <g>
      <rect x="10" y="10" width="260" height="250" rx="10" fill="#f8fafc" stroke="#cbd5e1" strokeDasharray="4 4" />
      <text x="20" y="30" fontSize="11" fill="#64748b" fontWeight="600">TOP VIEW</text>
      <Badge field="setting" x="252" y="26" has={has} active={active} />
      {/* back wall behind the presenter */}
      <line x1="60" y1="46" x2="220" y2="46" stroke="#94a3b8" strokeWidth="5" strokeLinecap="round" />
      <Badge field="background" x="236" y="46" has={has} active={active} />
      {setup.windowSide && (
        <g>
          <line x1={setup.windowSide === 'left' ? 12 : 268} y1="70" x2={setup.windowSide === 'left' ? 12 : 268} y2="150" stroke="#38bdf8" strokeWidth="6" />
          <g className="fsd-pulse" stroke={LIGHT} strokeWidth="2">
            {[85, 110, 135].map((y) => (
              <line key={y} x1={setup.windowSide === 'left' ? 22 : 258} y1={y} x2={setup.windowSide === 'left' ? 70 : 210} y2={y - 15} />
            ))}
          </g>
          <text x={setup.windowSide === 'left' ? 20 : 222} y="64" fontSize="10" fill="#0284c7">window</text>
          <Badge field="lighting" x={setup.windowSide === 'left' ? 28 : 252} y="160" has={has} active={active} />
        </g>
      )}
      {/* presenter seen from above */}
      <circle cx="140" cy="75" r="16" fill="#fff" stroke={INK} strokeWidth="3" />
      <path d="M118 80 q22 22 44 0" stroke={INK} strokeWidth="3" fill="none" />
      <text x="164" y="64" fontSize="10" fill={INK}>you</text>
      <Badge field="energy" x="112" y="62" has={has} active={active} />
      {/* camera field of view */}
      <path className="fsd-breathe" d={`M140 215 L${setup.shot === 'wide' ? 85 : setup.shot === 'close' ? 115 : 100} 95 L${setup.shot === 'wide' ? 195 : setup.shot === 'close' ? 165 : 180} 95 Z`} fill={ACCENT} opacity="0.12" />
      <text x="146" y="160" fontSize="10" fill={ACCENT}>{setup.shot === 'wide' ? '~6 ft' : setup.shot === 'close' ? '~2–3 ft' : '~3–4 ft'}</text>
      {/* camera + tripod */}
      <rect x="128" y="208" width="24" height="16" rx="3" fill={ACCENT} />
      {setup.tripod && <path d="M140 224 l-14 22 M140 224 l14 22 M140 224 v24" stroke={INK} strokeWidth="2" />}
      <text x="160" y="240" fontSize="10" fill={INK}>{setup.handheld ? 'phone (handheld)' : 'phone on tripod'}</text>
      <Badge field="camera" x="168" y="208" has={has} active={active} />
      {setup.keyLight === 'ring' && (
        <g className="fsd-pulse">
          <circle cx="140" cy="216" r="20" fill="none" stroke={LIGHT} strokeWidth="4" />
          <text x="60" y="222" fontSize="10" fill="#b45309">ring light</text>
          <Badge field="lighting" x="116" y="198" has={has} active={active} />
        </g>
      )}
      {setup.keyLight && setup.keyLight !== 'ring' && (
        <g className="fsd-pulse">
          <rect x={keyX - 14} y="168" width="28" height="18" rx="3" fill={LIGHT} transform={`rotate(${setup.keySide === 'left' ? 30 : setup.keySide === 'right' ? -30 : 0} ${keyX} 177)`} />
          <line x1={keyX} y1="168" x2="140" y2="100" stroke={LIGHT} strokeWidth="2" strokeDasharray="4 4" />
          <text x={keyX - 22} y="200" fontSize="10" fill="#b45309">{setup.keyLight === 'lamp' ? 'lamp' : 'key light'}</text>
          <Badge field="lighting" x={keyX + 22} y="166" has={has} active={active} />
        </g>
      )}
    </g>
  )
}

function CameraView({ setup, clipId, has, active }) {
  const w = setup.vertical ? 120 : 200
  const h = setup.vertical ? 210 : 120
  const x0 = 290 + (220 - w) / 2
  const y0 = 30 + (230 - h) / 2
  const eyeY = y0 + h / 3
  // Stick figure: head centre is 60 units above the hips, feet 34 below, head radius 14.
  // Scale and place it so the crop matches the shot, with the eyes on the top third line.
  let scale
  if (setup.shot === 'wide') scale = (h * 0.8) / 108
  else if (setup.shot === 'close') scale = (h * 0.42) / 28
  else scale = (h * 0.3) / 28
  let y = eyeY + 60 * scale
  if (setup.shot === 'wide') y = y0 + h * 0.92 - 34 * scale
  return (
    <g>
      <text x="300" y="30" fontSize="11" fill="#64748b" fontWeight="600">WHAT THE CAMERA SEES</text>
      <defs>
        <clipPath id={clipId}><rect x={x0} y={y0} width={w} height={h} rx="10" /></clipPath>
      </defs>
      <rect x={x0} y={y0} width={w} height={h} rx="10" fill="#fff" stroke={INK} strokeWidth="3" />
      <g clipPath={`url(#${clipId})`}>
        {has.has('background') && (
          <g stroke="#cbd5e1" strokeWidth="2.5" fill="none" strokeLinecap="round">
            <path d={`M${x0 + 8} ${y0 + h * 0.62} h${w * 0.32} M${x0 + 8} ${y0 + h * 0.74} h${w * 0.32}`} />
            <path d={`M${x0 + w - 26} ${y0 + h * 0.42} v-12 M${x0 + w - 26} ${y0 + h * 0.42} q-12 -6 -14 -18 M${x0 + w - 26} ${y0 + h * 0.42} q12 -6 14 -18`} />
          </g>
        )}
        <g transform={`translate(${x0 + w / 2 - 400} 0)`}>
          <StickFigure x={400} y={y} scale={scale} clothing={has.has('clothing')} />
        </g>
        {/* rule-of-thirds eye line */}
        <line x1={x0} y1={eyeY} x2={x0 + w} y2={eyeY} stroke={ACCENT} strokeDasharray="3 5" opacity="0.6" />
        </g>
      <text x={x0 + w + 5} y={eyeY + 3} fontSize="9" fill={ACCENT}>eye line</text>
      <Badge field="background" x={x0 + 14} y={y0 + 16} has={has} active={active} />
      <Badge field="clothing" x={Math.min(x0 + w - 14, x0 + w / 2 + 26 * scale)} y={Math.min(y0 + h - 16, y - 28 * scale)} has={has} active={active} />
      <Badge field="camera" x={x0 + w - 14} y={y0 + 16} has={has} active={active} />
      <text x="300" y={y0 + h + 18} fontSize="10" fill={INK}>{SHOT_LABELS[setup.shot]}</text>
      <text x="300" y={y0 + h + 32} fontSize="10" fill={INK}>{ANGLE_LABELS[setup.angle]}{setup.vertical ? ' · vertical 9:16' : ''}</text>
    </g>
  )
}

export default function FilmingSetupDiagram({ direction, active = null }) {
  const setup = parseFilmingSetup(direction)
  const has = filledFields(direction)
  const clipId = `fsd-frame-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  return (
    <figure className="mt-4">
      <style>{`
        @keyframes fsd-pulse { 0%,100% { opacity: .45 } 50% { opacity: 1 } }
        @keyframes fsd-breathe { 0%,100% { opacity: .08 } 50% { opacity: .2 } }
        .fsd-pulse { animation: fsd-pulse 2.4s ease-in-out infinite }
        .fsd-breathe { animation: fsd-breathe 3s ease-in-out infinite }
        @media (prefers-reduced-motion: reduce) { .fsd-pulse, .fsd-breathe { animation: none } }
      `}</style>
      <svg viewBox="0 0 545 300" role="img" aria-label="Filming setup diagram" className="w-full max-w-xl rounded-lg border border-slate-200 bg-white">
        <TopView setup={setup} has={has} active={active} />
        <CameraView setup={setup} clipId={clipId} has={has} active={active} />
      </svg>
      <figcaption className="text-[11px] text-slate-400 mt-1">Numbers match the creative direction cards above. Hover a card to find it in the picture.</figcaption>
    </figure>
  )
}
