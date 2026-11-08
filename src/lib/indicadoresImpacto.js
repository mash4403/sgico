// Indicadores de impacto de las decisiones del comité (solicitud del cliente):
//   1. Valor del tratamiento propuesto en junta vs. definido por el comité
//   2. Impacto en sobrevida
//   3. Impacto en calidad de vida (ECOG y EVA)
// Complementan los indicadores existentes; no los reemplazan.

const APROBADOS = ['aprobado', 'modificado']
const num = (v) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v))

// ── 1. Valor propuesto vs. definido ──────────────────────────────────────
// Por ciclo: misma regla que el ahorro acumulado (vw_kpi_impacto_comite_mensual).
//   aprobado/modificado → definido = costo aprobado (o el propuesto si no se ajustó)
//   rechazado           → definido = tratamiento que el paciente continúa (costo previo; 0 si es naive)
// Por tratamiento: costo por ciclo × ciclos esperados según el PFS del estudio
// (la proyección guardada al presentar el caso, casos_comite.proyeccion_costos).
// El definido usa los mismos ciclos del propuesto (aprobado) o el total del
// tratamiento actual (rechazado).
export function valorPorCaso(c) {
  const propCiclo = num(c.costo_estimado)
  if (propCiclo == null) return null
  const aprobado = APROBADOS.includes(c.decision)
  const defCiclo = aprobado ? (num(c.costo_molecula_aprobada) ?? propCiclo) : (num(c.costo_previo) ?? 0)

  const proy = c.proyeccion_costos
  const ciclos = num(proy?.propuesto?.ciclos_pfs)
  let propTx = null, defTx = null
  if (ciclos != null) {
    propTx = num(proy.propuesto.total_pfs) ?? propCiclo * ciclos
    defTx = aprobado ? defCiclo * ciclos : (num(proy?.actual?.total_pfs) ?? 0)
  }
  return {
    propCiclo, defCiclo, difCiclo: propCiclo - defCiclo,
    ciclos, propTx, defTx, difTx: propTx != null ? propTx - defTx : null,
  }
}

export function valorPropuestoVsDefinido(casos) {
  const filas = casos.map(c => ({ c, v: valorPorCaso(c) })).filter(x => x.v)
  const conTx = filas.filter(x => x.v.propTx != null)
  const suma = (arr, k) => arr.reduce((a, x) => a + (x.v[k] || 0), 0)
  const r = {
    n: filas.length,
    nConProyeccion: conTx.length,
    propCiclo: suma(filas, 'propCiclo'), defCiclo: suma(filas, 'defCiclo'),
    propTx: suma(conTx, 'propTx'), defTx: suma(conTx, 'defTx'),
  }
  r.difCiclo = r.propCiclo - r.defCiclo
  r.difTx = r.propTx - r.defTx
  r.pctCiclo = r.propCiclo ? (r.difCiclo / r.propCiclo) * 100 : null
  r.pctTx = r.propTx ? (r.difTx / r.propTx) * 100 : null
  return r
}

// ── 2. Impacto en sobrevida ──────────────────────────────────────────────
// Tasa a un hito (6 o 12 meses) desde el inicio del tratamiento aprobado:
// se cuentan los pacientes que superaron el hito y los que tuvieron el evento
// antes; los que aún no llegan al hito sin evento no se cuentan (seguimiento
// insuficiente). Es una tasa observada, no una estimación de Kaplan-Meier.
function tasaAlHito(desenlaces, campoMeses, campoEvento, hito) {
  let superan = 0, evaluables = 0
  for (const d of desenlaces) {
    const m = num(d[campoMeses])
    if (m == null) continue
    if (m >= hito) { superan++; evaluables++ } else if (d[campoEvento]) { evaluables++ }
  }
  return { pct: evaluables ? (superan / evaluables) * 100 : null, n: evaluables }
}

export function impactoSobrevida(desenlaces, casosPorId) {
  const grupo = (lista) => {
    // Meses de PFS ganados frente a la línea previa (solo pacientes con PFS del tratamiento anterior)
    const ganancias = lista.map(d => {
      const prev = num(casosPorId[d.caso_id]?.proyeccion_costos?.actual?.pfs_meses)
      const esp = num(d.pfs_esperado), real = num(d.pfs_real_meses)
      if (prev == null || esp == null || real == null) return null
      return { esperada: esp - prev, real: real - prev }
    }).filter(Boolean)
    const prom = (k) => ganancias.length ? ganancias.reduce((a, g) => a + g[k], 0) / ganancias.length : null
    return {
      n: lista.filter(d => num(d.os_real_meses) != null).length,
      vivos6: tasaAlHito(lista, 'os_real_meses', 'evento_os', 6),
      vivos12: tasaAlHito(lista, 'os_real_meses', 'evento_os', 12),
      sinProg6: tasaAlHito(lista, 'pfs_real_meses', 'evento_pfs', 6),
      sinProg12: tasaAlHito(lista, 'pfs_real_meses', 'evento_pfs', 12),
      gananciaEsperada: prom('esperada'), gananciaReal: prom('real'), nGanancia: ganancias.length,
    }
  }
  return {
    total: grupo(desenlaces),
    aprobado: grupo(desenlaces.filter(d => d.decision === 'aprobado')),
    modificado: grupo(desenlaces.filter(d => d.decision === 'modificado')),
  }
}

// ── 3. Impacto en calidad de vida ────────────────────────────────────────
// Compara el ECOG y el dolor (EVA) al ingreso al comité con el último control
// realizado que los registró. ECOG: menor es mejor. EVA: menor es mejor;
// se considera cambio una diferencia de 2 puntos o más (cambio clínicamente relevante).
export function impactoCalidadVida(casosAprobados, controles, desenlaces) {
  const ultimo = {}
  for (const s of controles) {
    if (s.ecog == null && s.eva == null) continue
    const u = ultimo[s.caso_id]
    if (!u || (s.fecha_realizada || '') > (u.fecha_realizada || '')) ultimo[s.caso_id] = s
  }
  const ecog = { mejora: 0, igual: 0, empeora: 0 }
  const eva = { mejora: 0, igual: 0, empeora: 0 }
  for (const c of casosAprobados) {
    const u = ultimo[c.id]
    if (!u) continue
    const e0 = num(c.ecog), e1 = num(u.ecog)
    if (e0 != null && e1 != null) ecog[e1 < e0 ? 'mejora' : e1 > e0 ? 'empeora' : 'igual']++
    const d0 = num(c.eva), d1 = num(u.eva)
    if (d0 != null && d1 != null) eva[d1 <= d0 - 2 ? 'mejora' : d1 >= d0 + 2 ? 'empeora' : 'igual']++
  }
  const pct = (o) => {
    const n = o.mejora + o.igual + o.empeora
    return { ...o, n, pMejora: n ? (o.mejora / n) * 100 : null, pIgual: n ? (o.igual / n) * 100 : null, pEmpeora: n ? (o.empeora / n) * 100 : null }
  }
  const conControl = desenlaces.filter(d => d.n_eval_realizadas > 0 || d.toxicidad_max != null)
  const toxGrave = conControl.filter(d => (d.toxicidad_max || 0) >= 3 || d.suspension_toxicidad).length
  return {
    ecog: pct(ecog), eva: pct(eva),
    toxicidad: { n: conControl.length, graves: toxGrave, pct: conControl.length ? (toxGrave / conControl.length) * 100 : null },
  }
}
