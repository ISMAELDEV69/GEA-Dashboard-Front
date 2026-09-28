import { useState, useRef, useCallback, useEffect } from 'react'

/**
 * Destello de ignición radial en el punto de lanzamiento
 */
function ignitionFlash(x, y) {
  const flash = document.createElement('div')
  flash.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:16px;height:16px;border-radius:50%;
    background:radial-gradient(circle,rgba(255,244,214,.95),rgba(255,150,60,.55) 45%,transparent 72%);
    transform:translate(-50%,-50%) scale(.5);opacity:1;pointer-events:none;z-index:9999;
    transition:transform .4s ease-out,opacity .5s ease-out;`
  document.body.appendChild(flash)
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      flash.style.transform = 'translate(-50%,-50%) scale(7)'
      flash.style.opacity = '0'
    })
  )
  setTimeout(() => flash.remove(), 550)
}

/**
 * Emisión de partículas de humo y fuego de escape
 */
function spawnExhaust(x, y) {
  const COUNT = 10
  for (let i = 0; i < COUNT; i++) {
    const isFlame = i < 4
    const p = document.createElement('span')
    const size = isFlame ? 7 + Math.random() * 9 : 12 + Math.random() * 20
    const dx = (Math.random() - 0.5) * (isFlame ? 34 : 100)
    const dy = 24 + Math.random() * 80
    const dur = 650 + Math.random() * 500
    const delay = Math.random() * 90
    const color = isFlame
      ? `rgba(255,${120 + Math.floor(Math.random() * 80)},${40 + Math.floor(Math.random() * 40)},.92)`
      : `rgba(190,188,198,${(0.32 + Math.random() * 0.28).toFixed(2)})`
    p.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${size}px;height:${size}px;border-radius:50%;
      background:${color};filter:blur(${isFlame ? 1 : 3}px);pointer-events:none;z-index:9998;
      transform:translate(-50%,-50%) scale(.4);opacity:${isFlame ? 0.95 : 0.7};
      transition:transform ${dur}ms ease-out ${delay}ms,opacity ${dur}ms ease-out ${delay}ms;`
    document.body.appendChild(p)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        p.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${isFlame ? 1.7 : 2.8})`
        p.style.opacity = '0'
      })
    )
    setTimeout(() => p.remove(), dur + delay + 100)
  }
}

/**
 * Efecto integral de plataforma de despegue (ignición + humo escalonado)
 */
export function launchpadEffect(btnEl) {
  if (!btnEl) return () => {}
  const r = btnEl.getBoundingClientRect()
  const x = r.left + r.width / 2
  const y = r.bottom - 8
  ignitionFlash(x, y)
  let ticks = 0
  const iv = setInterval(() => {
    spawnExhaust(x, y)
    if (++ticks >= 5) clearInterval(iv)
  }, 90)

  return () => clearInterval(iv)
}

/**
 * Hook personalizado para manejar el lanzamiento del botón cohete
 */
export function useRocketLaunch({ btnRef, cardRef }) {
  const [isLaunching, setIsLaunching] = useState(false)
  const activeIntervalRef = useRef(null)
  const timeoutRef = useRef(null)

  const cancel = useCallback(() => {
    if (activeIntervalRef.current) {
      clearInterval(activeIntervalRef.current)
      activeIntervalRef.current = null
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    btnRef.current?.classList.remove('launching')
    cardRef.current?.classList.remove('card--flying')
    setIsLaunching(false)
  }, [btnRef, cardRef])

  const launch = useCallback(
    async (asyncAction) => {
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
      setIsLaunching(true)

      if (reduceMotion) {
        try {
          return await asyncAction()
        } finally {
          setIsLaunching(false)
        }
      }

      cardRef.current?.classList.add('card--flying')
      btnRef.current?.classList.add('launching')

      const cleanupExhaust = launchpadEffect(btnRef.current)
      activeIntervalRef.current = cleanupExhaust

      try {
        const result = await asyncAction()
        // Esperar que termine el despegue hacia arriba (~1.35s)
        timeoutRef.current = setTimeout(() => {
          btnRef.current?.classList.remove('launching')
          cardRef.current?.classList.remove('card--flying')
          setIsLaunching(false)
        }, 1350)
        return result
      } catch (err) {
        // En caso de fallo (credenciales inválidas, etc.): cancelar vuelo inmediatamente
        cancel()
        throw err
      }
    },
    [btnRef, cardRef, cancel]
  )

  useEffect(() => {
    return () => {
      if (activeIntervalRef.current && typeof activeIntervalRef.current === 'function') {
        activeIntervalRef.current()
      } else if (activeIntervalRef.current) {
        clearInterval(activeIntervalRef.current)
      }
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  return { isLaunching, launch, cancel }
}
