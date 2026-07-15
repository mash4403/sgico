// Helper: copiar texto al portapapeles con fallbacks robustos.
//
// Cadena de intentos:
//   1. navigator.clipboard.writeText (requiere contexto seguro: HTTPS o localhost)
//   2. document.execCommand('copy') sobre un textarea temporal (navegadores viejos / http)
//   3. Lanza error para que el caller muestre el texto y el usuario copie manual.
//
// Devuelve una promesa que resuelve si se copió, o rechaza si no fue posible.
export async function copiarTextoAlPortapapeles(texto) {
  // Intento 1: Clipboard API moderna
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(texto)
      return
    } catch {
      // Cae al fallback
    }
  }

  // Intento 2: execCommand sobre textarea temporal
  try {
    const ta = document.createElement('textarea')
    ta.value = texto
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '-9999px'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    if (ok) return
  } catch {
    // Cae al error final
  }

  throw new Error('El portapapeles no está disponible en este navegador')
}
