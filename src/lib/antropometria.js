// Peso, talla, superficie corporal (fórmula de Mosteller) e IMC.
//   SC (m²) = √(talla cm × peso kg / 3600)
//   IMC (kg/m²) = peso kg / (talla m)²

// Rangos aceptados en el formulario (incluyen pacientes pediátricos)
export const RANGO_PESO = { min: 2, max: 350 }    // kg
export const RANGO_TALLA = { min: 40, max: 230 }  // cm

const numero = (v) => {
  if (v === '' || v == null) return null
  const n = parseFloat(String(v).replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

const dentro = (n, r) => n != null && n >= r.min && n <= r.max

export function superficieCorporal(pesoKg, tallaCm) {
  const p = numero(pesoKg), t = numero(tallaCm)
  if (!dentro(p, RANGO_PESO) || !dentro(t, RANGO_TALLA)) return null
  return Math.round(Math.sqrt((t * p) / 3600) * 100) / 100
}

export function imc(pesoKg, tallaCm) {
  const p = numero(pesoKg), t = numero(tallaCm)
  if (!dentro(p, RANGO_PESO) || !dentro(t, RANGO_TALLA)) return null
  return Math.round((p / ((t / 100) ** 2)) * 10) / 10
}

// Clasificación del IMC en adultos (OMS)
export function categoriaImc(valor) {
  if (valor == null) return null
  if (valor < 18.5) return 'Bajo peso'
  if (valor < 25) return 'Normal'
  if (valor < 30) return 'Sobrepeso'
  return 'Obesidad'
}

// Mensaje de error de validación, o null si el valor es válido
export function errorAntropometria(valor, rango, unidad) {
  const n = numero(valor)
  if (n == null) return 'Requerido'
  if (!dentro(n, rango)) return `Debe estar entre ${rango.min} y ${rango.max} ${unidad}`
  return null
}

export const aNumero = numero

// Texto corto para resúmenes y actas: "68 kg · 165 cm · SC 1,77 m² · IMC 25"
export function resumenAntropometria(caso) {
  if (caso?.peso_kg == null && caso?.talla_cm == null) return null
  const fmt = (n, d = 0) => Number(n).toLocaleString('es-CO', { maximumFractionDigits: d })
  const partes = []
  if (caso.peso_kg != null) partes.push(`${fmt(caso.peso_kg, 1)} kg`)
  if (caso.talla_cm != null) partes.push(`${fmt(caso.talla_cm, 1)} cm`)
  const sc = caso.superficie_corporal ?? superficieCorporal(caso.peso_kg, caso.talla_cm)
  if (sc != null) partes.push(`SC ${fmt(sc, 2)} m²`)
  const i = imc(caso.peso_kg, caso.talla_cm)
  if (i != null) partes.push(`IMC ${fmt(i, 1)}`)
  return partes.join(' · ')
}
