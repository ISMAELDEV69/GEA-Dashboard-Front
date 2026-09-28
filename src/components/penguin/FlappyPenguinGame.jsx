import React, { useEffect, useRef, useState, useCallback } from 'react'
import { X, Volume2, VolumeX, Trophy, Play, RotateCcw, Sparkles } from 'lucide-react'

// ── SISTEMA DE AUDIO SINTETIZADO (Web Audio API) ───────────────────────────
class SoundEffects {
  constructor() {
    this.ctx = null
    this.muted = false
  }

  init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (AudioCtx) this.ctx = new AudioCtx()
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume()
    }
  }

  playFlap() {
    if (this.muted) return
    this.init()
    if (!this.ctx) return
    try {
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(400, this.ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime + 0.08)
      gain.gain.setValueAtTime(0.2, this.ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.09)
      osc.connect(gain)
      gain.connect(this.ctx.destination)
      osc.start()
      osc.stop(this.ctx.currentTime + 0.09)
    } catch {}
  }

  playScore() {
    if (this.muted) return
    this.init()
    if (!this.ctx) return
    try {
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(587, this.ctx.currentTime)
      osc.frequency.setValueAtTime(880, this.ctx.currentTime + 0.06)
      gain.gain.setValueAtTime(0.25, this.ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2)
      osc.connect(gain)
      gain.connect(this.ctx.destination)
      osc.start()
      osc.stop(this.ctx.currentTime + 0.2)
    } catch {}
  }

  playHit() {
    if (this.muted) return
    this.init()
    if (!this.ctx) return
    try {
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(200, this.ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.22)
      gain.gain.setValueAtTime(0.3, this.ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.22)
      osc.connect(gain)
      gain.connect(this.ctx.destination)
      osc.start()
      osc.stop(this.ctx.currentTime + 0.22)
    } catch {}
  }
}

const sfx = new SoundEffects()

