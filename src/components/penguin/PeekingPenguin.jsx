import React, { useState, useEffect, useRef } from 'react'
import { Sparkles, Gamepad2 } from 'lucide-react'

/**
 * PeekingPenguin
 * Pingüino de Madagascar (Skipper) ubicado en la cabecera central en lugar de la barra de búsqueda.
 * Muestra únicamente sus ojos y pico.
 * Las pupilas siguen de forma fluida el movimiento del cursor por toda la pantalla.
 * Al darle DOBLE CLIC (onDoubleClick), se abre el mini-juego Flappy Bird arcade.
 */
export default function PeekingPenguin({ onOpenGame, onOpenCommandPalette }) {
  const containerRef = useRef(null)
  const [pupilOffset, setPupilOffset] = useState({ left: { x: 0, y: 0 }, right: { x: 0, y: 0 } })
  const [isHovered, setIsHovered] = useState(false)
  const [isBlinking, setIsBlinking] = useState(false)

  // ── SEGUIMIENTO DEL CURSOR POR TODA LA PANTALLA ─────────────────────────────
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!containerRef.current) return

      const rect = containerRef.current.getBoundingClientRect()

      // Centro estimado de cada ojo en coordenadas de pantalla
      const leftEyeScreenX = rect.left + rect.width * 0.353
      const leftEyeScreenY = rect.top + rect.height * 0.526

      const rightEyeScreenX = rect.left + rect.width * 0.668
      const rightEyeScreenY = rect.top + rect.height * 0.548

      // Distancia máxima de movimiento de la pupila dentro del ojo (radio máx 4px)
      const maxRadius = 4.2

      // Ojo izquierdo
      const dxL = e.clientX - leftEyeScreenX
      const dyL = e.clientY - leftEyeScreenY
      const distL = Math.hypot(dxL, dyL)
      const angleL = Math.atan2(dyL, dxL)
      const clampedDistL = Math.min(maxRadius, distL / 35)

      // Ojo derecho
      const dxR = e.clientX - rightEyeScreenX
      const dyR = e.clientY - rightEyeScreenY
      const distR = Math.hypot(dxR, dyR)
      const angleR = Math.atan2(dyR, dxR)
      const clampedDistR = Math.min(maxRadius, distR / 35)

      setPupilOffset({
        left: {
          x: Math.cos(angleL) * clampedDistL,
          y: Math.sin(angleL) * clampedDistL,
        },
        right: {
          x: Math.cos(angleR) * clampedDistR,
          y: Math.sin(angleR) * clampedDistR,
        },
      })
    }

    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  // Parpadeo sutil cada 5 segundos
  useEffect(() => {
    const timer = setInterval(() => {
      setIsBlinking(true)
      setTimeout(() => setIsBlinking(false), 130)
    }, 5000)
    return () => clearInterval(timer)
  }, [])

  const handleDoubleClick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (onOpenGame) onOpenGame()
  }

  return (
    <div className="relative flex items-center justify-center select-none group">
      {/* Contenedor del Pingüino visible y destacado */}
      <div
        ref={containerRef}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="relative flex items-end justify-center cursor-pointer transition-transform duration-200 hover:scale-105 active:scale-95"
        style={{ width: '80px', height: '52px' }}
        title="🐧 Doble clic para jugar Flappy Bird | Atajo ⌘K para buscar"
      >
        {/* Imagen auténtica del pingüino asomando (ojos y pico) */}
        <img
          src="/penguin_peeking.png"
          alt="Skipper"
          draggable={false}
          className={`w-full h-full object-contain filter drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)] transition-transform duration-100 ${
            isBlinking ? 'scale-y-[0.1] translate-y-1' : ''
          }`}
          style={{ transformOrigin: 'bottom center' }}
        />

        {/* ── PUPILAS DINÁMICAS QUE SIGUEN EL CURSOR ── */}
        {!isBlinking && (
          <>
            {/* Pupila Izquierda */}
            <div
              className="absolute pointer-events-none transition-transform duration-75 ease-out"
              style={{
                left: '35.3%',
                top: '52.6%',
                width: '8.5px',
                height: '8.5px',
                transform: `translate(-50%, -50%) translate(${pupilOffset.left.x}px, ${pupilOffset.left.y}px)`,
              }}
            >
              <div className="w-full h-full rounded-full bg-gradient-to-br from-cyan-400 via-sky-600 to-slate-950 border border-slate-900 shadow-[0_0_4px_rgba(14,165,233,0.7)] flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-950 flex items-start justify-end">
                  <div className="w-0.5 h-0.5 rounded-full bg-white mr-0.5 mt-0.5" />
                </div>
              </div>
            </div>

            {/* Pupila Derecha */}
            <div
              className="absolute pointer-events-none transition-transform duration-75 ease-out"
              style={{
                left: '66.8%',
                top: '54.8%',
                width: '8px',
                height: '8px',
                transform: `translate(-50%, -50%) translate(${pupilOffset.right.x}px, ${pupilOffset.right.y}px)`,
              }}
            >
              <div className="w-full h-full rounded-full bg-gradient-to-br from-cyan-400 via-sky-600 to-slate-950 border border-slate-900 shadow-[0_0_4px_rgba(14,165,233,0.7)] flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-950 flex items-start justify-end">
                  <div className="w-0.5 h-0.5 rounded-full bg-white mr-0.5 mt-0.5" />
                </div>
              </div>
            </div>
          </>
        )}

        {/* Pequeño tag indicador sutil flotante debajo o al hacer hover */}
        {isHovered && (
          <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 px-2.5 py-1 bg-slate-900/95 border border-cyan-500/40 rounded-xl text-[10px] text-cyan-200 shadow-2xl whitespace-nowrap z-40 animate-in fade-in zoom-in-95 duration-150 flex items-center gap-1.5 pointer-events-none">
            <Gamepad2 size={12} className="text-cyan-400" />
            <span>¡Doble clic para <strong>Flappy Bird</strong>!</span>
          </div>
        )}
      </div>
    </div>
  )
}
