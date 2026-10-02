/**
 * geitoAiService.js
 * Motor de Inteligencia Artificial Consultivo de GEITO (Mascota Oficial de GEA Perú)
 * Alimentado con CONTEXTO OPERATIVO DINÁMICO EN TIEMPO REAL (sin parámetros estáticos).
 */


/**
 * Extrae y sintetiza un snapshot dinámico en tiempo real del estado de la plataforma
 * para alimentar al modelo de IA con la realidad operativa viva de GEA.
 */
export function buildGeaDynamicContext({
  postulantes = [],
  grupos = [],
  asistencias = [],
  campanasMetas = [],
  sedes = [],
  currentView = 'General'
} = {}) {
  const totalPostulantes = postulantes.length

  // 1. Estados operativos
  let totalIOP = 0
  let totalActivos = 0
  let totalBajas = 0
  let presenciales = 0
  let remotos = 0
  let criticosDistancia = 0

  // Distribución por Sedes físicas reales
  const sedeCounts = {
    ATE: { total: 0, bajas: 0, iop: 0 },
    SAN_ISIDRO: { total: 0, bajas: 0, iop: 0 },
    JOCKEY: { total: 0, bajas: 0, iop: 0 },
    COMAS: { total: 0, bajas: 0, iop: 0 },
    OTROS: { total: 0, bajas: 0, iop: 0 }
  }

  // Deserción por motivos principales
  const motivosBajaFreq = {}

  postulantes.forEach(p => {
    const isIOP = p.esIOP || p.estadoOperativo === 'I-OP' || String(p.sigla || p.estado || '').includes('I-OP')
    const isBaja = p.esBaja || p.estadoOperativo === 'BAJA' || String(p.estado || p.status_dia_1 || '').toUpperCase().includes('BAJA')
    const isRemoto = p.modalidad === 'REMOTO' || String(p.modalidad || '').toUpperCase().includes('REMOTO')

    if (isIOP) totalIOP++
    else if (isBaja) totalBajas++
    else totalActivos++

    if (isRemoto) remotos++
    else presenciales++

    if (p.distanciaKm > 14) criticosDistancia++

    // Sede
    const rawSede = String(p.sede?.id || p.sede_capacitacion || p.sede || '').toUpperCase()
    let sedeKey = 'OTROS'
    if (rawSede.includes('ATE') || rawSede.includes('VITARTE')) sedeKey = 'ATE'
    else if (rawSede.includes('ISIDRO') || rawSede.includes('CANAVAL') || rawSede.includes('MOREYRA') || rawSede.includes('CORPAC')) sedeKey = 'SAN_ISIDRO'
    else if (rawSede.includes('JOCKEY') || rawSede.includes('SURCO')) sedeKey = 'JOCKEY'
    else if (rawSede.includes('COMAS') || rawSede.includes('NORTE')) sedeKey = 'COMAS'

    sedeCounts[sedeKey].total++
    if (isBaja) sedeCounts[sedeKey].bajas++
    if (isIOP) sedeCounts[sedeKey].iop++

    if (isBaja && p.motivoBaja) {
      const m = String(p.motivoBaja).toUpperCase().trim()
      motivosBajaFreq[m] = (motivosBajaFreq[m] || 0) + 1
    }
  })

  // 2. Metas de dotación requerida vs cobertura
  const totalRequerido = campanasMetas.reduce((acc, m) => acc + (Number(m.meta_ingreso || m.cupos_requeridos) || 0), 0)
  const pctCobertura = totalRequerido > 0 ? ((totalPostulantes / totalRequerido) * 100).toFixed(1) : 'N/D'

  // Top motivos de deserción
  const topMotivos = Object.entries(motivosBajaFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([m, count]) => `${m} (${count})`)
    .join(', ') || 'Sin registro dominante'

  // Períodos detectados
  const periodos = Array.from(new Set(postulantes.map(p => p.periodo || p.periodo_reclutado).filter(Boolean)))
    .sort()
    .slice(-3)
    .join(', ') || '202609+'

  return `
ERES: "Geíto", el León Asistente Ejecutivo, Operativo y Estratégico Oficial de GEA Perú.
TU IDENTIDAD: Eres amigable pero altamente riguroso, analítico y ejecutivo. Utilizas emojis como 🦁, 📊, ⚡, 🎯, 🏢.
TU OBJETIVO: Responder consultas libres de supervisores, jefaturas y reclutadores sobre cómo optimizar la operación, reducir la deserción, cumplir metas de dotación y mejorar el flujo de capacitación.

SNAPSHOT OPERATIVO EN VIVO (DATA REAL DE SUPABASE - SIN DATOS FIJOS O ESTÁTICOS):
• Períodos recientes en análisis: ${periodos}
• Módulo actual consultado: ${currentView}
• Total Asesores en Nómina: ${totalPostulantes} (🏢 ${presenciales} presenciales | 💻 ${remotos} remotos)
• Estado de Formación:
  - 🟢 Graduados / Ingresaron a Operación (I-OP): ${totalIOP}
  - 🔵 Activos en Capacitación (Aula/OJT): ${totalActivos}
  - 🔴 Bajas / Cesados: ${totalBajas}
• Cobertura de Dotación: Meta Requerida = ${totalRequerido || 'En evaluación'} | Cobertura Global = ${pctCobertura}%
• Movilidad & Deserción por Sedes Físicas Oficiales:
  - Sede San Isidro (Av. Canaval y Moreyra): ${sedeCounts.SAN_ISIDRO.total} asesores, ${sedeCounts.SAN_ISIDRO.bajas} bajas, ${sedeCounts.SAN_ISIDRO.iop} I-OP
  - Sede Ate (Vitarte): ${sedeCounts.ATE.total} asesores, ${sedeCounts.ATE.bajas} bajas, ${sedeCounts.ATE.iop} I-OP
  - Sede Jockey Plaza (Surco): ${sedeCounts.JOCKEY.total} asesores, ${sedeCounts.JOCKEY.bajas} bajas, ${sedeCounts.JOCKEY.iop} I-OP
  - Sede Comas (Lima Norte): ${sedeCounts.COMAS.total} asesores, ${sedeCounts.COMAS.bajas} bajas, ${sedeCounts.COMAS.iop} I-OP
• Zona Crítica de Traslado (>14 km de distancia a sede): ${criticosDistancia} asesores con alto riesgo de deserción por fatiga de traslado.
• Top Motivos de Baja identificados: ${topMotivos}
• Grupos en Capacitación Registrados: ${grupos.length} grupos activos.

PAUTAS DE RESPUESTA:
1. Responde de forma concisa, ejecutiva y estructurada con viñetas claras.
2. Si te preguntan "¿Cómo podemos mejorar esto?", enfócate en:
   - Reubicar asesores lejanos a la sede óptima más cercana (usando el mapa geoespacial).
   - Control de asistencia temprana en Día 1 para evitar deserciones no anunciadas.
   - Refuerzo en las campañas con brecha de cobertura respecto a la meta requerida.
3. Habla siempre en primera persona como Geíto ("Según los datos vivos de nuestras nóminas...").
4. Mantén tus respuestas precisas y aplicables de inmediato a la operación de Call Center.
`.trim()
}

