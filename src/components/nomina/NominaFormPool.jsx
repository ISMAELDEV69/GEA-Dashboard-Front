import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  fetchGoogleSpreadsheetWorkbookData,
  parseSheetMatrixCandidates,
  fetchGoogleFormsPool
} from '../../lib/dataService'
import { NOMINA_DB_FIELDS } from '../../lib/nominaConsolidadoSchema'
import { supabase } from '../../lib/supabase'
import {
  Loader2, Search, CheckSquare, Square, DownloadCloud,
  AlertTriangle, Trash2, RefreshCw, Users, UserCheck,
  CheckCircle2, X, ChevronDown, ChevronLeft, ChevronRight, Link2, FileSpreadsheet,
  Layers, Sparkles, ExternalLink, ArrowRight, ShieldAlert, Check, Lock, Calendar, Tag, Activity
} from 'lucide-react'
import * as XLSX from 'xlsx'

const DEFAULT_GOOGLE_FORM_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQNqbcgwWaeZiPwDaetDMft_rwv6BWFM-wNdA10VIKVWLo5uvnPFcbHgHvrDIiUyyWa08pDWN_VNX0e/pubhtml'

function getRecordTimestamp(r) {
  const d = r.fecha_inicio_capacitacion || r.created_at || r.marca_temporal
  if (!d) return 0
  const time = new Date(d).getTime()
  return isNaN(time) ? 0 : time
}

function getFechaInicioDisplay(assignment, gruposList = []) {
  if (!assignment) return '—'
  
  if (assignment.fecha_inicio_capacitacion) {
    const s = String(assignment.fecha_inicio_capacitacion).trim()
    const parts = s.split('T')[0].split('-')
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
    return s
  }

  if (assignment.grupo_codigo && Array.isArray(gruposList) && gruposList.length > 0) {
    const cleanAssignGroup = String(assignment.grupo_codigo).trim().toUpperCase()
    const g = gruposList.find(grp => 
      String(grp.codigo || grp.grupo_codigo || '').trim().toUpperCase() === cleanAssignGroup
    )
    if (g) {
      const rawDate = g.fecha_inicio || g.fecha_capacitacion || g.fecha_inicio_capacitacion
      if (rawDate) {
        const parts = String(rawDate).trim().split('T')[0].split('-')
        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
        return String(rawDate).split('T')[0]
      }
    }
  }

  const fallback = assignment.dia_0 || assignment.created_at || assignment.marca_temporal
  if (fallback) {
    const parts = String(fallback).trim().split('T')[0].split('-')
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
    return String(fallback).split('T')[0]
  }

  return '—'
}

function getEstadoDisplay(assignment) {
  if (!assignment) return 'ACTIVO'
  
  // 1. Si viene un campo explícito de ult_estado / ultimo_estado
  if (assignment.ult_estado) {
    const u = String(assignment.ult_estado).trim().toUpperCase()
    if (u.includes('CES') || u.includes('BAJA') || u.includes('NO ACTIVO') || u === 'INACTIVO') return 'CESADO'
    if (u.includes('ACT') || u.includes('CAPACIT') || u.includes('OJT') || u.includes('OPERAC')) return 'ACTIVO'
    return u
  }

  // 2. Si activo es boolean false
  if (assignment.activo === false) return 'CESADO'

  const rawEstado = String(assignment.estado || '').trim().toUpperCase()
  const rawStatusFinal = String(assignment.status_final || '').trim().toUpperCase()
  const rawStatusD1 = String(assignment.status_dia_1 || '').trim().toUpperCase()
  const rawMotivo = String(assignment.motivo_baja || assignment.observacion_estado || '').trim().toUpperCase()
  const rawSigla = String(assignment.sigla || '').trim().toUpperCase()

  if (
    rawEstado === 'CESADO' || rawEstado === 'BAJA' ||
    rawStatusFinal.includes('BAJA') || rawStatusFinal.includes('CESAD') ||
    rawStatusD1.includes('BAJA') || rawStatusD1.includes('DESERC') ||
    rawSigla === 'B' ||
    rawMotivo.includes('BAJA') || rawMotivo.includes('CES')
  ) {
    return 'CESADO'
  }

  return 'ACTIVO'
}

function PoolStat({ label, value, color, icon: Icon }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 min-w-[130px]">
      {Icon && (
        <div className="p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)]">
          <Icon size={14} style={{ color }} />
        </div>
      )}
      <div>
        <span className="text-base font-black tracking-tight" style={{ color }}>{value}</span>
        <p className="text-[9.5px] text-[var(--text-muted)] font-bold uppercase tracking-wider">{label}</p>
      </div>
    </div>
  )
}

