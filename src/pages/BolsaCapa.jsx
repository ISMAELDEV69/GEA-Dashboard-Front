import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle, CheckCircle2, FileSpreadsheet, GraduationCap, Loader2, Upload, Users,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import PageLayout from '../components/ui/PageLayout'
import PageHeader from '../components/ui/PageHeader'
import Card from '../components/ui/Card'
import {
  AREAS_BOLSA_CAPA,
  TIPOS_RECLUTADOR_CAPA,
  adjudicarPostulantesPoolBulk,
  fetchNominasGrupoCapa,
  findGrupoCapacidad,
  invalidateCache,
  isAreaBolsaCapa,
  saveGrupoCapacitacion,
  tipoReclutadorFromAreaCapa,
  tipoReclutadoFromAreaCapa,
} from '../lib/dataService'
import { cleanDocumento, NOMINA_DB_FIELDS } from '../lib/nominaConsolidadoSchema'
import { inferSegmento } from '../lib/capacidadRysSync'

const EMPTY_FORM = {
  codigo: '',
  campana_nombre: '',
  segmento: '',
  area_traslado: 'RECUPERADO',
  semana_label: '',
  semana_trabajo: '',
  modalidad: 'PRESENCIAL',
  periodo: '',
  periodo_ingreso_op: '',
  fecha_registro: '',
  fecha_inicio_ojt: '',
  fecha_ingreso_op: '',
}