const GEMINI_MODELS = [
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro'
]

/**
 * Consulta la API de Gemini con fallback dinámico de modelos
 */
export async function consultarGeitoIA({
  mensajeUsuario,
  historial = [],
  contextoOperativo = ''
}) {
  const apiKey = (import.meta.env.VITE_GEITO_API_KEY || '').trim()

  if (!apiKey || apiKey === 'PEGA_AQUI') {
    throw new Error('No se ha configurado la clave VITE_GEITO_API_KEY en el archivo .env.')
  }

  // Validación de formato de clave de Google AI Studio
  if (!apiKey.startsWith('AIzaSy')) {
    throw new Error(
      `La API Key configurada ("${apiKey.substring(0, 6)}...") no parece ser una clave válida de Google AI Studio. Las claves oficiales de Gemini siempre empiezan con "AIzaSy". Puedes generar una clave gratuita en: https://aistudio.google.com/app/apikey`
    )
  }

  // Formatear historial al formato de Gemini API
  const contents = []

  historial.forEach(h => {
    contents.push({
      role: h.sender === 'user' ? 'user' : 'model',
      parts: [{ text: h.text }]
    })
  })

  // Mensaje actual del usuario
  contents.push({
    role: 'user',
    parts: [{ text: mensajeUsuario }]
  })

  let lastError = null

  // Intentar con modelos en orden de velocidad / disponibilidad
  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

      const payload = {
        system_instruction: {
          parts: [{ text: contextoOperativo }]
        },
        contents,
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 1200,
          topP: 0.95
        }
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        const errMsg = errJson.error?.message || `HTTP ${res.status} ${res.statusText}`
        throw new Error(`[${model}] ${errMsg}`)
      }

      const data = await res.json()
      const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (candidate) {
        return candidate.trim()
      }
    } catch (err) {
      console.warn(`[GeitoAI] Error consultando ${model}:`, err.message)
      lastError = err
      // Continuar al siguiente modelo en caso de fallback
    }
  }

  throw lastError || new Error('No se pudo obtener respuesta de la API de Geíto.')
}