export default function NominaFormPool({
  bulkPeriodo,
  bulkSegmento,
  bulkCampana,
  bulkGrupo,
  onSelectGrupo,
  reclutador,
  grupos = []
}) {
  const fileInputRef                        = React.useRef(null)
  const [sheetUrl, setSheetUrl]             = useState(() => {
    const saved = localStorage.getItem('gea_pool_sheet_url')
    if (saved && (saved.includes('1eP1knjS4Dt2jT-HI6CAZlURw9LB215Go6QVlbbKaniU') || !saved.includes('2PACX-'))) {
      return DEFAULT_GOOGLE_FORM_URL
    }
    return saved || DEFAULT_GOOGLE_FORM_URL
  })
  const [workbookData, setWorkbookData]     = useState(null)
  const [sheetNames, setSheetNames]         = useState([])
  const [selectedSheet, setSelectedSheet]   = useState('')
  const [loading, setLoading]               = useState(false)
  const [connecting, setConnecting]         = useState(false)
  const [poolData, setPoolData]             = useState([])
  const [latestAssignedDocs, setLatestAssignedDocs] = useState(new Map())
  const [selectedDocs, setSelectedDocs]     = useState(new Set())
  const [search, setSearch]                 = useState('')
  const [page, setPage]                     = useState(1)
  const [pageSize, setPageSize]             = useState(50)
  const [error, setError]                   = useState(null)
  const [success, setSuccess]               = useState(null)
  const [importing, setImporting]           = useState(false)
  const [importProgress, setImportProgress] = useState(0)

  // Carga directa de archivo .xlsx desde el disco
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setConnecting(true)
      setError(null)
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: 'array' })
      const names = workbook.SheetNames || []
      if (names.length === 0) throw new Error('El archivo no contiene hojas válidas.')

      const wbInfo = {
        type: 'workbook',
        workbook,
        sheetNames: names,
        docId: file.name
      }
      setWorkbookData(wbInfo)
      setSheetNames(names)

      let matchedSheet = names[0]
      if (bulkGrupo) {
        const cleanGrp = bulkGrupo.toUpperCase().replace(/[^A-Z0-9]/g, '')
        const found = names.find(n => {
          const cleanName = n.toUpperCase().replace(/[^A-Z0-9]/g, '')
          return cleanName.includes(cleanGrp) || cleanGrp.includes(cleanName)
        })
        if (found) matchedSheet = found
      } else {
        const firstGpe = matchedSheet.match(/GPE-\d+/i)?.[0]
        if (firstGpe && onSelectGrupo) onSelectGrupo(firstGpe)
      }
      setSelectedSheet(matchedSheet)
      await loadSheetCandidates(wbInfo, matchedSheet)
      setSuccess(`✅ Archivo "${file.name}" cargado con éxito. Se detectaron ${names.length} hojas.`)
      setTimeout(() => setSuccess(null), 5000)
    } catch (err) {
      setError(`Error al leer el archivo Excel: ${err.message}`)
    } finally {
      setConnecting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // 1. Connect and extract Sheets / Tabs from Google Spreadsheet
  const connectSpreadsheet = useCallback(async (customUrl) => {
    const targetUrl = customUrl || sheetUrl
    if (!targetUrl.trim()) {
      setError('Por favor ingresa un enlace de Google Sheets.')
      return
    }

    try {
      setConnecting(true)
      setError(null)
      localStorage.setItem('gea_pool_sheet_url', targetUrl.trim())

      const wbInfo = await fetchGoogleSpreadsheetWorkbookData(targetUrl)
      setWorkbookData(wbInfo)
      const names = wbInfo.sheetNames || ['Hoja 1']
      setSheetNames(names)

      // Auto-match sheet based on selected Grupo, Campaña or "Respuestas de formulario"
      let matchedSheet = names.find(n => n.toLowerCase().includes('respuestas') || n.toLowerCase().includes('formulario')) || names[0]
      if (bulkGrupo) {
        const cleanGrp = bulkGrupo.toUpperCase().replace(/[^A-Z0-9]/g, '')
        const found = names.find(n => {
          const cleanName = n.toUpperCase().replace(/[^A-Z0-9]/g, '')
          return cleanName.includes(cleanGrp) || cleanGrp.includes(cleanName)
        })
        if (found) matchedSheet = found
      } else if (bulkCampana) {
        const cleanCamp = bulkCampana.toUpperCase().slice(0, 8)
        const found = names.find(n => n.toUpperCase().includes(cleanCamp))
        if (found) matchedSheet = found
      } else {
        const firstGpe = matchedSheet.match(/GPE-\d+/i)?.[0]
        if (firstGpe && onSelectGrupo) onSelectGrupo(firstGpe)
      }

      setSelectedSheet(matchedSheet)
      await loadSheetCandidates(wbInfo, matchedSheet)
    } catch (err) {
      console.error('Error conectando Google Spreadsheet:', err)
      setError(err.message || 'No se pudo leer el documento de Google Sheets. Verifica que el enlace tenga permisos de lectura.')
    } finally {
      setConnecting(false)
    }
  }, [sheetUrl, bulkGrupo, bulkCampana, onSelectGrupo])

  // 2. Parse candidates from the selected sheet tab & check DB assignments
  const loadSheetCandidates = useCallback(async (wbInfo, sheetName) => {
    if (!wbInfo) return
    try {
      setLoading(true)
      setError(null)

      let matrix = []
      if (wbInfo.type === 'workbook') {
        const targetSheetName = sheetName || wbInfo.sheetNames[0]
        const worksheet = wbInfo.workbook.Sheets[targetSheetName]
        if (worksheet) {
          matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
        }
      } else if (wbInfo.type === 'published_sheets') {
        const targetSheetName = sheetName || wbInfo.sheetNames[0]
        if (targetSheetName === wbInfo.currentSheet && wbInfo.matrix && wbInfo.matrix.length > 0) {
          matrix = wbInfo.matrix
        } else {
          const cleanTarget = String(targetSheetName || '').trim().toUpperCase()
          let gid = wbInfo.sheetMap?.[targetSheetName]
          if (gid === undefined && wbInfo.sheetMap) {
            const foundKey = Object.keys(wbInfo.sheetMap).find(k => k.trim().toUpperCase() === cleanTarget)
            if (foundKey) gid = wbInfo.sheetMap[foundKey]
          }

          const docId = (wbInfo.docId && wbInfo.docId !== 'published_form')
            ? wbInfo.docId
            : (sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9\-_]+)/)?.[1] || null)

          let csvText = null
          const urlsToTry = []
          
          if (docId && gid !== undefined) {
            urlsToTry.push(`https://docs.google.com/spreadsheets/d/${docId}/gviz/tq?tqx=out:csv&gid=${gid}`)
          }
          if (wbInfo.baseUrl && gid !== undefined) {
            urlsToTry.push(`${wbInfo.baseUrl}/pub?gid=${gid}&single=true&output=csv`)
          }
          if (docId && gid !== undefined) {
            urlsToTry.push(`https://docs.google.com/spreadsheets/d/${docId}/export?format=csv&gid=${gid}`)
          }

          for (const url of urlsToTry) {
            try {
              const resp = await fetch(url)
              if (resp.ok) {
                const text = await resp.text()
                if (text && !text.includes('<!DOCTYPE html>')) {
                  csvText = text
                  break
                }
              }
            } catch (e) {
              console.warn('Fetch error on tab url:', url, e)
            }
          }

          if (csvText) {
            const { parseCsvToMatrix } = await import('../../lib/nominaConsolidadoSchema.js')
            matrix = parseCsvToMatrix(csvText)
          } else {
            matrix = []
          }
        }
      } else {
        matrix = wbInfo.matrix || []
      }

      const data = await parseSheetMatrixCandidates(matrix)

      // Deduplicar postulantes por DNI (conservando la respuesta más reciente del formulario)
      const deduplicatedMap = new Map()
      data.forEach(item => {
        const doc = String(item.documento || '').trim()
        if (!doc) return
        if (!deduplicatedMap.has(doc)) {
          deduplicatedMap.set(doc, item)
        } else {
          const existing = deduplicatedMap.get(doc)
          const tExisting = new Date(existing.marca_temporal || 0).getTime()
          const tItem = new Date(item.marca_temporal || 0).getTime()
          if (tItem >= tExisting) {
            deduplicatedMap.set(doc, item)
          }
        }
      })
      const uniqueData = Array.from(deduplicatedMap.values())

      // Consultar historial de asignaciones de todos los postulantes en la base de datos
      const uniqueDnis = uniqueData.map(d => String(d.documento || '').trim()).filter(Boolean)
      const historyMap = new Map()

      if (uniqueDnis.length > 0) {
        const chunkSize = 200
        for (let i = 0; i < uniqueDnis.length; i += chunkSize) {
          const chunk = uniqueDnis.slice(i, i + chunkSize)
          const { data: existing, error: fetchErr } = await supabase
            .from('nominas')
            .select('id, documento, marca_temporal, campana, grupo_codigo, reclutador, semana_trabajo, periodo_reclutado, fecha_inicio_capacitacion, status_final, status_dia_1, estado, activo, observacion_estado, motivo_baja, dia_0, dia_1, created_at')
            .in('documento', chunk)
            .order('created_at', { ascending: false })

          if (!fetchErr && existing) {
            existing.forEach(r => {
              const doc = String(r.documento || '').trim()
              if (!doc) return
              if (!historyMap.has(doc)) {
                historyMap.set(doc, [])
              }
              historyMap.get(doc).push(r)
            })
          }
        }
      }

      // Tomar siempre el ÚLTIMO grupo en el que el postulante haya estado
      const latestMap = new Map()
      historyMap.forEach((records, doc) => {
        const sorted = [...records].sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a))
        if (sorted.length > 0) {
          latestMap.set(doc, sorted[0])
        }
      })

      setPoolData(uniqueData)
      setLatestAssignedDocs(latestMap)
      setSelectedDocs(new Set())
    } catch (err) {
      setError(`Error al leer la hoja "${sheetName}": ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [bulkGrupo, selectedSheet])

  // Initial load
  useEffect(() => {
    connectSpreadsheet()
  }, [])

  // Auto-switch tab if bulkGrupo changes and matches another sheet
  useEffect(() => {
    if (!bulkGrupo || !sheetNames.length || !workbookData) return
    const cleanGrp = bulkGrupo.toUpperCase().replace(/[^A-Z0-9]/g, '')
    const match = sheetNames.find(n => {
      const cleanName = n.toUpperCase().replace(/[^A-Z0-9]/g, '')
      return cleanName.includes(cleanGrp) || cleanGrp.includes(cleanName)
    })
    if (match && match !== selectedSheet) {
      setSelectedSheet(match)
      loadSheetCandidates(workbookData, match)
    }
  }, [bulkGrupo, sheetNames, workbookData, selectedSheet, loadSheetCandidates])

  const handleSheetChange = (sheetName) => {
    setSelectedSheet(sheetName)
    const tabGpeMatch = sheetName.match(/GPE-\d+/i)?.[0]
    if (tabGpeMatch && onSelectGrupo) {
      onSelectGrupo(tabGpeMatch)
    }
    loadSheetCandidates(workbookData, sheetName)
  }

  // Filter available data
  const availableData = useMemo(() => {
    let list = poolData.filter(d => d.documento)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(d =>
        String(d.documento || '').toLowerCase().includes(q) ||
        String(d.nombres || '').toLowerCase().includes(q) ||
        String(d.apellido_paterno || '').toLowerCase().includes(q) ||
        String(d.apellido_materno || '').toLowerCase().includes(q) ||
        String(d.celular || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [poolData, search])

  const totalPages = Math.max(1, Math.ceil(availableData.length / pageSize))

  const paginatedData = useMemo(() => {
    const start = (page - 1) * pageSize
    return availableData.slice(start, start + pageSize)
  }, [availableData, page, pageSize])

  // Solo se pueden seleccionar postulantes NUEVOS (que no hayan sido asignados a ningún grupo)
  const selectableData = useMemo(() =>
    availableData.filter(d => !latestAssignedDocs.has(String(d.documento || '').trim()))
  , [availableData, latestAssignedDocs])

  const poolStats = useMemo(() => ({
    total: poolData.length,
    disponibles: selectableData.length,
    yaIngresados: poolData.filter(d => latestAssignedDocs.has(String(d.documento || '').trim())).length,
    seleccionados: selectedDocs.size,
  }), [poolData, selectableData, latestAssignedDocs, selectedDocs])

  const toggleSelect = (doc, marca) => {
    const cleanDoc = String(doc || '').trim()
    // Si ya está adjudicado, no permitir seleccionar
    if (latestAssignedDocs.has(cleanDoc)) return
    const key = `${cleanDoc}|${marca}`
    const next = new Set(selectedDocs)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setSelectedDocs(next)
  }

  const toggleAll = () => {
    if (selectedDocs.size === selectableData.length && selectableData.length > 0) {
      setSelectedDocs(new Set())
    } else {
      setSelectedDocs(new Set(selectableData.map(d => `${String(d.documento || '').trim()}|${d.marca_temporal}`)))
    }
  }

  const selectCurrentPage = () => {
    const pageSelectable = paginatedData.filter(d => !latestAssignedDocs.has(String(d.documento || '').trim()))
    const next = new Set(selectedDocs)
    pageSelectable.forEach(d => next.add(`${String(d.documento || '').trim()}|${d.marca_temporal}`))
    setSelectedDocs(next)
  }

  const handleSaveClick = async () => {
    if (!bulkPeriodo || !bulkSegmento || !bulkCampana || !bulkGrupo) {
      setError('⚠️ Selecciona Periodo, Segmento, Campaña y Grupo en los filtros superiores antes de importar.')
      return
    }
    if (selectedDocs.size === 0) {
      setError('Selecciona al menos un postulante nuevo disponible para importar.')
      return
    }
    executeSave()
  }

  const executeSave = async () => {
    try {
      setImporting(true)
      setImportProgress(0)
      setError(null)

      const matchedGrupoObj = grupos.find(g =>
        (g.grupo_codigo === bulkGrupo || g.codigo === bulkGrupo) &&
        (!bulkCampana || String(g.campana).trim() === String(bulkCampana).trim())
      )

      const semanaNum = parseInt(String(matchedGrupoObj?.semana_label || matchedGrupoObj?.semana || '').replace(/\D/g, '')) || null

      const validFieldsSet = new Set(NOMINA_DB_FIELDS)
      validFieldsSet.add('activo')

      // Filtra solo los seleccionados que no estén previamente registrados
      const toInsert = poolData
        .filter(d => selectedDocs.has(`${String(d.documento || '').trim()}|${d.marca_temporal}`))
        .filter(d => !latestAssignedDocs.has(String(d.documento || '').trim()))
        .map(d => {
          const safeMarcaTemporal = (d.marca_temporal && !isNaN(new Date(d.marca_temporal).getTime()) && new Date(d.marca_temporal).getFullYear() >= 1990)
            ? new Date(d.marca_temporal).toISOString()
            : new Date().toISOString()

          const rawPayload = {
            ...d,
            marca_temporal: safeMarcaTemporal,
            periodo_reclutado: matchedGrupoObj?.periodo || bulkPeriodo,
            semana_trabajo: semanaNum,
            reclutador: reclutador || d.reclutador || 'RECLUTAMIENTO',
            campana: bulkCampana,
            segmento: bulkSegmento,
            grupo_codigo: bulkGrupo,
            status_dia_1: d.status_dia_1 || 'APTO',
            dia_0: d.dia_0 || null,
            dia_0_obs: d.dia_0_obs || null,
            dia_1: d.dia_1 || null,
            dia_1_obs: d.dia_1_obs || null,
            evaluar: d.evaluar || null,
            obs_evaluar: d.obs_evaluar || null,
            activo: true
          }

          const cleanRow = {}
          for (const key of Object.keys(rawPayload)) {
            if (validFieldsSet.has(key)) {
              cleanRow[key] = rawPayload[key]
            }
          }
          return cleanRow
        })

      if (toInsert.length === 0) {
        setError('No hay postulantes válidos o nuevos para adjudicar.')
        return
      }

      // Simulated smooth progress
      const progressInterval = setInterval(() => {
        setImportProgress(p => Math.min(p + 20, 90))
      }, 150)

      const { error: dbErr } = await supabase.from('nominas').insert(toInsert)
      clearInterval(progressInterval)
      setImportProgress(100)

      if (dbErr) throw dbErr

      setSuccess(`🎉 ¡${toInsert.length} postulante${toInsert.length !== 1 ? 's' : ''} asignado${toInsert.length !== 1 ? 's' : ''} con éxito al grupo ${bulkGrupo} (${bulkCampana})!`)
      setTimeout(() => setSuccess(null), 6000)
      setSelectedDocs(new Set())
      await loadSheetCandidates(workbookData, selectedSheet)
    } catch (err) {
      setError(err.message)
    } finally {
      setImporting(false)
      setImportProgress(0)
    }
  }

  const handleDesadjudicar = async (assignment, candidate) => {
    if (!window.confirm(
      `¿Desadjudicar a ${candidate.nombres} ${candidate.apellido_paterno} (DNI: ${candidate.documento}) del grupo "${assignment.grupo_codigo || 'Sin Grupo'}"?`
    )) return

    try {
      setLoading(true)
      setError(null)
      let query = supabase.from('nominas').delete()
      if (assignment.id) {
        query = query.eq('id', assignment.id)
      } else {
        query = query.eq('documento', assignment.documento)
        if (assignment.grupo_codigo) query = query.eq('grupo_codigo', assignment.grupo_codigo)
      }
      const { error: delErr } = await query
      if (delErr) throw delErr
      setSuccess(`Postulante desadjudicado del grupo ${assignment.grupo_codigo || ''}.`)
      setTimeout(() => setSuccess(null), 4000)
      await loadSheetCandidates(workbookData, selectedSheet)
    } catch (err) {
      setError(`Error al desadjudicar: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const allSelected = selectedDocs.size === selectableData.length && selectableData.length > 0

  return (
    <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden flex flex-col shadow-xs" style={{ minHeight: 600 }}>

      {/* ── 1. Google Sheets Link & Multi-Sheet Bar ── */}
      <div className="p-4 sm:p-5 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 space-y-3.5">
        
        {/* URL Input Bar & File Upload */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2.5">
          <div className="flex-1 relative flex items-center">
            <Link2 size={15} className="absolute left-3.5 text-cyan-500 shrink-0" />
            <input
              type="text"
              value={sheetUrl}
              onChange={e => setSheetUrl(e.target.value)}
              placeholder="Pega el enlace de Google Sheets de reclutamiento (ej. https://docs.google.com/spreadsheets/d/...)"
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-normal)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 font-mono outline-none"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => connectSpreadsheet(sheetUrl)}
              disabled={connecting || loading}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 transition-all cursor-pointer disabled:opacity-50 shadow-2xs active:scale-95"
            >
              <RefreshCw size={13} className={connecting ? 'animate-spin' : ''} />
              {connecting ? 'Conectando...' : 'Conectar Enlace'}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={connecting || loading}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 transition-all cursor-pointer disabled:opacity-50 shadow-2xs active:scale-95"
              title="Cargar archivo Excel .xlsx directamente desde tu equipo"
            >
              <FileSpreadsheet size={13} className="text-emerald-500" />
              <span>Subir Excel (.xlsx)</span>
            </button>
          </div>
        </div>

        {/* Sheet / Tab Selector */}
        {sheetNames.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[var(--border-subtle)]/60">
            <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-[var(--text-muted)] mr-1">
              <Layers size={13} className="text-cyan-500" />
              <span>Hojas del Libro ({sheetNames.length}):</span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 flex-1">
              {sheetNames.map(name => {
                const isActive = selectedSheet === name
                const isGroupMatch = bulkGrupo && name.toUpperCase().includes(bulkGrupo.toUpperCase().slice(0, 10))

                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => handleSheetChange(name)}
                    className={`
                      px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border
                      ${isActive 
                        ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.35)] font-black' 
                        : 'bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                      }
                    `}
                  >
                    <FileSpreadsheet size={12} className={isActive ? 'text-slate-950' : 'text-emerald-500'} />
                    <span>{name}</span>
                    {isGroupMatch && !isActive && (
                      <span className="px-1 py-0.2 rounded text-[8px] bg-purple-500/20 text-purple-400 font-mono">
                        Match Grupo
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

      </div>

      {/* ── 2. Mini KPIs & Search Bar ── */}
      <div className="p-4 sm:p-5 border-b border-[var(--border-subtle)] space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex gap-2.5 flex-wrap flex-1">
            <PoolStat label="En la Hoja"        value={poolStats.total}        color="var(--accent, #06b6d4)" icon={Users} />
            <PoolStat label="Disponibles"       value={poolStats.disponibles}  color="#10b981" icon={CheckCircle2} />
            <PoolStat label="Ya Adjudicados"    value={poolStats.yaIngresados} color="#64748b" icon={UserCheck} />
            <PoolStat label="Seleccionados"     value={poolStats.seleccionados} color="#f59e0b" icon={CheckSquare} />
          </div>

          {/* Target Group Badge */}
          {bulkGrupo ? (
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 text-cyan-600 dark:text-cyan-400 text-xs font-bold shrink-0">
              <span>Destino:</span>
              <span className="font-mono font-black underline">{bulkGrupo}</span>
              <span className="text-[10px] opacity-75">({bulkCampana || 'Sin Campaña'})</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs font-semibold shrink-0">
              <AlertTriangle size={13} />
              <span>Selecciona un grupo en los filtros</span>
            </div>
          )}
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Filtrar por DNI, Nombres, Apellidos o Teléfono…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-normal)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-cyan-500 outline-none"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* ── Alerts ── */}
      {error && (
        <div className="mx-5 mt-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-500 dark:text-rose-400 rounded-2xl flex items-center gap-2 text-xs font-semibold">
          <AlertTriangle size={15} className="shrink-0" /> 
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}
      {success && (
        <div className="mx-5 mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 dark:text-emerald-400 rounded-2xl flex items-center gap-2 text-xs font-bold">
          <CheckCircle2 size={15} className="shrink-0" />
          <span className="flex-1">{success}</span>
          <button onClick={() => setSuccess(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* ── Import Progress ── */}
      {importing && (
        <div className="mx-5 mt-3">
          <div className="flex justify-between text-xs text-[var(--text-muted)] font-bold mb-1">
            <span>Importando {selectedDocs.size} postulantes al grupo {bulkGrupo}…</span>
            <span>{importProgress}%</span>
          </div>
          <div className="h-2 rounded-full bg-[var(--bg-muted)] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300 bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]"
              style={{ width: `${importProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Table Grid & Pagination ── */}
      <div className="px-4 sm:px-5 py-2.5 bg-[var(--bg-elevated)]/30 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={selectCurrentPage}
            className="px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] font-bold text-[11px] cursor-pointer transition-colors"
          >
            Seleccionar visibles ({selectableData.length > 0 ? paginatedData.filter(d => !latestAssignedDocs.has(String(d.documento || '').trim())).length : 0})
          </button>
          <span className="text-[11px] text-[var(--text-muted)]">
            Mostrando <strong>{availableData.length > 0 ? (page - 1) * pageSize + 1 : 0}</strong> - <strong>{Math.min(availableData.length, page * pageSize)}</strong> de <strong>{availableData.length}</strong>
          </span>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-[var(--text-secondary)]"
              title="Página anterior"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="text-xs font-bold text-[var(--text-primary)]">
              Página {page} de {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-[var(--text-secondary)]"
              title="Página siguiente"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto min-h-[420px] max-h-[580px]">
        {loading || connecting ? (
          <div className="h-64 flex flex-col items-center justify-center text-[var(--text-muted)] gap-3">
            <Loader2 size={32} className="animate-spin text-cyan-500" />
            <p className="text-xs font-bold">Cargando y procesando postulantes de "{selectedSheet || 'Google Sheets'}"…</p>
          </div>
        ) : availableData.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-[var(--text-muted)] gap-2">
            <Users size={32} className="opacity-25" />
            <p className="text-xs font-bold">
              {search ? 'Sin resultados para la búsqueda' : 'No hay candidatos nuevos disponibles en la bolsa.'}
            </p>
            <p className="text-[11px] opacity-60">Revisa la pestaña seleccionada o escribe en el buscador.</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-[var(--table-head-bg)] border-b border-[var(--border-subtle)] select-none">
              <tr>
                <th className="p-3 w-10 text-center">
                  <button onClick={toggleAll} className="text-[var(--text-muted)] hover:text-cyan-400 transition-colors cursor-pointer" title="Seleccionar todos los disponibles">
                    {allSelected ? <CheckSquare size={16} className="text-cyan-400" /> : <Square size={16} />}
                  </button>
                </th>
                {['DNI / Estado', 'Nombre Completo', 'Celular', 'Exp. Call Center', 'Fuente de Oferta', 'Marca Temporal'].map(h => (
                  <th key={h} className="p-3 text-left text-[10px] font-black text-[var(--text-muted)] uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {paginatedData.map((d, idx) => {
                const cleanDoc = String(d.documento || '').trim()
                const key = `${cleanDoc}|${d.marca_temporal}`
                const latestAssignment = latestAssignedDocs.get(cleanDoc)
                const isAssigned = Boolean(latestAssignment)
                const isSelected = selectedDocs.has(key)

                return (
                  <tr
                    key={`${cleanDoc}-${idx}`}
                    onClick={() => {
                      if (!isAssigned) toggleSelect(cleanDoc, d.marca_temporal)
                    }}
                    className={`transition-colors ${
                      isAssigned
                        ? 'bg-slate-100/50 dark:bg-slate-900/35 opacity-75'
                        : isSelected
                          ? 'bg-cyan-500/10 cursor-pointer'
                          : 'hover:bg-[var(--bg-elevated)] cursor-pointer'
                    }`}
                  >
                    {/* Selection Checkbox */}
                    <td className="p-3 text-center align-top" onClick={e => e.stopPropagation()}>
                      {isAssigned ? (
                        <div className="flex items-center justify-center pt-1" title="Postulante ya asignado a un grupo">
                          <span className="p-1 rounded-md bg-slate-200/80 dark:bg-slate-800 text-slate-400 dark:text-slate-500">
                            <Lock size={13} />
                          </span>
                        </div>
                      ) : (
                        <button onClick={() => toggleSelect(cleanDoc, d.marca_temporal)} className="cursor-pointer pt-1">
                          {isSelected 
                            ? <CheckSquare size={16} className="text-cyan-400" /> 
                            : <Square size={16} className="text-[var(--text-muted)]" />
                          }
                        </button>
                      )}
                    </td>

                    {/* DNI / Assignment Details */}
                    <td className="p-3 align-top min-w-[220px]">
                      <div className={`font-mono text-xs font-black tracking-wider ${
                        isAssigned ? 'line-through text-slate-400 dark:text-slate-500' : 'text-[var(--text-primary)]'
                      }`}>
                        {cleanDoc}
                      </div>

                      {/* Si está disponible y sin asignar */}
                      {!isAssigned && (
                        <span className="inline-flex items-center gap-1 text-[8.5px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 mt-1">
                          <Check size={10} /> Disponible
                        </span>
                      )}

                      {/* Si ya está registrado en algún grupo (último grupo histórico) */}
                      {isAssigned && (
                        <div className="mt-1.5 p-2 rounded-xl bg-amber-500/10 dark:bg-amber-950/30 border border-amber-500/25 text-amber-600 dark:text-amber-400 space-y-1 shadow-2xs" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-between gap-1.5 text-[10px] font-black uppercase tracking-wider">
                            <span className="truncate max-w-[150px]" title={latestAssignment.campana || 'Sin Campaña'}>
                              🏷️ {latestAssignment.campana || 'Sin Campaña'}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleDesadjudicar(latestAssignment, d); }}
                              className="px-1.5 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-500 dark:text-rose-300 transition-colors text-[8.5px] font-bold shrink-0 cursor-pointer"
                              title="Desadjudicar de este grupo"
                            >
                              Quitar
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[9px]">
                            <div>
                              <span className="text-[var(--text-muted)] font-semibold">Grupo: </span>
                              <span className="font-mono font-bold text-[var(--text-primary)]">{latestAssignment.grupo_codigo || '—'}</span>
                            </div>
                            <div>
                              <span className="text-[var(--text-muted)] font-semibold">Inicio: </span>
                              <span className="font-bold text-[var(--text-primary)]">{getFechaInicioDisplay(latestAssignment, grupos)}</span>
                            </div>
                            <div className="col-span-2 pt-0.5 border-t border-amber-500/20 flex items-center justify-between gap-1">
                              <span className="text-[var(--text-muted)] font-semibold">Ult. Estado: </span>
                              {(() => {
                                const est = getEstadoDisplay(latestAssignment)
                                const isActivo = est === 'ACTIVO'
                                return (
                                  <span className={`px-1.5 py-0.2 rounded text-[8.5px] font-black uppercase ${
                                    isActivo 
                                      ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30' 
                                      : 'bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-500/30'
                                  }`}>
                                    {est}
                                  </span>
                                )
                              })()}
                            </div>
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Nombre Completo */}
                    <td className="p-3 text-xs font-bold whitespace-nowrap align-top">
                      <span className={isAssigned ? 'line-through text-slate-400 dark:text-slate-500' : 'text-[var(--text-primary)]'}>
                        {d.apellido_paterno} {d.apellido_materno} {d.nombres}
                      </span>
                    </td>

                    {/* Celular */}
                    <td className="p-3 font-mono text-xs whitespace-nowrap align-top">
                      <span className={isAssigned ? 'line-through text-slate-400 dark:text-slate-500' : 'text-[var(--text-secondary)]'}>
                        {d.celular || '—'}
                      </span>
                    </td>

                    {/* Exp. Call Center */}
                    <td className="p-3 text-xs align-top">
                      <span className={isAssigned ? 'line-through text-slate-400 dark:text-slate-500' : 'text-[var(--text-secondary)]'}>
                        {d.exp_call_center || '—'}
                      </span>
                    </td>

                    {/* Fuente de Oferta */}
                    <td className="p-3 text-xs max-w-[140px] truncate align-top" title={d.fuente_oferta}>
                      <span className={isAssigned ? 'line-through text-slate-400 dark:text-slate-500' : 'text-[var(--text-secondary)]'}>
                        {d.fuente_oferta || '—'}
                      </span>
                    </td>

                    {/* Marca Temporal */}
                    <td className="p-3 text-xs whitespace-nowrap font-mono text-[10px] align-top">
                      <span className={isAssigned ? 'line-through text-slate-400 dark:text-slate-500' : 'text-[var(--text-muted)]'}>
                        {d.marca_temporal || '—'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── 3. Footer Action Bar ── */}
      <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--text-muted)] font-semibold">
            <span className="font-black text-cyan-500 text-sm">{selectedDocs.size}</span> postulante(s) nuevo(s) seleccionado(s)
          </span>
          {selectedDocs.size > 0 && (
            <button onClick={() => setSelectedDocs(new Set())} className="text-xs text-[var(--text-muted)] hover:text-rose-400 transition-colors flex items-center gap-1 font-bold cursor-pointer">
              <X size={12} /> Limpiar
            </button>
          )}
        </div>

        <button
          onClick={handleSaveClick}
          disabled={selectedDocs.size === 0 || loading || importing || !bulkGrupo}
          className="flex items-center gap-2 px-6 py-2.5 rounded-2xl font-black text-xs transition-all
            bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-[0_0_15px_rgba(6,182,212,0.4)] cursor-pointer active:scale-95
            disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
        >
          {importing ? <Loader2 size={15} className="animate-spin" /> : <DownloadCloud size={15} />}
          <span>Adjudicar a mi Grupo {selectedDocs.size > 0 ? `(${selectedDocs.size})` : ''}</span>
        </button>
      </div>

    </div>
  )
}
