import React, { useState, useMemo, useRef, useEffect } from 'react'
import {
  MapPin,
  Navigation,
  Compass,
  Layers,
  Zap,
  TrendingDown,
  AlertTriangle,
  ArrowRight,
  Maximize2,
  Clock,
  Building2,
  Globe,
  Radio,
  Eye
} from 'lucide-react'
import { GEA_SEDES, LIMA_DISTRITOS } from '../../lib/geoMobilityService'

// Proveedores de capas cartográficas reales de Google Maps y Esri (100% libres de marcas de agua)
const MAP_LAYERS = {
  google_streets: {
    id: 'google_streets',
    label: 'Google Calles',
    icon: '🗺️',
    url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    maxZoom: 20,
    attribution: '&copy; Google Maps'
  },
  google_satellite: {
    id: 'google_satellite',
    label: 'Google Satelital',
    icon: '🛰️',
    url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    maxZoom: 20,
    attribution: '&copy; Google Maps'
  },
  dark_enterprise: {
    id: 'dark_enterprise',
    label: 'Dark Enterprise',
    icon: '🌃',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 16,
    attribution: '&copy; Esri World Dark'
  }
}

/**
 * Carga segura y asíncrona de Leaflet desde CDN
 */
function ensureLeaflet() {
  return new Promise((resolve, reject) => {
    if (window.L) return resolve(window.L)

    // Inyectar CSS
    if (!document.getElementById('leaflet-core-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-core-css'
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }

    // Inyectar JS
    const existingScript = document.getElementById('leaflet-core-js')
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(window.L))
      return
    }

    const script = document.createElement('script')
    script.id = 'leaflet-core-js'
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.async = true
    script.onload = () => resolve(window.L)
    script.onerror = (err) => reject(err)
    document.body.appendChild(script)
  })
}

/**
 * GeaCommandMap - Mapa Real de Google Maps con Geolocalización y Trayectorias de Asesores
 */
