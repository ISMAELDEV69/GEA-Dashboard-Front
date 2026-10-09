import { useState, useEffect } from 'react'

export function useIsDarkTheme() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof document === 'undefined') return true
    return document.documentElement.getAttribute('data-theme') !== 'light'
  })

  useEffect(() => {
    const el = document.documentElement
    const sync = () => setIsDark(el.getAttribute('data-theme') !== 'light')
    sync()
    const obs = new MutationObserver(sync)
    obs.observe(el, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  return isDark
}

export default useIsDarkTheme
