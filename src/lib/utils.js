// Helper: formatear moneda colombiana
export const formatCOP = (value) => {
  if (value == null) return '$0'
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

// Helper: formatear fecha (dd/mm/yyyy) — robusta ante DATE y TIMESTAMPTZ
//
// Acepta:
//   - String DATE puro: '2026-05-18'           → '18/05/2026'
//   - String ISO timestamp: '2026-05-18T10:30:00Z' → '18/05/2026' (en hora Bogotá)
//   - Objeto Date
//   - null/undefined/'' → '—'
//
// Para DATE puro no hace conversión de zona horaria (la fecha es la fecha).
// Para timestamps usa la zona America/Bogota para mostrar la fecha "como la vivió" el usuario.
export const formatDate = (value) => {
  if (!value) return '—'

  // Caso 1: string DATE puro 'YYYY-MM-DD' — split manual, sin zona horaria
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-')
    return `${day}/${month}/${year}`
  }

  // Caso 2: timestamp ISO o Date object — formato localizado con zona Bogotá
  try {
    const date = value instanceof Date ? value : new Date(value)
    if (isNaN(date.getTime())) return '—'

    return date.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'America/Bogota',
    })
  } catch {
    return '—'
  }
}

// Helper: formatear fecha + hora (dd/mm/yyyy hh:mm) — para logs e historial
//
// Acepta los mismos inputs que formatDate.
// Para DATE puro (sin hora) muestra solo la fecha.
// Para timestamps muestra fecha + hora en zona America/Bogota (24h).
//
// Ejemplos:
//   formatDateTime('2026-05-18')              → '18/05/2026'
//   formatDateTime('2026-05-18T10:30:00Z')    → '18/05/2026 05:30'
//   formatDateTime('2026-05-18T02:30:00Z')    → '17/05/2026 21:30'  (era noche del 17 en Bogotá)
export const formatDateTime = (value) => {
  if (!value) return '—'

  // Si es DATE puro 'YYYY-MM-DD', no hay hora que mostrar
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return formatDate(value)
  }

  try {
    const date = value instanceof Date ? value : new Date(value)
    if (isNaN(date.getTime())) return '—'

    const fecha = date.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'America/Bogota',
    })
    const hora = date.toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'America/Bogota',
    })

    return `${fecha} ${hora}`
  } catch {
    return '—'
  }
}

/* ──────────────────────────────────────────────────────────────
   Texto para pegar en la historia clínica del hospital
   Un solo párrafo corrido a partir del caso + acta del comité.
   Usada por MesaComite y CasoDetalle (no duplicar).
   ────────────────────────────────────────────────────────────── */

// Fecha DD/MM/AAAA; null → 'fecha pendiente'
const hcFecha = (value) => {
  const f = formatDate(value)
  return f === '—' ? 'fecha pendiente' : f
}

// Capitalizar primera letra (aprobado → Aprobado)
const hcCapitalizar = (s) => {
  const t = (s ?? '').toString().trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''
}

// Concepto de una valoración interdisciplinaria según su estado
const hcValoracion = (valorado, concepto) => {
  const c = (concepto ?? '').toString().trim()
  if (valorado === true) return c || 'valorado'
  if (valorado === false) return 'no valorado'
  return 'sin información'
}

export function generarTextoHistoriaClinica(caso, acta) {
  const c = caso || {}
  const a = acta || {}
  const p = c.paciente || {}

  const partes = []

  // Encabezado con fecha de firma
  partes.push(`COMITÉ ONCOLÓGICO — Acta del ${hcFecha(a.fecha_firma)}.`)

  // Paciente + documento
  const nombre = (p.nombre ?? '').toString().trim()
  const doc = (p.documento ?? '').toString().trim()
  if (nombre || doc) {
    const docTxt = doc ? ` (CC ${doc})` : ''
    partes.push(`Paciente ${nombre || 'sin nombre'}${docTxt},`)
  }

  // Diagnóstico
  const diag = (c.diagnostico_descripcion ?? '').toString().trim()
  if (diag) partes.push(`diagnóstico de ${diag}.`)

  // Pregunta al comité
  const pregunta = ((c.pregunta_comite ?? c.motivo) ?? '').toString().trim()
  if (pregunta) partes.push(`Pregunta al comité: ${pregunta}.`)

  // Valoraciones interdisciplinarias
  partes.push(
    `Valoraciones interdisciplinarias: psicología (${hcValoracion(c.valorado_psicologia, c.concepto_psicologia)}), ` +
    `trabajo social (${hcValoracion(c.valorado_trabajo_social, c.concepto_trabajo_social)}), ` +
    `cuidados paliativos (${hcValoracion(c.valorado_paliativos, c.concepto_paliativos)}).`
  )

  // Discusión (omitir si vacía)
  const discusion = (a.discusion ?? '').toString().trim()
  if (discusion) partes.push(`Discusión del comité: ${discusion}.`)

  // Decisión final (omitir si vacía)
  const decisionFinal = hcCapitalizar(a.decision_final)
  if (decisionFinal) partes.push(`DECISIÓN DEL COMITÉ: ${decisionFinal}.`)

  // Intención (omitir si vacía)
  const intencion = hcCapitalizar(a.intencion)
  if (intencion) partes.push(`Intención del tratamiento: ${intencion}.`)

  // Narrativa de la decisión (omitir si vacía)
  const narrativa = (a.decision ?? '').toString().trim()
  if (narrativa) partes.push(`${narrativa}.`)

  // Participantes
  const participantes = Array.isArray(a.participantes) ? a.participantes : []
  const nombres = participantes
    .map(x => (x?.nombre ?? '').toString().trim())
    .filter(Boolean)
  partes.push(`Participantes: ${nombres.length ? nombres.join(', ') : 'no registrados'}.`)

  // Firma final
  partes.push(`Acta firmada el ${hcFecha(a.fecha_firma)}.`)

  // Unir en un solo párrafo, colapsar espacios múltiples, trim
  return partes.join(' ').replace(/\s+/g, ' ').trim()
}
