import { useState, useEffect } from 'react'

const STATS = [
  {
    label: 'Deserción',
    value: 8.4,
    decimals: 1,
    suffix: '%',
    pos: [58, 16],
    dur: 22,
    hideMobile: false,
    renderIcon: () => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7l6 6 4-4 8 8" />
        <path d="M21 11v6h-6" />
      </svg>
    ),
  },
  {
    label: 'Dotación',
    value: 42,
    decimals: 0,
    suffix: '',
    pos: [8, 58],
    dur: 26,
    hideMobile: false,
    renderIcon: () => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5" />
        <circle cx="17.5" cy="9" r="2.6" />
        <path d="M16 14.7c3 .4 5.5 2.2 5.5 5.3" />
      </svg>
    ),
  },
  {
    label: 'Postulantes en bolsa',
    value: 317,
    decimals: 0,
    suffix: '',
    pos: [55, 66],
    dur: 24,
    hideMobile: true,
    renderIcon: () => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l9 5-9 5-9-5 9-5z" />
        <path d="M3 12l9 5 9-5" />
        <path d="M3 17l9 5 9-5" />
      </svg>
    ),
  },
  {
    label: 'Asistentes día 1',
    value: 38,
    decimals: 0,
    suffix: '',
    pos: [66, 38],
    dur: 20,
    hideMobile: true,
    renderIcon: () => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M8 3v4M16 3v4M3 10h18" />
        <path d="M9 15l2 2 4-4" />
      </svg>
    ),
  },
]

function SingleChip({ stat, index }) {
  const [displayValue, setDisplayValue] = useState('0')

  useEffect(() => {
    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    if (prefersReduced) {
      setDisplayValue(stat.value.toFixed(stat.decimals))
      return
    }

    const t0 = performance.now() + 600 + index * 250
    const dur = 1100
    let rafId

    function tick(now) {
      const p = Math.min(1, Math.max(0, (now - t0) / dur))
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplayValue((stat.value * eased).toFixed(stat.decimals))
      if (p < 1) {
        rafId = requestAnimationFrame(tick)
      }
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [stat, index])

  const inDelay = 0.9 + index * 0.22

  return (
    <div
      className={`chip ${stat.hideMobile ? 'chip--hide-mobile' : ''}`}
      style={{
        left: `${stat.pos[0]}%`,
        top: `${stat.pos[1]}%`,
        '--dur': `${stat.dur}s`,
        '--in-delay': `${inDelay}s`,
        '--dx1': `${8 + (index * 4)}px`,
        '--dy1': `${-(10 + (index * 3))}px`,
        '--dx2': `${-(6 + (index * 3))}px`,
        '--dy2': `${6 + (index * 2)}px`,
      }}
    >
      <span className="chip__icon" aria-hidden="true">
        {stat.renderIcon()}
      </span>
      <span>
        <span className="chip__label">{stat.label}</span>
        <br />
        <span className="chip__value">
          <span>{displayValue}</span>
          {stat.suffix && <small>{stat.suffix}</small>}
        </span>
      </span>
    </div>
  )
}

export default function FloatingKpiChips() {
  return (
    <>
      {STATS.map((s, i) => (
        <SingleChip key={s.label} stat={s} index={i} />
      ))}
    </>
  )
}
