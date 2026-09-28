import { useEffect, useRef } from 'react'

export default function GalaxyCanvas() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const parent = canvas.parentElement
    if (!parent) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let W = 0
    let H = 0

    function resizeGalaxy() {
      if (!parent || !canvas) return
      const r = parent.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = r.width
      H = r.height
      canvas.width = W * dpr
      canvas.height = H * dpr
      canvas.style.width = W + 'px'
      canvas.style.height = H + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resizeGalaxy()
    window.addEventListener('resize', resizeGalaxy)

    const STAR_COUNT = prefersReduced ? 50 : 90
    const stars = Array.from({ length: STAR_COUNT }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.3 + 0.3,
      depth: Math.random() * 0.7 + 0.3,
      phase: Math.random() * Math.PI * 2,
      speed: 0.5 + Math.random() * 1.3,
    }))

    const planets = [
      { x: 0.80, y: 0.20, r: 20, depth: 0.35, c1: '#B9D3FF', c2: '#12224A', ring: false, phase: 0 },
      { x: 0.12, y: 0.68, r: 13, depth: 0.65, c1: '#D3C2FF', c2: '#241A4D', ring: true,  phase: 2.1 },
      { x: 0.58, y: 0.88, r: 8,  depth: 0.90, c1: '#9FF0DE', c2: '#0E3A34', ring: false, phase: 4.2 },
    ]

    let mx = 0
    let my = 0
    let tx = 0
    let ty = 0

    const handlePointerMove = (e) => {
      const r = canvas.getBoundingClientRect()
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2
      ty = ((e.clientY - r.top) / r.height - 0.5) * 2
    }

    const handlePointerLeave = () => {
      tx = 0
      ty = 0
    }

    const pulses = []
    const handleClick = (e) => {
      const r = canvas.getBoundingClientRect()
      pulses.push({ x: e.clientX - r.left, y: e.clientY - r.top, t: 0 })
      if (pulses.length > 4) pulses.shift()
    }

    canvas.addEventListener('pointermove', handlePointerMove)
    canvas.addEventListener('pointerleave', handlePointerLeave)
    canvas.addEventListener('click', handleClick)

    function drawPlanet(p, t) {
      const px = p.x * W - mx * 22 * p.depth
      const py = p.y * H - my * 22 * p.depth + Math.sin(t * 0.6 + p.phase) * 3

      if (p.ring) {
        ctx.save()
        ctx.translate(px, py)
        ctx.rotate(-0.35)
        ctx.scale(1, 0.32)
        ctx.beginPath()
        ctx.arc(0, 0, p.r * 1.8, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(210,196,255,.35)'
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.restore()
      }

      const grad = ctx.createRadialGradient(
        px - p.r * 0.4,
        py - p.r * 0.4,
        p.r * 0.1,
        px,
        py,
        p.r
      )
      grad.addColorStop(0, p.c1)
      grad.addColorStop(1, p.c2)

      ctx.beginPath()
      ctx.fillStyle = grad
      ctx.arc(px, py, p.r, 0, Math.PI * 2)
      ctx.fill()
    }

    function drawStar(s, t) {
      const px = s.x * W - mx * 16 * s.depth
      const py = s.y * H - my * 16 * s.depth
      let boost = 0

      for (const p of pulses) {
        const d = Math.hypot(px - p.x, py - p.y)
        const ringR = p.t * 160
        const w = 1 - Math.min(1, Math.abs(d - ringR) / 18)
        if (w > boost) boost = w
      }

      const twinkle = prefersReduced
        ? 0.7
        : 0.55 + 0.45 * Math.sin(t * s.speed + s.phase)
      const alpha = Math.min(1, twinkle * 0.8 + boost * 0.6)

      ctx.beginPath()
      ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`
      ctx.arc(px, py, s.r + boost * 1.2, 0, Math.PI * 2)
      ctx.fill()
    }

    let animId
    function galaxyLoop(ts) {
      const t = ts / 1000
      mx += (tx - mx) * 0.06
      my += (ty - my) * 0.06

      ctx.clearRect(0, 0, W, H)

      stars.forEach((s) => drawStar(s, t))
      planets.forEach((p) => drawPlanet(p, t))

      pulses.forEach((p) => {
        p.t += 0.02
      })
      while (pulses.length && pulses[0].t > 1) {
        pulses.shift()
      }

      animId = requestAnimationFrame(galaxyLoop)
    }

    animId = requestAnimationFrame(galaxyLoop)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resizeGalaxy)
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerleave', handlePointerLeave)
      canvas.removeEventListener('click', handleClick)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        display: 'block',
        cursor: 'default',
      }}
    />
  )
}