function normHeader(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

function pickCol(row, aliases) {
  const keys = Object.keys(row || {})
  for (const alias of aliases) {
    const hit = keys.find((k) => normHeader(k) === alias || normHeader(k).includes(alias))
    if (hit && row[hit] != null && String(row[hit]).trim() !== '') return row[hit]
  }
  return ''
}

function parseCapaExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
        const people = []
        const seen = new Set()
        for (const row of rows) {
          const documento = cleanDocumento(pickCol(row, ['DNI', 'DOCUMENTO', 'NRO DE DNI', 'CE', 'NRO DNI']))
          if (!documento || seen.has(documento)) continue
          seen.add(documento)
          people.push({
            documento,
            apellido_paterno: String(pickCol(row, ['APELLIDO PATERNO', 'APELLIDO']) || '').trim(),
            apellido_materno: String(pickCol(row, ['APELLIDO MATERNO']) || '').trim(),
            nombres: String(pickCol(row, ['NOMBRES', 'NOMBRE COMPLETO', 'NOMBRES COMPLETOS', 'NOMBRE']) || '').trim(),
            celular: String(pickCol(row, ['CELULAR', 'TELEFONO', 'CEL']) || '').trim(),
          })
        }
        resolve(people)
      } catch (err) {
        reject(err)
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

function getPeriodoVal(g) {
  return String(g?.periodo || g?.periodo_ingreso_op || '').trim() || 'SIN PERIODO'
}

function getSemanaVal(g) {
  if (!g) return 'SIN SEMANA'
  const s = g.semana_label || (g.semana_trabajo ? `SEM ${g.semana_trabajo}` : (g.semana ? `SEM ${g.semana}` : ''))
  if (!s) return 'SIN SEMANA'
  const num = String(s).replace(/\D/g, '')
  return num ? `SEM ${num}` : String(s).trim().toUpperCase()
}

function matchSemana(valA, valB) {
  if (!valA || !valB) return false
  const numA = parseInt(String(valA).replace(/\D/g, ''), 10)
  const numB = parseInt(String(valB).replace(/\D/g, ''), 10)
  if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA === numB
  return String(valA).trim().toUpperCase() === String(valB).trim().toUpperCase()
}

function getSegmentoVal(g) {
  const seg = g?.segmento || inferSegmento(g?.campana || g?.campana_nombre || '')
  return String(seg || '').trim().toUpperCase()
}

export function matchSegmento(segA, segB) {
  if (!segA || !segB) return false
  const a = String(segA).trim().toUpperCase()
  const b = String(segB).trim().toUpperCase()
  if (a === b) return true

  // Variantes de Inbound Perú (PEI = Perú Inbound)
  const isInbound = (s) => (
    s === 'CLARO PEI' || s === 'CLARO PE INBOUND' || s === 'CLARO PERU INBOUND' || s === 'CLARO PERU' || s === 'CLARO INBOUND'
  )
  if (isInbound(a) && isInbound(b)) {
    if (!a.includes('OUT') && !b.includes('OUT') && !a.includes('RETENCION') && !b.includes('RETENCION')) {
      return true
    }
  }

  // Variantes de Outbound Perú (PEO = Perú Outbound)
  const isOutbound = (s) => (
    s === 'CLARO PEO' || s === 'CLARO PE OUT' || s === 'CLARO PERU OUT' || s === 'CLARO OUT' || s === 'CLARO OUTBOUND'
  )
  if (isOutbound(a) && isOutbound(b)) {
    return true
  }

  // Variantes de Retenciones
  if (a.includes('RETENCION') && b.includes('RETENCION')) {
    return true
  }

  return false
}

function getCampanaVal(g) {
  return String(g?.campana || g?.campana_nombre || g?.campaign || '').trim().toUpperCase()
}

function getCodigoVal(g) {
  return String(g?.codigo || g?.grupo_codigo || '').trim().toUpperCase()
}

function grupoKey(g) {
  return `${getCampanaVal(g)}|${getCodigoVal(g)}`
}


export default function BolsaCapa({ grupos = [], campanas = [], postulantes = [], userProfile = null, onRefresh }) {
  const fileRef = useRef(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [savingGrupo, setSavingGrupo] = useState(false)
  const [selectedKey, setSelectedKey] = useState('')
  const [people, setPeople] = useState([])
  const [fileName, setFileName] = useState('')
  const [adjudicating, setAdjudicating] = useState(false)
  const [message, setMessage] = useState(null)
  const [duplicate, setDuplicate] = useState(null)
  const [tipoReclutador, setTipoReclutador] = useState('RECUPERADO')
  const [roster, setRoster] = useState([])
  const [loadingRoster, setLoadingRoster] = useState(false)

  const [filtroPeriodo, setFiltroPeriodo] = useState('')
  const [filtroSemana, setFiltroSemana] = useState('')
  const [filtroSegmento, setFiltroSegmento] = useState('')
  const [filtroCampana, setFiltroCampana] = useState('')

  // ── Selectores en cascada para "1. CREAR GRUPO DE CAPA" (origen: capacidad_rys / grupos) ──
  const formPeriodos = useMemo(() => {
    return [...new Set((grupos || []).map(getPeriodoVal).filter((p) => p && p !== 'SIN PERIODO'))].sort().reverse()
  }, [grupos])

  const formSemanas = useMemo(() => {
    if (!form.periodo) return []
    const filtered = (grupos || []).filter((g) => getPeriodoVal(g) === form.periodo)
    return [...new Set(filtered.map(getSemanaVal).filter((s) => s && s !== 'SIN SEMANA'))].sort((a, b) => {
      return (parseInt(String(a).replace(/\D/g, ''), 10) || 0) - (parseInt(String(b).replace(/\D/g, ''), 10) || 0)
    })
  }, [grupos, form.periodo])

  const formSegmentos = useMemo(() => {
    if (!form.periodo || !form.semana_label) return []
    const filtered = (grupos || []).filter((g) => (
      getPeriodoVal(g) === form.periodo
      && matchSemana(getSemanaVal(g), form.semana_label)
    ))
    return [...new Set(filtered.map(getSegmentoVal).filter(Boolean))].sort()
  }, [grupos, form.periodo, form.semana_label])

  const formCampanas = useMemo(() => {
    if (!form.periodo || !form.semana_label || !form.segmento) return []
    const fromGrupos = (grupos || []).filter((g) => (
      getPeriodoVal(g) === form.periodo
      && matchSemana(getSemanaVal(g), form.semana_label)
      && matchSegmento(getSegmentoVal(g), form.segmento)
    )).map(getCampanaVal)

    const fromCatalog = (campanas || [])
      .filter((c) => {
        const seg = String(c.segmento || inferSegmento(c.nombre || c.campana || '')).trim().toUpperCase()
        return matchSegmento(seg, form.segmento)
      })
      .map((c) => String(c.nombre || c.campana || '').trim().toUpperCase())

    return [...new Set([...fromGrupos, ...fromCatalog].filter(Boolean))].sort()
  }, [grupos, campanas, form.periodo, form.semana_label, form.segmento])

  const handleSelectPeriodoForm = (val) => {
    setForm((prev) => ({
      ...prev,
      periodo: val,
      periodo_ingreso_op: val,
      semana_label: '',
      semana_trabajo: '',
      segmento: '',
      campana_nombre: '',
    }))
    setDuplicate(null)
  }

  const handleSelectSemanaForm = (val) => {
    const semanaNum = parseInt(String(val).replace(/\D/g, ''), 10) || null
    setForm((prev) => ({
      ...prev,
      semana_label: val,
      semana_trabajo: semanaNum || '',
      segmento: '',
      campana_nombre: '',
    }))
    setDuplicate(null)
  }

  const handleSelectSegmentoForm = (val) => {
    setForm((prev) => ({
      ...prev,
      segmento: val,
      campana_nombre: '',
    }))
    setDuplicate(null)
  }

  const handleSelectCampanaForm = (campanaName) => {
    const nextCampana = String(campanaName || '').trim().toUpperCase()
    const match = (grupos || []).find((g) => (
      getPeriodoVal(g) === form.periodo
      && matchSemana(getSemanaVal(g), form.semana_label)
      && getSegmentoVal(g) === form.segmento
      && getCampanaVal(g) === nextCampana
    )) || (grupos || []).find((g) => getCampanaVal(g) === nextCampana)

    const rawMod = match?.modalidad ? String(match.modalidad).toUpperCase().trim() : ''

    setForm((prev) => {
      const resolvedMod = rawMod === 'VIRTUAL' ? 'REMOTO' : (rawMod || prev.modalidad || 'PRESENCIAL')
      return {
        ...prev,
        campana_nombre: nextCampana,
        modalidad: resolvedMod,
        fecha_registro: match?.fecha_registro ? String(match.fecha_registro).slice(0, 10) : prev.fecha_registro,
        fecha_inicio_ojt: match?.fecha_inicio_ojt ? String(match.fecha_inicio_ojt).slice(0, 10) : prev.fecha_inicio_ojt,
        fecha_ingreso_op: match?.fecha_ingreso_op ? String(match.fecha_ingreso_op).slice(0, 10) : prev.fecha_ingreso_op,
      }
    })
    setDuplicate(null)
  }

  // ── Todos los grupos disponibles en la plataforma (capacidad_rys, recuperados, traslados) ──
  const capaGrupos = useMemo(() => {
    return (grupos || [])
      .slice()
      .sort((a, b) => {
        const isBolsaA = isAreaBolsaCapa(a.area_traslado) ? 1 : 0
        const isBolsaB = isAreaBolsaCapa(b.area_traslado) ? 1 : 0
        if (isBolsaB !== isBolsaA) return isBolsaB - isBolsaA
        return String(getPeriodoVal(b)).localeCompare(String(getPeriodoVal(a)))
      })
  }, [grupos])

  const selectedGrupo = useMemo(() => {
    return capaGrupos.find((g) => grupoKey(g) === selectedKey) || null
  }, [capaGrupos, selectedKey])

  const periodos = useMemo(
    () => [...new Set(capaGrupos.map(getPeriodoVal).filter((p) => p && p !== 'SIN PERIODO'))].sort().reverse(),
    [capaGrupos]
  )

  const semanas = useMemo(() => {
    if (!filtroPeriodo) return []
    const filtered = capaGrupos.filter((g) => getPeriodoVal(g) === filtroPeriodo)
    return [...new Set(filtered.map(getSemanaVal).filter((s) => s && s !== 'SIN SEMANA'))].sort((a, b) => {
      return (parseInt(String(a).replace(/\D/g, ''), 10) || 0) - (parseInt(String(b).replace(/\D/g, ''), 10) || 0)
    })
  }, [capaGrupos, filtroPeriodo])

  const segmentos = useMemo(() => {
    if (!filtroPeriodo || !filtroSemana) return []
    const filtered = capaGrupos.filter((g) => getPeriodoVal(g) === filtroPeriodo && matchSemana(getSemanaVal(g), filtroSemana))
    return [...new Set(filtered.map(getSegmentoVal).filter(Boolean))].sort()
  }, [capaGrupos, filtroPeriodo, filtroSemana])

  const campanasFiltro = useMemo(() => {
    if (!filtroPeriodo || !filtroSemana) return []
    let filtered = capaGrupos.filter((g) => (
      getPeriodoVal(g) === filtroPeriodo
      && matchSemana(getSemanaVal(g), filtroSemana)
    ))
    if (filtroSegmento) {
      filtered = filtered.filter((g) => matchSegmento(getSegmentoVal(g), filtroSegmento))
    }
    return [...new Set(filtered.map(getCampanaVal).filter(Boolean))].sort()
  }, [capaGrupos, filtroPeriodo, filtroSemana, filtroSegmento])

  const gruposFiltro = useMemo(() => {
    if (!filtroPeriodo || !filtroSemana || !filtroCampana) return []
    const seen = new Set()
    return capaGrupos.filter((g) => {
      if (
        getPeriodoVal(g) !== filtroPeriodo
        || !matchSemana(getSemanaVal(g), filtroSemana)
        || getCampanaVal(g) !== filtroCampana
      ) return false
      if (filtroSegmento && !matchSegmento(getSegmentoVal(g), filtroSegmento)) return false
      const key = grupoKey(g)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [capaGrupos, filtroPeriodo, filtroSemana, filtroSegmento, filtroCampana])

  const applyGrupoFilters = useCallback((g) => {
    if (!g) return
    setFiltroPeriodo(getPeriodoVal(g))
    setFiltroSemana(getSemanaVal(g))
    setFiltroSegmento(getSegmentoVal(g))
    setFiltroCampana(getCampanaVal(g))
    setSelectedKey(grupoKey(g))
    setTipoReclutador(tipoReclutadorFromAreaCapa(g.area_traslado))
  }, [])

  const loadRoster = useCallback(async (g) => {
    if (!g) {
      setRoster([])
      return
    }
    setLoadingRoster(true)
    try {
      const rows = await fetchNominasGrupoCapa({
        codigo: getCodigoVal(g),
        campana: getCampanaVal(g),
      })
      if (rows.length) {
        setRoster(rows)
      } else {
        const local = (postulantes || []).filter((p) => (
          String(p.grupo_codigo || '').trim().toUpperCase() === getCodigoVal(g)
          && String(p.campana || p.campaign || '').trim().toUpperCase() === getCampanaVal(g)
          && p.activo !== false
        ))
        setRoster(local)
      }
    } catch {
      const local = (postulantes || []).filter((p) => (
        String(p.grupo_codigo || '').trim().toUpperCase() === getCodigoVal(g)
        && String(p.campana || p.campaign || '').trim().toUpperCase() === getCampanaVal(g)
        && p.activo !== false
      ))
      setRoster(local)
    } finally {
      setLoadingRoster(false)
    }
  }, [postulantes])

  useEffect(() => {
    loadRoster(selectedGrupo)
  }, [selectedGrupo, loadRoster])

  useEffect(() => {
    if (semanas.length === 1 && !filtroSemana && filtroPeriodo) setFiltroSemana(semanas[0])
  }, [semanas, filtroSemana, filtroPeriodo])

  useEffect(() => {
    if (segmentos.length === 1 && !filtroSegmento && filtroSemana) setFiltroSegmento(segmentos[0])
  }, [segmentos, filtroSegmento, filtroSemana])

  useEffect(() => {
    if (campanasFiltro.length === 1 && !filtroCampana && filtroSemana) setFiltroCampana(campanasFiltro[0])
  }, [campanasFiltro, filtroCampana, filtroSemana])

  useEffect(() => {
    if (gruposFiltro.length === 1 && !selectedKey && filtroCampana) {
      setSelectedKey(grupoKey(gruposFiltro[0]))
      setTipoReclutador(tipoReclutadorFromAreaCapa(gruposFiltro[0].area_traslado))
    }
  }, [gruposFiltro, selectedKey, filtroCampana])

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setDuplicate(null)
  }

  const handleSaveGrupo = async (e) => {
    e.preventDefault()
    setMessage(null)
    const codigo = String(form.codigo || '').trim().toUpperCase()
    const campana = String(form.campana_nombre || '').trim().toUpperCase()
    if (!codigo || !campana || !form.area_traslado) {
      setMessage({ tone: 'error', text: 'Código, campaña y área son obligatorios.' })
      return
    }

    setSavingGrupo(true)
    try {
      const found = await findGrupoCapacidad({ codigo, campana })
      if (found.exact) {
        setDuplicate(found.exact)
        applyGrupoFilters(found.exact)
        setMessage({
          tone: 'warn',
          text: `El grupo ${found.exact.codigo} / ${found.exact.campana} ya existe. Úsalo para agregar más asesores; no se creó otro.`,
        })
        return
      }
      if (found.byCodigo.length) {
        const others = found.byCodigo.map((g) => g.campana).join(', ')
        setDuplicate(found.byCodigo[0])
        setMessage({
          tone: 'warn',
          text: `Ese GPE ya existe en otra campaña (${others}). Confirma el código antes de crear uno nuevo o elige el grupo existente.`,
        })
        return
      }

      const semanaNum = parseInt(String(form.semana_trabajo || form.semana_label).replace(/\D/g, ''), 10) || null
      const periodo = form.periodo || form.periodo_ingreso_op || null
      const created = await saveGrupoCapacitacion({
        ...form,
        codigo,
        campana_nombre: campana,
        segmento: form.segmento || inferSegmento(campana),
        area_traslado: String(form.area_traslado).trim().toUpperCase(),
        semana_trabajo: semanaNum,
        semana_label: form.semana_label || (semanaNum ? `SEM ${semanaNum}` : ''),
        periodo,
        periodo_ingreso_op: form.periodo_ingreso_op || periodo,
        fecha_ingreso_op: form.fecha_ingreso_op || null,
        rq_solicitado: 0,
        rq_ftes_solicitado: 0,
      })
      applyGrupoFilters({
        ...created,
        campana,
        codigo,
        area_traslado: form.area_traslado,
        segmento: form.segmento || inferSegmento(campana),
        periodo,
        periodo_ingreso_op: form.periodo_ingreso_op || periodo,
        semana_label: form.semana_label || (semanaNum ? `SEM ${semanaNum}` : ''),
        semana_trabajo: semanaNum,
      })
      setForm({ ...EMPTY_FORM, area_traslado: form.area_traslado })
      setMessage({ tone: 'ok', text: `Grupo ${codigo} creado. Ahora puedes cargar o agregar más asesores a este GPE.` })
      await onRefresh?.()
    } catch (err) {
      setMessage({ tone: 'error', text: err?.message || 'No se pudo crear el grupo.' })
    } finally {
      setSavingGrupo(false)
    }
  }

  const useExisting = () => {
    if (!duplicate) return
    applyGrupoFilters(duplicate)
    setDuplicate(null)
    setMessage({ tone: 'ok', text: `Usando ${duplicate.codigo} · ${duplicate.campana}. Solo se agregarán personas nuevas.` })
  }

  const handleExcel = async (file) => {
    setMessage(null)
    if (!file) return
    try {
      const rows = await parseCapaExcel(file)
      setPeople(rows)
      setFileName(file.name)
      if (!rows.length) {
        setMessage({ tone: 'warn', text: 'El Excel no trajo DNI válidos. Usa columnas DNI, nombres y apellidos.' })
      }
    } catch (err) {
      setPeople([])
      setMessage({ tone: 'error', text: err?.message || 'Excel inválido.' })
    }
  }

  const existingDocs = useMemo(() => new Set(roster.map((p) => cleanDocumento(p.documento)).filter(Boolean)), [roster])
  const nuevos = useMemo(() => people.filter((p) => !existingDocs.has(p.documento)), [people, existingDocs])
  const yaEstaban = people.length - nuevos.length

  const handleAdjudicar = async () => {
    if (!selectedGrupo) {
      setMessage({ tone: 'error', text: 'Elige o crea un grupo de capa primero.' })
      return
    }
    if (!nuevos.length) {
      setMessage({
        tone: 'warn',
        text: people.length
          ? 'Todas las personas del Excel ya están en este grupo. No se duplicó nadie.'
          : 'Carga un Excel con DNI.',
      })
      return
    }
    setAdjudicating(true)
    setMessage(null)
    try {
      const tipo = tipoReclutador
      const semanaNum = parseInt(String(selectedGrupo.semana_trabajo || selectedGrupo.semana_label || '').replace(/\D/g, ''), 10) || null
      const validFields = new Set([...NOMINA_DB_FIELDS, 'activo'])
      const postulantesPayload = nuevos.map((p) => {
        const raw = {
          documento: p.documento,
          apellido_paterno: p.apellido_paterno || null,
          apellido_materno: p.apellido_materno || null,
          nombres: p.nombres || null,
          celular: p.celular || null,
          campana: getCampanaVal(selectedGrupo),
          segmento: selectedGrupo.segmento || inferSegmento(selectedGrupo.campana),
          grupo_codigo: getCodigoVal(selectedGrupo),
          periodo_reclutado: selectedGrupo.periodo_ingreso_op || selectedGrupo.periodo || null,
          semana_trabajo: semanaNum,
          modalidad: selectedGrupo.modalidad || 'PRESENCIAL',
          reclutador: tipo,
          fuente_oferta: selectedGrupo.area_traslado || tipo,
          status_dia_1: tipo === 'CAPACITACION' ? tipoReclutadoFromAreaCapa(selectedGrupo.area_traslado) : tipo,
          observacion_reclutamiento: `BOLSA_CAPA:${tipo}`,
          marca_temporal: new Date().toISOString(),
          activo: true,
        }
        const clean = {}
        Object.entries(raw).forEach(([k, v]) => {
          if (validFields.has(k)) clean[k] = v
        })
        return clean
      })

      const result = await adjudicarPostulantesPoolBulk({
        targetGrupo: getCodigoVal(selectedGrupo),
        targetCampana: getCampanaVal(selectedGrupo),
        postulantes: postulantesPayload,
      })
      invalidateCache('postulantes')
      invalidateCache('all_consolidado')
      invalidateCache('nominas_dataset')
      window.dispatchEvent(new CustomEvent('gea-data-mutation', {
        detail: { grupo_codigo: getCodigoVal(selectedGrupo), campana: getCampanaVal(selectedGrupo) },
      }))
      setPeople([])
      setFileName('')
      if (fileRef.current) fileRef.current.value = ''
      const inserted = result?.inserted ?? postulantesPayload.length
      const skipped = yaEstaban
      setMessage({
        tone: 'ok',
        text: `${inserted} persona(s) nuevas en ${getCodigoVal(selectedGrupo)} (${tipo}).${skipped ? ` ${skipped} ya estaban y no se tocaron.` : ''} Quedaron en el consolidado de nóminas.`,
      })
      await loadRoster(selectedGrupo)
    } catch (err) {
      setMessage({ tone: 'error', text: err?.message || 'No se pudo adjudicar la nómina.' })
    } finally {
      setAdjudicating(false)
    }
  }

  const inputClass = 'w-full h-9 px-2.5 rounded-lg bg-[var(--bg-base)] border border-[var(--border-normal)] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]'
  const labelClass = 'text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] mb-1 block'

  return (
    <PageLayout>
      <PageHeader
        title="Bolsa de Capa"
        subtitle="Crea el GPE o elige uno ya creado para agregar más asesores. La nómina entra al consolidado. No pasa por reclutamiento."
      />

      <div className="p-4 md:px-6 space-y-4 overflow-auto">
        {message && (
          <div className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm ${
            message.tone === 'ok'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
              : message.tone === 'warn'
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
          }`}>
            {message.tone === 'ok' ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertCircle size={16} className="mt-0.5 shrink-0" />}
            <span>{message.text}</span>
            {duplicate && (
              <button type="button" onClick={useExisting} className="ml-auto text-xs font-bold underline shrink-0">
                Usar grupo existente
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card>
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[var(--text-muted)]">
                <GraduationCap size={14} />
                1. Crear grupo de capa
              </div>
              <form onSubmit={handleSaveGrupo} className="grid grid-cols-2 gap-3">
                {/* 1. Periodo */}
                <div className="col-span-1">
                  <label className={labelClass}>Periodo</label>
                  <select
                    className={inputClass}
                    value={form.periodo}
                    onChange={(e) => handleSelectPeriodoForm(e.target.value)}
                    required
                  >
                    <option value="">Seleccione Periodo</option>
                    {formPeriodos.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>

                {/* 2. Semana */}
                <div className="col-span-1">
                  <label className={labelClass}>Semana</label>
                  <select
                    className={inputClass}
                    value={form.semana_label}
                    disabled={!form.periodo}
                    onChange={(e) => handleSelectSemanaForm(e.target.value)}
                    required
                  >
                    <option value="">{form.periodo ? 'Seleccione Semana' : 'Elija Periodo primero'}</option>
                    {formSemanas.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                {/* 3. Segmento */}
                <div className="col-span-1">
                  <label className={labelClass}>Segmento</label>
                  <select
                    className={inputClass}
                    value={form.segmento}
                    disabled={!form.semana_label}
                    onChange={(e) => handleSelectSegmentoForm(e.target.value)}
                    required
                  >
                    <option value="">{form.semana_label ? 'Seleccione Segmento' : 'Elija Semana primero'}</option>
                    {formSegmentos.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                {/* 4. Campaña */}
                <div className="col-span-1">
                  <label className={labelClass}>Campaña</label>
                  <select
                    className={inputClass}
                    value={form.campana_nombre}
                    disabled={!form.segmento}
                    onChange={(e) => handleSelectCampanaForm(e.target.value)}
                    required
                  >
                    <option value="">{form.segmento ? 'Seleccione Campaña' : 'Elija Segmento primero'}</option>
                    {formCampanas.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {/* 5. Código GPE */}
                <div className="col-span-1">
                  <label className={labelClass}>Código GPE</label>
                  <input
                    className={inputClass}
                    value={form.codigo}
                    onChange={(e) => setField('codigo', e.target.value)}
                    placeholder="GPE-2026..."
                    required
                  />
                </div>

                {/* 6. Área */}
                <div className="col-span-1">
                  <label className={labelClass}>Área</label>
                  <select className={inputClass} value={form.area_traslado} onChange={(e) => setField('area_traslado', e.target.value)}>
                    {AREAS_BOLSA_CAPA.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>

                {/* 7. Modalidad */}
                <div className="col-span-1">
                  <label className={labelClass}>Modalidad</label>
                  <select
                    className={inputClass}
                    value={form.modalidad === 'VIRTUAL' ? 'REMOTO' : form.modalidad}
                    onChange={(e) => setField('modalidad', e.target.value)}
                  >
                    <option value="PRESENCIAL">PRESENCIAL</option>
                    <option value="REMOTO">REMOTO</option>
                    <option value="HIBRIDO">HIBRIDO</option>
                  </select>
                </div>

                {/* 8. Fecha inicio */}
                <div className="col-span-1">
                  <label className={labelClass}>Fecha inicio</label>
                  <input type="date" className={inputClass} value={form.fecha_registro} onChange={(e) => setField('fecha_registro', e.target.value)} />
                </div>

                {/* 9. Fecha OJT */}
                <div className="col-span-1">
                  <label className={labelClass}>Fecha OJT</label>
                  <input type="date" className={inputClass} value={form.fecha_inicio_ojt} onChange={(e) => setField('fecha_inicio_ojt', e.target.value)} />
                </div>

                {/* 10. Fecha ingreso OP */}
                <div className="col-span-1">
                  <label className={labelClass}>Fecha ingreso OP</label>
                  <input type="date" className={inputClass} value={form.fecha_ingreso_op} onChange={(e) => setField('fecha_ingreso_op', e.target.value)} />
                </div>

                <div className="col-span-2">
                  <button
                    type="submit"
                    disabled={savingGrupo}
                    className="h-9 px-4 rounded-lg bg-[var(--accent)] text-[var(--text-on-accent)] text-xs font-bold disabled:opacity-60 cursor-pointer hover:brightness-110 transition-all"
                  >
                    {savingGrupo ? 'Guardando…' : 'Crear / validar grupo'}
                  </button>
                </div>
              </form>
            </div>
          </Card>

          <Card>
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[var(--text-muted)]">
                <FileSpreadsheet size={14} />
                2. Agregar asesores al grupo
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
                <div className="col-span-1">
                  <label className={labelClass}>Periodo</label>
                  <select
                    className={inputClass}
                    value={filtroPeriodo}
                    onChange={(e) => {
                      setFiltroPeriodo(e.target.value)
                      setFiltroSemana('')
                      setFiltroSegmento('')
                      setFiltroCampana('')
                      setSelectedKey('')
                    }}
                  >
                    <option value="">Seleccione Periodo</option>
                    {periodos.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Semana</label>
                  <select
                    className={inputClass}
                    value={filtroSemana}
                    disabled={!filtroPeriodo}
                    onChange={(e) => {
                      setFiltroSemana(e.target.value)
                      setFiltroSegmento('')
                      setFiltroCampana('')
                      setSelectedKey('')
                    }}
                  >
                    <option value="">{filtroPeriodo ? 'Seleccione Semana' : 'Seleccione Periodo primero'}</option>
                    {semanas.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Segmento</label>
                  <select
                    className={inputClass}
                    value={filtroSegmento}
                    disabled={!filtroSemana}
                    onChange={(e) => {
                      setFiltroSegmento(e.target.value)
                      setFiltroCampana('')
                      setSelectedKey('')
                    }}
                  >
                    <option value="">{filtroSemana ? 'Seleccione Segmento' : 'Seleccione Semana primero'}</option>
                    {segmentos.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Campaña</label>
                  <select
                    className={inputClass}
                    value={filtroCampana}
                    disabled={!filtroSemana}
                    onChange={(e) => {
                      const nextCamp = e.target.value
                      setFiltroCampana(nextCamp)
                      setSelectedKey('')
                      if (!filtroSegmento && nextCamp) {
                        const hit = capaGrupos.find((g) => (
                          getPeriodoVal(g) === filtroPeriodo
                          && matchSemana(getSemanaVal(g), filtroSemana)
                          && getCampanaVal(g) === nextCamp
                        ))
                        if (hit) setFiltroSegmento(getSegmentoVal(hit))
                      }
                    }}
                  >
                    <option value="">
                      {!filtroSemana
                        ? 'Seleccione Semana primero'
                        : campanasFiltro.length === 0
                          ? 'Sin campañas en esta semana'
                          : `Seleccione Campaña (${campanasFiltro.length})`}
                    </option>
                    {campanasFiltro.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Grupo (GPE)</label>
                  <select
                    className={inputClass}
                    value={selectedKey}
                    disabled={!filtroCampana}
                    onChange={(e) => {
                      const key = e.target.value
                      setSelectedKey(key)
                      const hit = capaGrupos.find((g) => grupoKey(g) === key)
                      if (hit) {
                        setTipoReclutador(tipoReclutadorFromAreaCapa(hit.area_traslado))
                      }
                    }}
                  >
                    <option value="">
                      {!filtroCampana
                        ? 'Seleccione Campaña primero'
                        : gruposFiltro.length === 0
                          ? 'Sin grupos en este filtro'
                          : `Seleccione Grupo (${gruposFiltro.length})`}
                    </option>
                    {gruposFiltro.map((g) => (
                      <option key={grupoKey(g)} value={grupoKey(g)}>
                        {getCodigoVal(g)}{g.area_traslado && g.area_traslado !== 'RECLUTAMIENTO' ? ` · [${g.area_traslado}]` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedGrupo && (
                <p className="text-xs text-[var(--text-muted)]">
                  {loadingRoster ? 'Cargando nómina…' : `Este grupo ya tiene ${roster.length} persona(s) en el consolidado. El Excel solo agrega DNI nuevos.`}
                </p>
              )}

              <div>
                <label className={labelClass}>Reclutador</label>
                <select
                  className={inputClass}
                  value={tipoReclutador}
                  onChange={(e) => setTipoReclutador(e.target.value)}
                >
                  {TIPOS_RECLUTADOR_CAPA.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <p className="text-[10px] text-[var(--text-muted)] mt-1">Así queda en nómina y consolidado para este lote.</p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => handleExcel(e.target.files?.[0])}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="h-9 px-3 rounded-lg border border-[var(--border-normal)] text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Upload size={14} /> Subir Excel
                </button>
                <span className="text-xs text-[var(--text-muted)] truncate">{fileName || 'DNI, nombres, apellidos, celular'}</span>
              </div>
              <div className="text-xs text-[var(--text-muted)] flex items-center gap-1.5">
                <Users size={13} />
                {nuevos.length} nuevas
                {yaEstaban > 0 ? ` · ${yaEstaban} ya estaban` : ''}
                {people.length ? ` · tipo ${tipoReclutador}` : ''}
              </div>
              <button
                type="button"
                disabled={adjudicating || !selectedGrupo || !nuevos.length}
                onClick={handleAdjudicar}
                className="h-9 px-4 rounded-lg bg-[var(--accent)] text-[var(--text-on-accent)] text-xs font-bold disabled:opacity-60 inline-flex items-center gap-1.5"
              >
                {adjudicating && <Loader2 size={14} className="animate-spin" />}
                Agregar al grupo y consolidar
              </button>
            </div>
          </Card>
        </div>

        {people.length > 0 && (
          <Card>
            <div className="p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] mb-2">Vista previa Excel</p>
              <div className="overflow-auto max-h-64">
                <table className="w-full text-left text-xs">
                  <thead className="text-[10px] uppercase text-[var(--text-muted)]">
                    <tr>
                      <th className="py-1.5 pr-2">DNI</th>
                      <th className="py-1.5 pr-2">Apellidos</th>
                      <th className="py-1.5 pr-2">Nombres</th>
                      <th className="py-1.5 pr-2">Celular</th>
                      <th className="py-1.5">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
                    {people.slice(0, 80).map((p) => {
                      const exists = existingDocs.has(p.documento)
                      return (
                        <tr key={p.documento} className={exists ? 'opacity-50' : ''}>
                          <td className="py-1.5 pr-2">{p.documento}</td>
                          <td className="py-1.5 pr-2 font-sans">{p.apellido_paterno} {p.apellido_materno}</td>
                          <td className="py-1.5 pr-2 font-sans">{p.nombres}</td>
                          <td className="py-1.5 pr-2">{p.celular}</td>
                          <td className="py-1.5 font-sans">{exists ? 'Ya en el grupo' : `Nueva · ${tipoReclutador}`}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {people.length > 80 && (
                  <p className="text-[11px] text-[var(--text-muted)] mt-2">+ {people.length - 80} más</p>
                )}
              </div>
            </div>
          </Card>
        )}

        {selectedGrupo && roster.length > 0 && (
          <Card>
            <div className="p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] mb-2">
                Nómina consolidada · {getCodigoVal(selectedGrupo)} · {roster.length} personas
              </p>
              <div className="overflow-auto max-h-72">
                <table className="w-full text-left text-xs">
                  <thead className="text-[10px] uppercase text-[var(--text-muted)]">
                    <tr>
                      <th className="py-1.5 pr-2">DNI</th>
                      <th className="py-1.5 pr-2">Nombre</th>
                      <th className="py-1.5 pr-2">Celular</th>
                      <th className="py-1.5">Reclutador</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {roster.slice(0, 120).map((p) => (
                      <tr key={`${p.documento}-${p.created_at || ''}`}>
                        <td className="py-1.5 pr-2 font-mono">{p.documento}</td>
                        <td className="py-1.5 pr-2">{[p.apellido_paterno, p.apellido_materno, p.nombres].filter(Boolean).join(' ')}</td>
                        <td className="py-1.5 pr-2 font-mono">{p.celular || '—'}</td>
                        <td className="py-1.5">{p.reclutador || p.status_dia_1 || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        )}

        <p className="text-[11px] text-[var(--text-muted)]">
          Sesión: {userProfile?.nombre || userProfile?.nombre_completo || 'capa'}. Quienes ya están en el GPE no se vuelven a insertar.
        </p>
      </div>
    </PageLayout>
  )
}
