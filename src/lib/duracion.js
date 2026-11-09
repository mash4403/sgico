// Duración del tratamiento para la proyección de costos.
//   hasta_progresion → ciclos = PFS × 30 / días del ciclo (al progresar se cambia de línea)
//   fija             → ciclos = los del esquema (adyuvancia, neoadyuvancia, consolidación)
//   tope             → hasta progresión, con un máximo de ciclos (p. ej. pembrolizumab 35 ciclos)
export const TIPOS_DURACION = [
  { value: 'hasta_progresion', label: 'Hasta progresión (según PFS)' },
  { value: 'fija',             label: 'Duración fija (ciclos del esquema)' },
  { value: 'tope',             label: 'Hasta progresión con tope de ciclos' },
]

const positivo = (v) => {
  const n = parseFloat(v)
  return !isNaN(n) && n > 0 ? n : null
}

// Ciclos a costear según la duración. null si faltan datos.
export function ciclosSegunDuracion(modo, pfs, dias, ciclos) {
  const p = positivo(pfs), d = positivo(dias), n = positivo(ciclos)
  const porPfs = p != null && d != null ? (p * 30) / d : null
  if (modo === 'fija') return n
  if (modo === 'tope') return porPfs != null && n != null ? Math.min(porPfs, n) : null
  return porPfs
}

// Etiqueta de la fila de ciclos en la proyección (x = proyeccion.actual | proyeccion.propuesto)
export function etiquetaCiclos(x) {
  if (x?.duracion === 'fija') return 'Ciclos del esquema (duración fija)'
  if (x?.duracion === 'tope') return `Ciclos hasta progresión (PFS ${x.pfs_meses}m, tope ${x.ciclos_esquema})`
  return `Ciclos en PFS (${x?.pfs_meses}m)`
}
