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