export default function GeaCommandMap({
  mobilityData,
  selectedSedeId = 'TODAS',
  onSelectSede,
  onOpenReasignacionModal
}) {
  const [mapMode, setMapMode] = useState('puntos') // 'puntos' | 'trayectorias' | 'calor' | 'reubicacion'
  const [activeLayer, setActiveLayer] = useState('google_streets') // 'google_streets' | 'google_satellite' | 'dark_enterprise'
  const [hoveredAsesor, setHoveredAsesor] = useState(null)
  const [isLeafletReady, setIsLeafletReady] = useState(false)

  const mapContainerRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const tileLayerRef = useRef(null)
  const markersLayerRef = useRef(null)
  const polylinesLayerRef = useRef(null)
  const sedesLayerRef = useRef(null)

  const { distritosStats = [], metricasGlobales = {}, sugerenciasReubicacion = [] } = mobilityData || {}
  const postulantesMapped = mobilityData?.asesoresMapeados || mobilityData?.postulantesMapped || []

  // Filtrar postulantes según la sede seleccionada (respetando la lista ya filtrada por modalidad/estado)
  const filteredPostulantes = useMemo(() => {
    if (!selectedSedeId || selectedSedeId === 'TODAS') return postulantesMapped
    return postulantesMapped.filter(p => p.sede?.id === selectedSedeId)
  }, [postulantesMapped, selectedSedeId])

  // 1. Inicializar Leaflet con el mapa centrado en Lima Metropolitana
  useEffect(() => {
    let isMounted = true

    ensureLeaflet().then((L) => {
      if (!isMounted || !mapContainerRef.current) return
      setIsLeafletReady(true)

      if (!mapInstanceRef.current) {
        // Coordenadas centrales de Lima Metropolitana
        const map = L.map(mapContainerRef.current, {
          center: [-12.065, -77.035],
          zoom: 12,
          zoomControl: false,
          attributionControl: false
        })

        // Control de zoom en la esquina inferior derecha
        L.control.zoom({ position: 'bottomright' }).addTo(map)

        // Crear grupos de capas
        tileLayerRef.current = L.tileLayer(MAP_LAYERS[activeLayer].url, {
          maxZoom: MAP_LAYERS[activeLayer].maxZoom,
          subdomains: MAP_LAYERS[activeLayer].subdomains
        }).addTo(map)

        polylinesLayerRef.current = L.layerGroup().addTo(map)
        markersLayerRef.current = L.layerGroup().addTo(map)
        sedesLayerRef.current = L.layerGroup().addTo(map)

        mapInstanceRef.current = map
      }
    }).catch(err => {
      console.error('Error cargando Leaflet:', err)
    })

    return () => {
      isMounted = false
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [])

  // 2. Cambio de capa (Google Calles / Satelital / Dark)
  useEffect(() => {
    const L = window.L
    if (!L || !mapInstanceRef.current || !tileLayerRef.current) return

    mapInstanceRef.current.removeLayer(tileLayerRef.current)
    const layerConfig = MAP_LAYERS[activeLayer]

    tileLayerRef.current = L.tileLayer(layerConfig.url, {
      maxZoom: layerConfig.maxZoom,
      subdomains: layerConfig.subdomains
    }).addTo(mapInstanceRef.current)
  }, [activeLayer])

  // 3. Vuelo de cámara animado a la sede seleccionada
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    if (selectedSedeId && selectedSedeId !== 'TODAS') {
      const sede = GEA_SEDES[selectedSedeId]
      if (sede) {
        map.flyTo([sede.lat, sede.lng], 13.5, { duration: 1.2 })
      }
    } else {
      map.flyTo([-12.065, -77.035], 12, { duration: 1.2 })
    }
  }, [selectedSedeId])


  // ── OPTIMIZACIÓN: Debounce de 150ms para no redibujar 284 markers en cada keystroke ──

  const renderDebounceRef = useRef(null)

  useEffect(() => {
    const L = window.L
    if (!L || !mapInstanceRef.current || !isLeafletReady) return

    clearTimeout(renderDebounceRef.current)
    renderDebounceRef.current = setTimeout(() => {
      // Limpiar capas anteriores
      polylinesLayerRef.current.clearLayers()
      markersLayerRef.current.clearLayers()
      sedesLayerRef.current.clearLayers()

      // ── A. DIBUJAR SEDES GEA CON RADAR Y COBERTURA ──
      Object.values(GEA_SEDES).forEach(s => {
        const isSelected = selectedSedeId === 'TODAS' || selectedSedeId === s.id
        const opacity = isSelected ? 1 : 0.35

        // Círculo de cobertura de 5km de la sede
        L.circle([s.lat, s.lng], {
          radius: 4500,
          color: s.color,
          fillColor: s.color,
          fillOpacity: isSelected ? 0.08 : 0.02,
          weight: 1.5,
          dashArray: '4, 8'
        }).addTo(sedesLayerRef.current)

        // Marcador HTML personalizado de la Sede
        const sedeIcon = L.divIcon({
          className: 'custom-sede-pin',
          html: `
            <div style="transform: translate(-50%, -50%); opacity: ${opacity};" class="flex flex-col items-center cursor-pointer select-none">
              <div style="background: ${s.color}; box-shadow: 0 0 16px ${s.color};" class="w-7 h-7 rounded-xl flex items-center justify-center text-slate-950 font-black border-2 border-white text-xs">
                🏢
              </div>
              <div style="background: rgba(10,16,34,0.9); border: 1px solid ${s.color}; color: ${s.color};" class="px-2 py-0.5 rounded-full text-[9px] font-black font-mono tracking-wider uppercase mt-1 shadow-lg whitespace-nowrap">
                ${s.nombre.replace('Sede ', '')}
              </div>
            </div>
          `,
          iconSize: [30, 30]
        })

        const marker = L.marker([s.lat, s.lng], { icon: sedeIcon }).addTo(sedesLayerRef.current)
        marker.on('click', () => onSelectSede && onSelectSede(s.id))
        marker.bindPopup(`
          <div style="font-family: monospace; font-size: 12px; color: #0f172a; padding: 4px;">
            <strong style="color: #0284c7; font-size: 13px;">${s.nombre}</strong><br/>
            📍 ${s.direccion}<br/>
            <hr style="margin: 6px 0; border: none; border-top: 1px solid #e2e8f0;"/>
            <small>Asesores asignados a esta sede: <strong>${postulantesMapped.filter(p => p.sede?.id === s.id).length}</strong></small>
          </div>
        `)
      })

      // ── B. DIBUJAR ASESORES COMO PUNTOS DE COLOR SEGÚN LA SEDE A LA QUE POSTULAN ──
      const displayList = filteredPostulantes.slice(0, 300)

      displayList.forEach(p => {
        if (!p.origenLat || !p.origenLng) return

        const isRemoto = p.modalidad === 'REMOTO'
        const isIOP = p.esIOP
        const isBaja = p.esBaja
        const isCritical = !isRemoto && p.distanciaKm > 14
        const isReubicacion = mapMode === 'reubicacion' && Boolean(p.sedeSugerida)

        // ── CADA POSTULANTE TOMA EL MISMO COLOR DE LA SEDE A LA QUE POSTULA ──
        // Ate -> Verde (#10B981)
        // Surco -> Ámbar (#F59E0B)
        // San Isidro -> Cian (#06B6D4)
        // Comas -> Rosa (#EC4899)
        // Remoto -> Violeta (#8B5CF6)
        const sedeColor = isRemoto
          ? '#8B5CF6'
          : (p.sede?.color || (p.sede?.id && GEA_SEDES[p.sede.id]?.color) || '#10B981')

        // Dibujar línea SOLO si el usuario activa explícitamente 'trayectorias' o está en modo 'reubicacion'
        if (!isRemoto && p.destinoLat && p.destinoLng && (mapMode === 'trayectorias' || (mapMode === 'reubicacion' && p.sedeSugerida))) {
          const polyline = L.polyline(
            [[p.origenLat, p.origenLng], [p.destinoLat, p.destinoLng]],
            {
              color: isReubicacion ? '#10B981' : sedeColor,
              weight: isReubicacion ? 2.5 : 1.8,
              opacity: isReubicacion ? 0.85 : 0.5,
              dashArray: isCritical ? '6, 6' : undefined
            }
          ).addTo(polylinesLayerRef.current)

          polyline.on('mouseover', () => setHoveredAsesor(p))
          polyline.on('mouseout', () => setHoveredAsesor(null))
        }

        // Marcador circular del postulante: color idéntico al de su sede
        const circleMarker = L.circleMarker([p.origenLat, p.origenLng], {
          radius: isIOP ? 5.5 : 4.5,
          color: '#ffffff',
          weight: 1.4,
          fillColor: sedeColor,
          fillOpacity: 0.95
        }).addTo(markersLayerRef.current)

        circleMarker.on('mouseover', () => {
          circleMarker.setRadius(7)
          setHoveredAsesor(p)
        })
        circleMarker.on('mouseout', () => {
          circleMarker.setRadius(isIOP ? 5.5 : 4.5)
          setHoveredAsesor(null)
        })

        const badgeEstado = isIOP
          ? '<span style="background:#10b981;color:#fff;padding:2px 6px;border-radius:4px;font-weight:bold;font-size:9px;">INGRESÓ A OP (I-OP)</span>'
          : isBaja
          ? '<span style="background:#ef4444;color:#fff;padding:2px 6px;border-radius:4px;font-weight:bold;font-size:9px;">BAJA / CESADO</span>'
          : '<span style="background:#0284c7;color:#fff;padding:2px 6px;border-radius:4px;font-weight:bold;font-size:9px;">ACTIVO EN CAPA</span>'

        const badgeModalidad = isRemoto
          ? '<span style="background:#4338ca;color:#e0e7ff;padding:2px 6px;border-radius:4px;font-weight:bold;font-size:9px;">REMOTO (TELETRABAJO)</span>'
          : '<span style="background:#0f766e;color:#ccfbf1;padding:2px 6px;border-radius:4px;font-weight:bold;font-size:9px;">PRESENCIAL</span>'

        circleMarker.bindPopup(`
          <div style="font-family: monospace; font-size: 11px; color: #0f172a; min-width: 210px;">
            <div style="margin-bottom:4px;">
              <strong style="font-size: 12px; color: #0284c7;">${p.nombre || p.candidato}</strong>
            </div>
            <div style="margin-bottom:6px; display:flex; gap:4px; flex-wrap:wrap;">
              ${badgeModalidad} ${badgeEstado}
            </div>
            ${p.documento ? `<div>📄 <strong>DNI:</strong> ${p.documento}</div>` : ''}
            <div>🏠 <strong>Domicilio:</strong> ${p.distrito}</div>
            ${p.direccion ? `<small style="color: #64748b;">${p.direccion}</small><br/>` : ''}
            <div style="margin: 4px 0;">
              🏢 <strong>Sede Postulada:</strong>
              <span style="background:${sedeColor}; color:#000; font-weight:900; padding:2px 6px; border-radius:4px; font-size:10px; margin-left:4px; display:inline-block;">
                ${p.sede?.nombre || 'GEA'}
              </span>
            </div>
            ${!isRemoto ? `<div>📏 <strong>Distancia a Sede:</strong> ${p.distanciaKm} km (~${p.tiempoEstimadoMin} min)</div>` : '<div>💻 <strong>Modalidad:</strong> Sin desplazamiento físico a sede</div>'}
            ${p.esBaja && p.motivoBaja ? `<div style="margin-top: 4px; color: #dc2626; font-weight:bold;">⚠️ Motivo Baja: ${p.motivoBaja}</div>` : ''}
            ${p.sedeSugerida ? `<div style="margin-top: 4px; padding: 4px; background: #ecfdf5; border-radius: 4px; color: #059669; font-weight: bold;">⚡ Sugerencia de Sede: ${p.sedeSugerida} (Ahorra ${p.ahorroKm} km)</div>` : ''}
          </div>
        `)
      })
    }, 150) // 150ms de debounce: absorbe cambios rápidos de filtro

    return () => clearTimeout(renderDebounceRef.current)
  }, [filteredPostulantes, selectedSedeId, mapMode, isLeafletReady, postulantesMapped, onSelectSede])


  return (
    <div className="relative w-full h-full flex flex-col justify-between overflow-hidden rounded-2xl border border-cyan-500/25 bg-[#050B14] shadow-[0_0_50px_rgba(6,182,212,0.15)] select-none">
      
      {/* ─────────────────────────────────────────────────────────────
          1. HEADER DEL MAPA: SELECTOR DE SEDES & CAPAS GOOGLE MAPS
          ───────────────────────────────────────────────────────────── */}
      <div className="relative z-30 w-full px-3 py-2 flex flex-wrap items-center justify-between gap-2 border-b border-cyan-500/20 bg-slate-950/85 backdrop-blur-md">
        
        {/* Izquierda: Selector de Sede GEA */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 font-mono text-xs font-black uppercase">
            <Compass size={13} className="animate-spin text-cyan-400" style={{ animationDuration: '18s' }} />
            <span>GOOGLE MAPS // LIMA</span>
          </div>

          <div className="flex items-center gap-1 text-xs font-mono">
            <select
              value={selectedSedeId}
              onChange={(e) => onSelectSede && onSelectSede(e.target.value)}
              className="px-2.5 py-1 rounded-lg bg-[#0b1728] border border-cyan-500/40 text-cyan-200 font-bold text-xs focus:outline-none focus:ring-1 focus:ring-cyan-400 cursor-pointer shadow-sm"
            >
              <option value="TODAS">✦ TODAS LAS SEDES GEA</option>
              {Object.values(GEA_SEDES).map(s => (
                <option key={s.id} value={s.id}>
                  🏢 {s.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Centro: Selector de Capas Cartográficas (Google Calles / Satelital / Cyber Dark) */}
        <div className="flex items-center p-0.5 rounded-lg bg-black/60 border border-white/15 text-[11px] font-mono">
          {Object.values(MAP_LAYERS).map(layer => (
            <button
              key={layer.id}
              onClick={() => setActiveLayer(layer.id)}
              className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 cursor-pointer font-bold ${
                activeLayer === layer.id
                  ? 'bg-cyan-500 text-slate-950 shadow-[0_0_10px_rgba(6,182,212,0.6)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>{layer.icon}</span>
              <span>{layer.label}</span>
            </button>
          ))}
        </div>

        {/* Derecha: Selector de Modo (Puntos por Sede / Líneas / Reubicación) */}
        <div className="flex items-center p-0.5 rounded-lg bg-black/60 border border-white/15 text-[11px] font-mono">
          <button
            onClick={() => setMapMode('puntos')}
            className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1.5 cursor-pointer font-bold ${
              mapMode === 'puntos'
                ? 'bg-emerald-500 text-slate-950 shadow-[0_0_12px_rgba(16,185,129,0.7)]'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Ver solo puntos de color correspondientes a cada sede (sin líneas de enlace)"
          >
            <MapPin size={11} />
            <span>Puntos por Sede</span>
          </button>
          <button
            onClick={() => setMapMode('trayectorias')}
            className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1.5 cursor-pointer font-bold ${
              mapMode === 'trayectorias'
                ? 'bg-cyan-500 text-slate-950 shadow-[0_0_12px_rgba(6,182,212,0.7)]'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Activar líneas de desplazamiento desde el domicilio hasta la sede"
          >
            <Navigation size={11} />
            <span>Líneas de Viaje</span>
          </button>
          <button
            onClick={() => setMapMode('reubicacion')}
            className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1.5 cursor-pointer font-bold ${
              mapMode === 'reubicacion'
                ? 'bg-amber-500 text-slate-950 shadow-[0_0_12px_rgba(245,158,11,0.7)]'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Oportunidades de cambio de sede para evitar deserciones"
          >
            <Zap size={11} />
            <span>Reubicación ({sugerenciasReubicacion.length})</span>
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          2. CONTENEDOR DEL MAPA REAL (LEAFLET / GOOGLE MAPS)
          ───────────────────────────────────────────────────────────── */}
      <div className="relative flex-1 w-full h-full min-h-[380px] overflow-hidden bg-[#070e1b]">
        
        {/* Leyenda Visual Flotante: Código de Color de Cada Sede */}
        <div className="absolute top-3 left-3 z-30 flex flex-wrap items-center gap-1.5 p-2 rounded-xl bg-slate-950/85 backdrop-blur-md border border-cyan-500/30 shadow-[0_4px_20px_rgba(0,0,0,0.5)] text-xs font-mono">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mr-1">Colores Sede:</span>
          {Object.values(GEA_SEDES).map(s => {
            const isSelected = selectedSedeId === s.id
            const countSede = postulantesMapped.filter(p => p.sede?.id === s.id).length
            return (
              <button
                key={s.id}
                onClick={() => onSelectSede && onSelectSede(isSelected ? 'TODAS' : s.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all cursor-pointer text-[11px] font-bold ${
                  isSelected
                    ? 'bg-white/20 text-white shadow-md'
                    : 'bg-black/50 text-slate-200 hover:bg-white/10'
                }`}
                style={{
                  borderColor: s.color,
                  boxShadow: isSelected ? `0 0 10px ${s.color}` : undefined
                }}
                title={`Filtrar por ${s.nombre} (${countSede} asesores)`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full inline-block shrink-0 shadow-sm"
                  style={{ backgroundColor: s.color, boxShadow: `0 0 6px ${s.color}` }}
                />
                <span>{s.nombre.replace('Sede ', '').split(' (')[0]}</span>
                <span className="opacity-60 text-[10px]">({countSede})</span>
              </button>
            )
          })}
        </div>

        {/* Contenedor Leaflet */}
        <div ref={mapContainerRef} className="w-full h-full z-10" />

        {/* Tooltip HUD flotante al pasar el mouse por un asesor */}
        {hoveredAsesor && (
          <div className="absolute bottom-4 left-4 z-40 p-3 rounded-xl border border-cyan-500/50 bg-[#070e1b]/95 backdrop-blur-md text-white shadow-[0_0_30px_rgba(6,182,212,0.3)] max-w-xs font-mono text-xs animate-in fade-in duration-150 pointer-events-none">
            <div className="flex items-center justify-between border-b border-white/10 pb-1.5 mb-1.5">
              <span className="font-black text-white truncate max-w-[170px]">
                {hoveredAsesor.nombre || hoveredAsesor.candidato}
              </span>
              <span
                className={`px-1.5 py-0.2 rounded text-[10px] font-black ${
                  hoveredAsesor.distanciaKm > 14
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                }`}
              >
                {hoveredAsesor.distanciaKm} KM
              </span>
            </div>
            <div className="space-y-1 text-[11px] text-slate-300">
              <div>🏠 <strong>Domicilio:</strong> {hoveredAsesor.distrito}</div>
              <div>🏢 <strong>Sede:</strong> {hoveredAsesor.sede?.nombre}</div>
              <div className="text-amber-300 flex items-center gap-1">
                <Clock size={11} />
                <span>Viaje estimado: ~{hoveredAsesor.tiempoEstimadoMin} min</span>
              </div>
              {hoveredAsesor.sedeSugerida && (
                <div className="mt-1.5 p-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px]">
                  ⚡ <strong>Sede óptima:</strong> {hoveredAsesor.sedeSugerida} (Ahorra {hoveredAsesor.ahorroKm} km)
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          3. FOOTER DEL MAPA: HUD INFERIOR CON MÉTRICAS EN TIEMPO REAL
          ───────────────────────────────────────────────────────────── */}
      <div className="relative z-30 w-full px-4 py-2 border-t border-cyan-500/20 bg-slate-950/90 backdrop-blur-md flex flex-wrap items-center justify-between text-xs font-mono gap-3">
        <div className="flex items-center gap-4 text-slate-300">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-bold">TOTAL ASESORES:</span>
            <span className="text-white font-black text-sm">{filteredPostulantes.length}</span>
          </div>
          <span className="opacity-30">|</span>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-bold">DISTANCIA PROM.:</span>
            <span className="text-cyan-400 font-black text-sm">
              {filteredPostulantes.length > 0 
                ? (filteredPostulantes.reduce((acc, p) => acc + (p.distanciaKm || 0), 0) / filteredPostulantes.length).toFixed(1)
                : '0.0'} km
            </span>
          </div>
          <span className="opacity-30">|</span>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-bold">EN RIESGO (&gt;14KM):</span>
            <span className="text-rose-400 font-black text-sm">
              {filteredPostulantes.filter(p => (p.distanciaKm || 0) > 14).length}
            </span>
          </div>
        </div>

        {sugerenciasReubicacion.length > 0 && (
          <button
            onClick={onOpenReasignacionModal}
            className="px-3 py-1 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-[0_0_15px_rgba(16,185,129,0.5)] transition-all cursor-pointer active:scale-95"
          >
            <Zap size={12} />
            <span>{sugerenciasReubicacion.length} Reubicaciones Disponibles</span>
          </button>
        )}
      </div>
    </div>
  )
}