export default function FlappyPenguinGame({ isOpen, onClose }) {
  const canvasRef = useRef(null)
  const [uiState, setUiState] = useState('START') // 'START' | 'PLAYING' | 'GAMEOVER'
  const [displayScore, setDisplayScore] = useState(0)
  const [highScore, setHighScore] = useState(() => {
    try {
      return parseInt(localStorage.getItem('gea_flappy_best') || '0', 10)
    } catch {
      return 0
    }
  })
  const [isMuted, setIsMuted] = useState(false)

  // Referencia mutable central para que el GameLoop nunca se reinicie ni se desincronice
  const engineRef = useRef({
    status: 'START', // 'START' | 'PLAYING' | 'GAMEOVER'
    bird: {
      x: 75,
      y: 220,
      width: 38,
      height: 28,
      velocity: 0,
      gravity: 0.36,
      jump: -6.5,
      rotation: 0,
    },
    pipes: [],
    frame: 0,
    score: 0,
    pipeTimer: 0,
    canJumpTime: 0, // Ignora el doble clic que abrió el modal
    clouds: [
      { x: 30, y: 50, speed: 0.35, size: 26 },
      { x: 170, y: 80, speed: 0.22, size: 34 },
      { x: 290, y: 40, speed: 0.3, size: 22 },
    ],
    img: null,
  })

  // Cargar imagen del pingüino
  useEffect(() => {
    const img = new Image()
    img.src = '/penguin_peeking.png'
    img.onload = () => {
      engineRef.current.img = img
    }
  }, [])

  // Inicializar al abrir
  useEffect(() => {
    if (isOpen) {
      const eng = engineRef.current
      eng.status = 'START'
      eng.bird.y = 220
      eng.bird.velocity = 0
      eng.bird.rotation = 0
      eng.pipes = []
      eng.frame = 0
      eng.score = 0
      eng.pipeTimer = 0
      eng.canJumpTime = Date.now() + 350 // Prevenir salto accidental del doble clic
      setUiState('START')
      setDisplayScore(0)
    }
  }, [isOpen])

  // Toggle Mute
  const toggleMute = () => {
    sfx.muted = !isMuted
    setIsMuted(!isMuted)
  }

  // Acción de Salto / Iniciar / Reiniciar
  const handleAction = useCallback(() => {
    const eng = engineRef.current
    if (Date.now() < eng.canJumpTime) return

    sfx.init()

    if (eng.status === 'START') {
      eng.status = 'PLAYING'
      eng.bird.velocity = eng.bird.jump
      sfx.playFlap()
      setUiState('PLAYING')
      return
    }

    if (eng.status === 'PLAYING') {
      eng.bird.velocity = eng.bird.jump
      sfx.playFlap()
      return
    }

    if (eng.status === 'GAMEOVER') {
      // Reiniciar
      eng.status = 'PLAYING'
      eng.bird.y = 220
      eng.bird.velocity = eng.bird.jump
      eng.bird.rotation = 0
      eng.pipes = []
      eng.frame = 0
      eng.score = 0
      eng.pipeTimer = 0
      setDisplayScore(0)
      setUiState('PLAYING')
      sfx.playFlap()
    }
  }, [])

  // Teclado (Espacio / Flecha Arriba / Esc)
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault()
        handleAction()
      } else if (e.code === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleAction, onClose])

  // ── MOTOR DEL JUEGO (60 FPS CONTINUO) ────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const eng = engineRef.current

    let animId = null
    let active = true

    const loop = () => {
      if (!active) return

      const W = canvas.width
      const H = canvas.height
      const GROUND_H = 55
      const PLAY_H = H - GROUND_H

      eng.frame++

      // ── A. FÍSICAS SEGÚN ESTADO ──
      if (eng.status === 'START') {
        // Pingüino flotando suavemente en espera
        eng.bird.y = 220 + Math.sin(eng.frame * 0.08) * 8
        eng.bird.rotation = Math.sin(eng.frame * 0.08) * 0.08
      } else if (eng.status === 'PLAYING') {
        // Gravedad y caída
        eng.bird.velocity += eng.bird.gravity
        eng.bird.y += eng.bird.velocity

        // Rotación según velocidad (máx 45 grados abajo, -20 grados arriba)
        if (eng.bird.velocity < 0) {
          eng.bird.rotation = -0.35
        } else {
          eng.bird.rotation = Math.min(0.7, eng.bird.velocity * 0.08)
        }

        // Generar tuberías cada 90 frames (~1.5s)
        eng.pipeTimer++
        if (eng.pipeTimer >= 90) {
          eng.pipeTimer = 0
          const gap = 135
          const minH = 45
          const maxH = PLAY_H - gap - minH
          const topH = Math.floor(Math.random() * (maxH - minH + 1)) + minH
          eng.pipes.push({
            x: W + 10,
            top: topH,
            bottom: PLAY_H - (topH + gap),
            gap: gap,
            passed: false,
          })
        }

        // Mover tuberías y colisiones
        const birdHitbox = {
          left: eng.bird.x - 12,
          right: eng.bird.x + 12,
          top: eng.bird.y - 10,
          bottom: eng.bird.y + 10,
        }

        for (let i = eng.pipes.length - 1; i >= 0; i--) {
          const p = eng.pipes[i]
          p.x -= 2.6 // Velocidad de avance

          // Puntuación al cruzar
          if (!p.passed && p.x + 48 < eng.bird.x) {
            p.passed = true
            eng.score++
            setDisplayScore(eng.score)
            sfx.playScore()

            // Guardar récord
            setHighScore((prev) => {
              if (eng.score > prev) {
                try {
                  localStorage.setItem('gea_flappy_best', eng.score.toString())
                } catch {}
                return eng.score
              }
              return prev
            })
          }

          // Cajas de colisión de tuberías
          const pipeW = 48
          const topBox = { left: p.x, right: p.x + pipeW, top: 0, bottom: p.top }
          const bottomBox = { left: p.x, right: p.x + pipeW, top: PLAY_H - p.bottom, bottom: PLAY_H }

          const hitTop =
            birdHitbox.right > topBox.left &&
            birdHitbox.left < topBox.right &&
            birdHitbox.top < topBox.bottom

          const hitBottom =
            birdHitbox.right > bottomBox.left &&
            birdHitbox.left < bottomBox.right &&
            birdHitbox.bottom > bottomBox.top

          if (hitTop || hitBottom) {
            sfx.playHit()
            eng.status = 'GAMEOVER'
            setUiState('GAMEOVER')
          }

          // Eliminar las que salen de pantalla
          if (p.x < -60) {
            eng.pipes.splice(i, 1)
          }
        }

        // Colisión con el suelo
        if (eng.bird.y + 12 >= PLAY_H) {
          eng.bird.y = PLAY_H - 12
          sfx.playHit()
          eng.status = 'GAMEOVER'
          setUiState('GAMEOVER')
        }

        // Techo
        if (eng.bird.y - 12 <= 0) {
          eng.bird.y = 12
          eng.bird.velocity = 0
        }
      }

      // Nubes
      eng.clouds.forEach((c) => {
        c.x -= c.speed
        if (c.x < -60) c.x = W + 40
      })

      // ── B. DIBUJAR PANTALLA ──────────────────────────────────────────────
      ctx.clearRect(0, 0, W, H)

      // 1. Cielo Gradiente Arcade Cyber GEA
      const skyGrad = ctx.createLinearGradient(0, 0, 0, PLAY_H)
      skyGrad.addColorStop(0, '#0a192f')
      skyGrad.addColorStop(0.5, '#0f2744')
      skyGrad.addColorStop(1, '#1b4168')
      ctx.fillStyle = skyGrad
      ctx.fillRect(0, 0, W, PLAY_H)

      // 2. Nubes suaves
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)'
      eng.clouds.forEach((c) => {
        ctx.beginPath()
        ctx.arc(c.x, c.y, c.size, 0, Math.PI * 2)
        ctx.arc(c.x + c.size * 0.7, c.y - c.size * 0.25, c.size * 0.8, 0, Math.PI * 2)
        ctx.arc(c.x + c.size * 1.3, c.y, c.size * 0.7, 0, Math.PI * 2)
        ctx.fill()
      })

      // 3. Edificios de fondo en parallax
      ctx.fillStyle = 'rgba(8, 20, 36, 0.55)'
      ctx.fillRect(15, PLAY_H - 65, 35, 65)
      ctx.fillRect(60, PLAY_H - 105, 45, 105)
      ctx.fillRect(115, PLAY_H - 75, 30, 75)
      ctx.fillRect(155, PLAY_H - 120, 50, 120)
      ctx.fillRect(215, PLAY_H - 85, 40, 85)
      ctx.fillRect(265, PLAY_H - 110, 45, 110)
      ctx.fillRect(320, PLAY_H - 70, 30, 70)

      // 4. Tuberías Arcade (Neon Cyan / Azul GEA)
      const pipeW = 48
      const capH = 20

      eng.pipes.forEach((p) => {
        // Gradiente metálico brillante
        const grad = ctx.createLinearGradient(p.x, 0, p.x + pipeW, 0)
        grad.addColorStop(0, '#0284c7')
        grad.addColorStop(0.35, '#38bdf8')
        grad.addColorStop(0.7, '#0ea5e9')
        grad.addColorStop(1, '#0369a1')

        // Tubo Superior
        ctx.fillStyle = grad
        ctx.fillRect(p.x, 0, pipeW, p.top)
        ctx.strokeStyle = '#082f49'
        ctx.lineWidth = 2
        ctx.strokeRect(p.x, 0, pipeW, p.top)
        // Pestaña inferior del tubo superior
        ctx.fillStyle = '#38bdf8'
        ctx.fillRect(p.x - 3, p.top - capH, pipeW + 6, capH)
        ctx.strokeRect(p.x - 3, p.top - capH, pipeW + 6, capH)

        // Tubo Inferior
        const bottomY = PLAY_H - p.bottom
        ctx.fillStyle = grad
        ctx.fillRect(p.x, bottomY, pipeW, p.bottom)
        ctx.strokeRect(p.x, bottomY, pipeW, p.bottom)
        // Pestaña superior del tubo inferior
        ctx.fillStyle = '#38bdf8'
        ctx.fillRect(p.x - 3, bottomY, pipeW + 6, capH)
        ctx.strokeRect(p.x - 3, bottomY, pipeW + 6, capH)
      })

      // 5. Suelo en movimiento
      ctx.fillStyle = '#09111e'
      ctx.fillRect(0, PLAY_H, W, GROUND_H)

      // Línea neon brillante de división
      ctx.strokeStyle = '#06b6d4'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(0, PLAY_H)
      ctx.lineTo(W, PLAY_H)
      ctx.stroke()

      // Patrón de cuadrícula del suelo
      ctx.fillStyle = 'rgba(6, 182, 212, 0.18)'
      const groundOffset = (eng.frame * 2.6) % 24
      for (let x = -groundOffset; x < W; x += 24) {
        ctx.fillRect(x, PLAY_H + 4, 12, GROUND_H - 8)
      }

      // 6. DIBUJAR PINGÜINO SKIPPER
      ctx.save()
      ctx.translate(eng.bird.x, eng.bird.y)
      ctx.rotate(eng.bird.rotation)

      if (eng.img && eng.img.complete && eng.img.naturalWidth > 0) {
        // Dibujar con la imagen auténtica del pingüino
        const imgW = 42
        const imgH = 30
        ctx.drawImage(eng.img, -imgW / 2, -imgH / 2, imgW, imgH)
      } else {
        // Fallback vectorial de alta fidelidad
        ctx.fillStyle = '#0f172a'
        ctx.beginPath()
        ctx.arc(0, 0, 14, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = '#f8fafc'
        ctx.beginPath()
        ctx.arc(4, 0, 9, 0, Math.PI * 2)
        ctx.fill()

        // Ojos
        ctx.fillStyle = '#0284c7'
        ctx.beginPath()
        ctx.arc(6, -3, 3, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#0f172a'
        ctx.beginPath()
        ctx.arc(7, -3, 1.8, 0, Math.PI * 2)
        ctx.fill()

        // Pico
        ctx.fillStyle = '#ea580c'
        ctx.beginPath()
        ctx.moveTo(7, 0)
        ctx.lineTo(19, 3)
        ctx.lineTo(7, 7)
        ctx.closePath()
        ctx.fill()
      }

      ctx.restore()

      // 7. Marcador grande en pantalla durante juego
      if (eng.status === 'PLAYING') {
        ctx.fillStyle = '#ffffff'
        ctx.font = '900 38px monospace'
        ctx.textAlign = 'center'
        ctx.shadowColor = 'rgba(0,0,0,0.8)'
        ctx.shadowBlur = 10
        ctx.fillText(eng.score.toString(), W / 2, 60)
        ctx.shadowBlur = 0
      }

      animId = requestAnimationFrame(loop)
    }

    animId = requestAnimationFrame(loop)

    return () => {
      active = false
      if (animId) cancelAnimationFrame(animId)
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md select-none"
      onClick={onClose}
    >
      <div
        className="relative bg-slate-900 border-2 border-cyan-500/40 rounded-3xl shadow-[0_0_50px_rgba(6,182,212,0.35)] overflow-hidden flex flex-col items-center"
        style={{ width: '380px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera Arcade */}
        <div className="w-full px-5 py-3.5 bg-slate-950/95 border-b border-cyan-500/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🐧</span>
            <div>
              <h3 className="text-sm font-black text-white tracking-wide uppercase flex items-center gap-1.5">
                Flappy Skipper <Sparkles size={13} className="text-cyan-400" />
              </h3>
              <p className="text-[10px] text-cyan-300/70 font-mono">Madagascar Mini Arcade</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={toggleMute}
              className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition cursor-pointer"
              title={isMuted ? 'Activar Sonido' : 'Silenciar'}
            >
              {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-red-400 hover:bg-slate-700 transition cursor-pointer"
              title="Cerrar (Esc)"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Contenedor del Juego (Canvas + Overlays) */}
        <div
          className="relative cursor-pointer bg-slate-950"
          onClick={handleAction}
        >
          <canvas
            ref={canvasRef}
            width={360}
            height={500}
            className="block"
          />

          {/* OVERLAY: PANTALLA DE INICIO */}
          {uiState === 'START' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-slate-950/50 backdrop-blur-[2px]">
              <div className="bg-slate-900/95 border-2 border-cyan-500/50 rounded-2xl p-6 text-center shadow-2xl max-w-xs animate-in zoom-in-95 duration-150">
                <span className="text-4xl block mb-2">🐧</span>
                <h4 className="text-base font-black text-white mb-1 uppercase tracking-wider">
                  ¡Vuela, Skipper!
                </h4>
                <p className="text-xs text-cyan-300/80 mb-5">
                  Esquiva las columnas cibernéticas y suma puntos para GEA.
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleAction()
                  }}
                  className="w-full py-2.5 px-4 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-cyan-500/30 flex items-center justify-center gap-2 cursor-pointer transition transform active:scale-95"
                >
                  <Play size={14} fill="currentColor" /> Iniciar Vuelo
                </button>
                <span className="block mt-3 text-[10px] text-slate-400 font-mono">
                  o presiona <strong className="text-white">ESPACIO</strong>
                </span>
              </div>
            </div>
          )}

          {/* OVERLAY: GAME OVER */}
          {uiState === 'GAMEOVER' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-slate-950/75 backdrop-blur-xs animate-in zoom-in-95 duration-150">
              <div className="bg-slate-900 border-2 border-red-500/50 rounded-2xl p-6 text-center shadow-2xl w-68">
                <h4 className="text-2xl font-black text-red-400 mb-4 tracking-wider uppercase">
                  GAME OVER
                </h4>

                <div className="bg-slate-950/80 rounded-xl p-4 border border-slate-800 mb-5 space-y-2.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-medium">Puntos obtenidos:</span>
                    <span className="text-2xl font-black text-white font-mono">{displayScore}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs border-t border-slate-800/80 pt-2.5">
                    <span className="text-amber-400 font-medium flex items-center gap-1">
                      <Trophy size={14} /> Mejor Récord:
                    </span>
                    <span className="text-xl font-black text-amber-300 font-mono">{highScore}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleAction()
                  }}
                  className="w-full py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-cyan-500/30 flex items-center justify-center gap-2 cursor-pointer transition transform active:scale-95"
                >
                  <RotateCcw size={15} /> Jugar de Nuevo
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Barra de control inferior */}
        <div className="w-full px-5 py-2.5 bg-slate-950 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
          <span>Controles: <strong className="text-slate-200">ESPACIO</strong> o <strong className="text-slate-200">Clic</strong></span>
          <span className="text-slate-500">ESC para salir</span>
        </div>
      </div>
    </div>
  )
}
