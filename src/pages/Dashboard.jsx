import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatCOP } from '@/lib/utils'
import LogoInoos from '../components/LogoInoos'
import { valorPorCaso, valorPropuestoVsDefinido, impactoSobrevida, impactoCalidadVida } from '../lib/indicadoresImpacto'
import {
  AlertTriangle, Users, Clock, TrendingDown, Shield,
  Activity, Heart, XCircle, CalendarDays, ClipboardList, RefreshCw, Stethoscope, Target, TrendingUp, ChevronDown, ChevronUp
} from 'lucide-react'
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

// NODOVIA — colores de marca (para uso inline en SVG/recharts)
const C = {
  petroleo: '#0E4C57', petroleoClaro: '#156573', pulso: '#35C9B6',
  bronce: '#B9832F', bronceClaro: '#D9A44E', peligro: '#D9534F',
  hueso: '#F3EFE7', niebla: '#A9BEC2', nieblaOscura: '#6E8A90', tinta2: '#10242C',
}

// Tarjeta de marca: tinta-2, borde niebla, arista de luz superior (pulso)
function Card({ children, className = '', ...rest }) {
  return (
    <div className={`rounded-[18px] p-5 border border-niebla/15 bg-tinta-2 ${className}`}
         style={{ boxShadow: 'inset 0 1px 0 rgba(53,201,182,0.15)' }} {...rest}>
      {children}
    </div>
  )
}

// Eyebrow de marca: mono, uppercase, tracking .2em, niebla-oscura
function Eyebrow({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      {Icon && <Icon size={14} className="text-niebla-oscura" />}
      <h3 className="text-[11px] font-mono text-niebla-oscura uppercase tracking-[0.2em]">{children}</h3>
    </div>
  )
}

// Metric card
function MetricCard({ label, value, sub, icon: Icon, color = C.petroleoClaro }) {
  return (
    <Card style={{ borderLeft: `3px solid ${color}`, boxShadow: 'inset 0 1px 0 rgba(53,201,182,0.15)' }}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-mono text-niebla-oscura uppercase tracking-[0.2em]">{label}</p>
          <p className="text-2xl font-display font-bold mt-2 tracking-tight text-hueso">{value}</p>
          {sub && <p className="text-xs text-niebla mt-1">{sub}</p>}
        </div>
        {Icon && <Icon size={20} style={{ color }} className="opacity-60" />}
      </div>
    </Card>
  )
}

// Comparación real vs. estudio pivotal (barra de cumplimiento)
function ComparaBar({ label, real, esperado, ratio, unidad = '' }) {
  const r = real == null ? null : Number(real)
  const e = esperado == null ? null : Number(esperado)
  const rr = ratio != null ? Number(ratio) : (r != null && e ? r / e : null)
  const color = rr == null ? C.nieblaOscura : rr >= 0.9 ? C.pulso : rr >= 0.5 ? C.bronce : C.peligro
  const pct = rr == null ? 0 : Math.min(100, Math.max(0, rr * 100))
  return (
    <div className="rounded-xl p-4 border border-niebla/10" style={{ background: 'rgba(243,239,231,0.02)' }}>
      <p className="text-[11px] font-mono text-niebla-oscura uppercase tracking-[0.2em] mb-2">{label}</p>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-display font-bold text-hueso">
          {r == null ? '—' : r}{r == null ? '' : unidad}
        </span>
        <span className="text-xs text-niebla">vs {e == null ? '—' : `${e}${unidad}`} estudio</span>
      </div>
      <div className="h-1.5 rounded-full mt-3 overflow-hidden" style={{ background: 'rgba(169,190,194,0.10)' }}>
        <div className="h-full rounded-full"
          style={{ width: `${pct}%`, background: color, transition: 'width 1s ease' }} />
      </div>
      <p className="text-[11px] mt-1.5 font-semibold" style={{ color }}>
        {rr == null ? 'Sin datos aún' : `${Math.round(rr * 100)}% del estudio`}
      </p>
    </div>
  )
}

// Gauge
function Gauge({ value, label, color, size = 100 }) {
  const r = (size - 14) / 2
  const circ = Math.PI * r
  const offset = circ - (value / 100) * circ
  return (
    <div className="text-center">
      <svg width={size} height={size / 2 + 18} viewBox={`0 0 ${size} ${size / 2 + 18}`}>
        <path d={`M 7 ${size / 2 + 7} A ${r} ${r} 0 0 1 ${size - 7} ${size / 2 + 7}`}
          fill="none" stroke="rgba(169,190,194,0.12)" strokeWidth={9} strokeLinecap="round" />
        <path d={`M 7 ${size / 2 + 7} A ${r} ${r} 0 0 1 ${size - 7} ${size / 2 + 7}`}
          fill="none" stroke={color} strokeWidth={9} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s ease' }} />
        <text x={size / 2} y={size / 2 + 2} textAnchor="middle" fill={C.hueso}
          fontSize={20} fontWeight={700} fontFamily="'Space Grotesk', sans-serif">
          {Math.round(value)}%
        </text>
      </svg>
      <div className="text-[11px] text-niebla -mt-1 font-medium">{label}</div>
    </div>
  )
}

// Ahorro por caso, con la misma fórmula de vw_kpi_impacto_comite_mensual (migración 008):
//   aprobado/modificado → costo propuesto − costo aprobado (ajuste de costo)
//   rechazado           → costo propuesto − costo previo  (lo que se evitó pagar)
function ahorroCaso(c) {
  const propuesto = Number(c.costo_estimado || 0)
  if (c.decision === 'rechazado') return propuesto - Number(c.costo_previo || 0)
  return propuesto - Number(c.costo_molecula_aprobada ?? c.costo_estimado ?? 0)
}

const DECISION_TXT = { aprobado: 'Aprobado', modificado: 'Aprobado con modif.', rechazado: 'Rechazado' }
const mesDe = (c) => (c.fecha_presentacion || c.fecha_solicitud || '').slice(0, 7)
const fmtMes = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })

// Desglose del ahorro acumulado: por componente, por mes y por caso
function AhorroDetalle({ casos, onCaso }) {
  const [componente, setComponente] = useState('') // '' | 'rechazo' | 'ajuste'
  const [mes, setMes] = useState('')

  const filas = casos.map(c => ({ ...c, ahorro: ahorroCaso(c), mes: mesDe(c), valor: valorPorCaso(c),
    componente: c.decision === 'rechazado' ? 'rechazo' : 'ajuste' }))
  const suma = (xs) => xs.reduce((n, c) => n + c.ahorro, 0)
  const sumaTx = (xs) => xs.reduce((n, c) => n + (c.valor?.difTx || 0), 0)

  const rechazos = filas.filter(c => c.componente === 'rechazo')
  const ajustes = filas.filter(c => c.componente === 'ajuste')
  const ajustesConCambio = ajustes.filter(c => c.ahorro !== 0)

  const meses = [...new Set(filas.map(c => c.mes).filter(Boolean))].sort().reverse()
  const visibles = filas
    .filter(c => (!componente || c.componente === componente) && (!mes || c.mes === mes))
    .sort((a, b) => Math.abs(b.ahorro) - Math.abs(a.ahorro))

  const colorValor = (v) => (v > 0 ? C.pulso : v < 0 ? C.peligro : C.nieblaOscura)
  const chip = (activo) => `px-3 py-1.5 rounded-full text-xs border transition-colors ${
    activo ? 'border-pulso/50 text-pulso bg-pulso/10' : 'border-niebla/20 text-niebla hover:text-hueso'}`

  return (
    <div className="mt-5 pt-4 border-t border-niebla/10 space-y-5">
      {/* Por componente */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { key: 'rechazo', label: 'Rechazos', val: suma(rechazos), sub: `${rechazos.length} casos · propuesto − costo previo` },
          { key: 'ajuste', label: 'Ajustes de costo', val: suma(ajustes), sub: `${ajustesConCambio.length} de ${ajustes.length} aprobados con monto distinto` },
          { key: '', label: 'Total', val: suma(filas), sub: `${filas.length} casos con costo propuesto` },
        ].map(b => (
          <button key={b.label} type="button" onClick={() => setComponente(b.key)}
            className={`text-left rounded-xl p-4 border transition-colors ${
              componente === b.key ? 'border-pulso/50 bg-pulso/5' : 'border-niebla/15 hover:border-niebla/30'}`}>
            <p className="text-[11px] font-mono text-niebla-oscura uppercase tracking-[0.2em]">{b.label}</p>
            <p className="text-xl font-display font-bold mt-1" style={{ color: colorValor(b.val) }}>
              {b.val < 0 ? '−' : ''}{formatCOP(Math.abs(b.val))}
            </p>
            <p className="text-xs text-niebla mt-1">{b.sub}</p>
          </button>
        ))}
      </div>

      {/* Por mes */}
      <div>
        <p className="text-[11px] font-mono text-niebla-oscura uppercase tracking-[0.2em] mb-2">Por mes</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setMes('')} className={chip(!mes)}>Todos</button>
          {meses.map(m => {
            const v = suma(filas.filter(c => c.mes === m && (!componente || c.componente === componente)))
            return (
              <button key={m} type="button" onClick={() => setMes(m)} className={chip(mes === m)}>
                <span className="capitalize">{fmtMes(m)}</span>
                <span className="ml-2 font-mono" style={{ color: colorValor(v) }}>{v < 0 ? '−' : ''}{formatCOP(Math.abs(v))}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Por caso */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] font-mono text-niebla-oscura uppercase tracking-[0.15em]">
              <th className="text-left font-medium py-2 pr-3">Fecha</th>
              <th className="text-left font-medium py-2 pr-3">Paciente</th>
              <th className="text-left font-medium py-2 pr-3">Medicamento / protocolo</th>
              <th className="text-left font-medium py-2 pr-3">Decisión</th>
              <th className="text-right font-medium py-2 px-2">Propuesto</th>
              <th className="text-right font-medium py-2 px-2">Aprobado / previo</th>
              <th className="text-right font-medium py-2 px-2">Ahorro</th>
              <th className="text-right font-medium py-2 pl-2" title="Costo por ciclo × ciclos esperados según el PFS del estudio">Diferencia tratamiento</th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 ? (
              <tr><td colSpan={8} className="py-4 text-center text-niebla-oscura">Sin casos para este filtro</td></tr>
            ) : visibles.map(c => (
              <tr key={c.id} onClick={() => onCaso(c.id)} title="Ver caso"
                  className="border-t border-niebla/10 cursor-pointer hover:bg-hueso/5 transition-colors">
                <td className="py-2 pr-3 text-niebla font-mono text-xs">{c.fecha_presentacion || c.fecha_solicitud || '—'}</td>
                <td className="py-2 pr-3 text-hueso">{c.pacientes?.nombre || `#${c.id}`}</td>
                <td className="py-2 pr-3 text-niebla truncate max-w-[180px]">
                  {c.molecula_aprobada || c.molecula_propuesta || c.protocolos?.nombre || '—'}
                </td>
                <td className="py-2 pr-3 text-niebla">{DECISION_TXT[c.decision] || c.decision}</td>
                <td className="py-2 px-2 text-right font-mono text-niebla">{formatCOP(Number(c.costo_estimado || 0))}</td>
                <td className="py-2 px-2 text-right font-mono text-niebla">
                  {formatCOP(Number(c.decision === 'rechazado' ? (c.costo_previo || 0) : (c.costo_molecula_aprobada ?? c.costo_estimado ?? 0)))}
                  <span className="block text-[10px] text-niebla-oscura">{c.decision === 'rechazado' ? 'previo' : 'aprobado'}</span>
                </td>
                <td className="py-2 px-2 text-right font-mono font-semibold" style={{ color: colorValor(c.ahorro) }}>
                  {c.ahorro < 0 ? '−' : ''}{formatCOP(Math.abs(c.ahorro))}
                </td>
                <td className="py-2 pl-2 text-right font-mono" style={{ color: colorValor(c.valor?.difTx ?? 0) }}>
                  {c.valor?.difTx == null ? <span className="text-niebla-oscura">—</span> : <>
                    {c.valor.difTx < 0 ? '−' : ''}{formatCOP(Math.abs(c.valor.difTx))}
                    <span className="block text-[10px] text-niebla-oscura">{c.valor.ciclos} ciclos</span>
                  </>}
                </td>
              </tr>
            ))}
          </tbody>
          {visibles.length > 0 && (
            <tfoot>
              <tr className="border-t border-niebla/20">
                <td colSpan={6} className="py-2 pr-3 text-right text-[11px] font-mono text-niebla-oscura uppercase tracking-[0.15em]">
                  Subtotal ({visibles.length})
                </td>
                <td className="py-2 px-2 text-right font-mono font-bold" style={{ color: colorValor(suma(visibles)) }}>
                  {suma(visibles) < 0 ? '−' : ''}{formatCOP(Math.abs(suma(visibles)))}
                </td>
                <td className="py-2 pl-2 text-right font-mono font-bold" style={{ color: colorValor(sumaTx(visibles)) }}>
                  {sumaTx(visibles) < 0 ? '−' : ''}{formatCOP(Math.abs(sumaTx(visibles)))}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

const fmtPct = (v) => (v == null ? '—' : `${Math.round(v)}%`)
const fmtMeses = (v) => (v == null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)} m`)
const signoCOP = (v) => `${v < 0 ? '−' : ''}${formatCOP(Math.abs(v))}`

function Dato({ label, value, sub, color }) {
  return (
    <div>
      <p className="text-[11px] font-mono text-niebla-oscura uppercase tracking-[0.15em]">{label}</p>
      <p className="text-lg font-display font-bold mt-0.5" style={color ? { color } : undefined}>{value}</p>
      {sub && <p className="text-[11px] text-niebla-oscura">{sub}</p>}
    </div>
  )
}

// Barra mejora / igual / empeora
function BarraCambio({ titulo, d }) {
  if (!d.n) return (
    <div>
      <p className="text-sm text-hueso mb-1">{titulo}</p>
      <p className="text-xs text-niebla-oscura">Aún sin controles con este dato</p>
    </div>
  )
  const seg = [
    { k: 'pMejora', label: 'Mejora', color: 'var(--ok)' },
    { k: 'pIgual', label: 'Estable', color: 'var(--line-strong)' },
    { k: 'pEmpeora', label: 'Empeora', color: 'var(--bad)' },
  ]
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <p className="text-sm text-hueso">{titulo}</p>
        <p className="text-[11px] text-niebla-oscura">{d.n} pacientes</p>
      </div>
      <div className="flex h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--sunken)' }}>
        {seg.map(x => d[x.k] > 0 && <div key={x.k} style={{ width: `${d[x.k]}%`, background: x.color }} title={`${x.label}: ${fmtPct(d[x.k])}`} />)}
      </div>
      <div className="flex gap-4 mt-1.5 text-[11px]">
        {seg.map(x => (
          <span key={x.k} className="flex items-center gap-1 text-niebla">
            <span className="w-2 h-2 rounded-full" style={{ background: x.color }} /> {x.label} {fmtPct(d[x.k])}
          </span>
        ))}
      </div>
    </div>
  )
}

function ImpactoDecisiones({ casosValor, desenlaces, casosBase, controles }) {
  const [grupo, setGrupo] = useState('total')
  const valor = valorPropuestoVsDefinido(casosValor)
  const porId = Object.fromEntries(casosBase.map(c => [c.id, c]))
  const sv = impactoSobrevida(desenlaces, porId)[grupo]
  const cv = impactoCalidadVida(casosBase, controles, desenlaces)
  const colorDif = (v) => (v > 0 ? C.pulso : v < 0 ? C.peligro : undefined)
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 pt-2">
        <Target size={16} style={{ color: 'var(--marca)' }} />
        <h2 className="!text-lg font-display font-semibold text-hueso">Impacto de las decisiones del comité</h2>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* 1. Valor propuesto vs definido */}
        <Card>
          <Eyebrow icon={TrendingDown}>Valor propuesto en junta vs. definido</Eyebrow>
          {valor.n === 0 ? <p className="text-sm text-niebla-oscura">Aún no hay casos decididos con costo.</p> : <>
            <p className="text-[11px] font-mono text-niebla-oscura uppercase tracking-[0.15em] mb-2">Tratamiento completo</p>
            <div className="grid grid-cols-2 gap-3">
              <Dato label="Propuesto" value={formatCOP(valor.propTx)} />
              <Dato label="Definido" value={formatCOP(valor.defTx)} />
            </div>
            <div className="mt-3 rounded-xl px-3 py-2.5 border border-niebla/15">
              <Dato label={valor.difTx >= 0 ? 'Diferencia (ahorro)' : 'Diferencia (sobrecosto)'}
                value={signoCOP(valor.difTx)} color={colorDif(valor.difTx)}
                sub={`${fmtPct(valor.pctTx == null ? null : Math.abs(valor.pctTx))} del valor propuesto · ${valor.nConProyeccion} casos con proyección`} />
            </div>
            <p className="text-[11px] font-mono text-niebla-oscura uppercase tracking-[0.15em] mt-4 mb-2">Por ciclo</p>
            <div className="grid grid-cols-3 gap-2">
              <Dato label="Propuesto" value={formatCOP(valor.propCiclo)} />
              <Dato label="Definido" value={formatCOP(valor.defCiclo)} />
              <Dato label="Diferencia" value={signoCOP(valor.difCiclo)} color={colorDif(valor.difCiclo)} />
            </div>
            <p className="text-[11px] text-niebla-oscura mt-3 leading-relaxed">
              Tratamiento completo = costo por ciclo × ciclos esperados según el PFS del estudio. En los rechazos, el valor definido es el tratamiento que el paciente continúa.
            </p>
          </>}
        </Card>

        {/* 2. Sobrevida */}
        <Card>
          <Eyebrow icon={Heart}>Impacto en sobrevida</Eyebrow>
          {/* Filtro por decisión: control segmentado en su propia fila */}
          <div className="flex w-full mb-4 rounded-lg p-0.5" style={{ background: 'var(--sunken)' }}>
            {[['total', 'Todos'], ['aprobado', 'Aprobados'], ['modificado', 'Modificados']].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setGrupo(k)}
                className="flex-1 whitespace-nowrap rounded-md !px-2 !py-1 !text-xs font-medium transition-colors"
                style={grupo === k
                  ? { background: 'var(--surface)', color: 'var(--marca)', boxShadow: '0 1px 2px rgba(0,0,0,.08)' }
                  : { background: 'transparent', color: 'var(--muted)' }}>
                {l}
              </button>
            ))}
          </div>
          {sv.n === 0 ? <p className="text-sm text-niebla-oscura">Aún no hay seguimientos con fecha de inicio de tratamiento.</p> : <>
            <div className="grid grid-cols-2 gap-3">
              <Dato label="Vivos a 6 meses" value={fmtPct(sv.vivos6.pct)} sub={`${sv.vivos6.n} evaluables`} />
              <Dato label="Vivos a 12 meses" value={fmtPct(sv.vivos12.pct)} sub={`${sv.vivos12.n} evaluables`} />
              <Dato label="Sin progresión 6 m" value={fmtPct(sv.sinProg6.pct)} sub={`${sv.sinProg6.n} evaluables`} />
              <Dato label="Sin progresión 12 m" value={fmtPct(sv.sinProg12.pct)} sub={`${sv.sinProg12.n} evaluables`} />
            </div>
            <div className="mt-3 rounded-xl px-3 py-2.5 border border-niebla/15">
              <p className="text-[11px] font-mono text-niebla-oscura uppercase tracking-[0.15em]">PFS ganado vs. tratamiento anterior</p>
              {sv.nGanancia === 0 ? <p className="text-xs text-niebla-oscura mt-1">Sin pacientes con PFS del tratamiento anterior registrado.</p> : (
                <div className="grid grid-cols-2 gap-3 mt-1">
                  <Dato label="Esperado" value={fmtMeses(sv.gananciaEsperada)} />
                  <Dato label="Real a la fecha" value={fmtMeses(sv.gananciaReal)} color={colorDif(sv.gananciaReal)} sub={`${sv.nGanancia} pacientes`} />
                </div>
              )}
            </div>
            <p className="text-[11px] text-niebla-oscura mt-3 leading-relaxed">
              Desde el inicio del tratamiento aprobado. Evaluables: pacientes que ya cumplieron el plazo o tuvieron el evento antes. Los rechazos no tienen seguimiento, por eso no se comparan.
            </p>
          </>}
        </Card>

        {/* 3. Calidad de vida */}
        <Card>
          <Eyebrow icon={Activity}>Impacto en calidad de vida</Eyebrow>
          <p className="text-xs text-niebla mb-3">Último control frente al ingreso al comité</p>
          <div className="space-y-4">
            <BarraCambio titulo="Capacidad funcional (ECOG)" d={cv.ecog} />
            <BarraCambio titulo="Dolor (EVA, cambio ≥ 2 puntos)" d={cv.eva} />
          </div>
          <div className="mt-4 rounded-xl px-3 py-2.5 border border-niebla/15">
            <Dato label="Toxicidad grave (grado ≥ 3 o suspensión)" value={fmtPct(cv.toxicidad.pct)}
              color={cv.toxicidad.pct > 0 ? C.peligro : undefined}
              sub={cv.toxicidad.n ? `${cv.toxicidad.graves} de ${cv.toxicidad.n} pacientes con control` : 'Aún sin controles'} />
          </div>
        </Card>
      </div>
    </div>
  )
}

const TIPO_COMITE_CORTO = { tumor_solido: 'Tumor sólido', hematologico: 'Hematológico', multidisciplinario: 'Multidisciplinario' }

// Encabezado: lo que el comité tiene por delante, con acceso directo a cada sección
function ResumenAgenda({ agenda, navigate }) {
  const p = agenda.proximo
  const pendientesProx = p ? (p.casos || []).filter(c => !c.presentado).length : 0
  const diasFaltan = p ? Math.round((new Date(`${p.fecha}T00:00:00`) - new Date(new Date().toDateString())) / 86400000) : null
  const cuando = diasFaltan === 0 ? 'hoy' : diasFaltan === 1 ? 'mañana' : `en ${diasFaltan} días`
  const chip = 'flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] border transition-colors hover:border-[color:var(--marca)]'
  const chipStyle = { background: 'var(--surface)', borderColor: 'var(--line)', color: 'var(--ink)' }
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" onClick={() => navigate('/comites')} className={chip} style={chipStyle}>
        <CalendarDays size={14} style={{ color: 'var(--marca)' }} />
        {p ? (
          <span>
            Próximo comité <b className="font-semibold">{cuando}</b>
            <span style={{ color: 'var(--muted)' }}>
              {' · '}{new Date(`${p.fecha}T00:00:00`).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })}
              {' · '}{TIPO_COMITE_CORTO[p.tipo_comite] || p.tipo_comite}
              {' · '}{pendientesProx} {pendientesProx === 1 ? 'caso' : 'casos'}
            </span>
          </span>
        ) : <span>Sin comités programados · <b className="font-semibold">programar uno</b></span>}
      </button>
      <button type="button" onClick={() => navigate('/agenda')} className={chip} style={chipStyle}>
        <ClipboardList size={14} style={{ color: 'var(--marca)' }} />
        <span><b className="font-semibold">{agenda.porPresentar}</b> {agenda.porPresentar === 1 ? 'caso' : 'casos'} por presentar</span>
      </button>
      <button type="button" onClick={() => navigate('/seguimientos')} className={chip}
        style={agenda.vencidos ? { ...chipStyle, background: 'var(--warn-soft)', borderColor: 'color-mix(in srgb, var(--warn) 35%, var(--surface))' } : chipStyle}>
        <AlertTriangle size={14} style={{ color: agenda.vencidos ? 'var(--warn)' : 'var(--ok)' }} />
        <span>
          {agenda.vencidos
            ? <><b className="font-semibold">{agenda.vencidos}</b> {agenda.vencidos === 1 ? 'seguimiento vencido' : 'seguimientos vencidos'}</>
            : 'Seguimientos al día'}
        </span>
      </button>
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [mensual, setMensual] = useState([])
  const [alertas, setAlertas] = useState([])
  const [efectividad, setEfectividad] = useState(null)
  const [cumplimiento, setCumplimiento] = useState(null)
  const [impacto, setImpacto] = useState([])
  const [kri, setKri] = useState([])
  const [pacientesDes, setPacientesDes] = useState([])
  const [casosAhorro, setCasosAhorro] = useState([])
  const [verDetalleAhorro, setVerDetalleAhorro] = useState(false)
  const [loading, setLoading] = useState(true)
  const [agenda, setAgenda] = useState({ proximo: null, porPresentar: 0, vencidos: 0 })
  const [casosBase, setCasosBase] = useState([])
  const [controlesCV, setControlesCV] = useState([])

  const fetchData = async () => {
    setLoading(true)
    try {
      const { data: dashData } = await supabase.from('vw_dashboard_general').select('*').single()
      const { data: monthData } = await supabase.from('vw_kpi_mensual').select('*').limit(6)
      const { data: alertData } = await supabase.from('alertas')
        .select('*, casos_comite(paciente_id, pacientes(nombre))')
        .eq('estado', 'activa')
        .order('created_at', { ascending: false })
        .limit(10)
      const { count: pendCount } = await supabase.from('seguimientos')
        .select('*', { count: 'exact', head: true })
        .in('estado', ['pendiente', 'vencido'])

      // MVP calidad — indicadores de desenlaces (migración 008)
      const [efc, cmp, imp, riesgo, pacDes, ahorro] = await Promise.all([
        supabase.from('vw_kpi_efectividad').select('*').maybeSingle(),
        supabase.from('vw_kpi_cumplimiento').select('*').maybeSingle(),
        supabase.from('vw_kpi_impacto_comite_mensual').select('*').limit(12),
        supabase.from('vw_kri_costo_efectividad').select('*').limit(10),
        supabase.from('vw_desenlace_caso')
          .select('caso_id, paciente_nombre, protocolo, decision, mejor_respuesta, respondedor, pfs_real_meses, pfs_esperado, os_real_meses, os_esperado, costo_real_acumulado, evento_pfs, evento_os, n_eval_realizadas, toxicidad_max, suspension_toxicidad')
          .in('decision', ['aprobado', 'modificado'])
          .order('caso_id'),
        // Desglose del ahorro: mismos casos que vw_kpi_impacto_comite_mensual
        supabase.from('casos_comite')
          .select('id, decision, fecha_presentacion, fecha_solicitud, costo_estimado, costo_molecula_aprobada, costo_previo, molecula_propuesta, molecula_aprobada, proyeccion_costos, pacientes(nombre, documento), protocolos(nombre)')
          .not('costo_estimado', 'is', null)
          .in('decision', ['aprobado', 'modificado', 'rechazado']),
      ])

      // Resumen operativo del encabezado
      const hoyISO = new Date().toISOString().slice(0, 10)
      const [prox, porPres, venc] = await Promise.all([
        supabase.from('sesiones_comite').select('id, fecha, tipo_comite, casos:casos_comite(id, presentado)')
          .gte('fecha', hoyISO).order('fecha').limit(1).maybeSingle(),
        supabase.from('casos_comite').select('id', { count: 'exact', head: true })
          .eq('presentado', false).not('sesion_id', 'is', null),
        supabase.from('seguimientos').select('id', { count: 'exact', head: true })
          .in('estado', ['pendiente', 'vencido']).lt('fecha_programada', hoyISO),
      ])
      setAgenda({ proximo: prox.data || null, porPresentar: porPres.count || 0, vencidos: venc.count || 0 })

      // Indicadores de impacto: datos del ingreso (ECOG, EVA, PFS previo) y controles con calidad de vida
      const [base, ctrl] = await Promise.all([
        supabase.from('casos_comite').select('id, decision, ecog, eva, proyeccion_costos').in('decision', ['aprobado', 'modificado']),
        supabase.from('seguimientos').select('caso_id, fecha_realizada, ecog, eva').eq('estado', 'realizado'),
      ])
      setCasosBase(base.data || [])
      setControlesCV(ctrl.error ? [] : (ctrl.data || []))  // sin la migración 021 no hay ECOG/EVA en controles

      setStats({ ...(dashData || {}), seguimientos_pendientes: pendCount || 0 })
      setMensual(monthData || [])
      setAlertas(alertData || [])
      setEfectividad(efc.data || null)
      setCumplimiento(cmp.data || null)
      setImpacto(imp.data || [])
      setKri(riesgo.data || [])
      setPacientesDes(pacDes.data || [])
      setCasosAhorro(ahorro.data || [])
    } catch (err) {
      console.error('Error loading dashboard:', err)
      setStats({
        total_casos: 0, activos: 0, en_tratamiento: 0, fallecidos: 0,
        oportunidad_promedio: 0, pct_adherencia: 0,
        costo_total_antes: 0, costo_total_despues: 0, diferencia_total: 0,
        seguimientos_pendientes: 0,
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-niebla-oscura" size={24} />
      </div>
    )
  }

  const s = stats || {}
  const tasaEjecucion = s.total_casos > 0
    ? ((s.en_tratamiento + (s.fallecidos || 0)) / s.total_casos * 100)
    : 0

  const prioridadColor = { alta: C.peligro, media: C.bronce, baja: C.pulso }

  const ef = efectividad || {}
  const cmp = cumplimiento || {}
  const ultImpacto = impacto.length ? impacto[impacto.length - 1] : {}
  const ahorroAcum = Number(ultImpacto.ahorro_acumulado || 0)

  const chartAxis = { fill: C.nieblaOscura, fontSize: 11 }
  const chartTooltip = { background: C.tinta2, border: '1px solid rgba(169,190,194,0.16)', borderRadius: 10 }

  return (
    <div className="space-y-6">
      {/* Header */}
      {/* Encabezado: el panel es el centro de análisis del comité */}
      <section className="relative overflow-hidden rounded-2xl px-6 py-7 md:px-8 md:py-8"
        style={{
          background: 'linear-gradient(120deg, color-mix(in srgb, var(--marca) 16%, var(--surface)) 0%, var(--surface) 70%)',
          border: '1px solid color-mix(in srgb, var(--marca) 22%, var(--line))',
        }}>
        <LogoInoos isotipo aria-hidden="true"
          className="pointer-events-none absolute -right-6 -bottom-10 h-56 w-auto opacity-[0.08]" />
        <div className="relative flex flex-col md:flex-row md:items-end md:justify-between gap-5">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: 'var(--marca)' }}>
              <Activity size={14} /> Comité oncológico · Centro de análisis
            </div>
            <div role="heading" aria-level={1} className="mt-3"
              style={{ fontFamily: 'var(--f-display)', fontWeight: 600, fontSize: 'clamp(32px, 4vw, 46px)', lineHeight: 1.05, letterSpacing: '-0.015em', color: 'var(--ink)' }}>
              Panel general
            </div>
            <ResumenAgenda agenda={agenda} navigate={navigate} />
          </div>
          <div className="flex flex-col items-start md:items-end gap-2 shrink-0">
            <span className="text-xs capitalize" style={{ color: 'var(--muted)' }}>
              {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
            <button onClick={fetchData}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all"
              style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
              <RefreshCw size={14} />
              Actualizar datos
            </button>
          </div>
        </div>
      </section>

      {/* Metric cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard label="Casos totales" value={s.total_casos || 0}
          sub={`${s.activos || 0} activos`} icon={Users} color={C.petroleoClaro} />
        <MetricCard label="Oportunidad" value={`${(s.oportunidad_promedio || 0).toFixed(1)}d`}
          sub="Solicitud → Comité" icon={Clock} color={C.niebla} />
        {/* Misma fórmula que "Impacto económico del comité" (vw_kpi_impacto_comite_mensual) */}
        <MetricCard label={ahorroAcum >= 0 ? 'Ahorro acumulado' : 'Sobrecosto acumulado'}
          value={formatCOP(Math.abs(ahorroAcum))} sub="Rechazos + ajustes de costo"
          icon={ahorroAcum >= 0 ? TrendingDown : TrendingUp} color={ahorroAcum >= 0 ? C.pulso : C.peligro} />
        <MetricCard label="Seguimientos pendientes" value={s.seguimientos_pendientes || 0}
          sub={`${s.fallecidos || 0} fallecidos`} icon={AlertTriangle} color={C.bronce} />
      </div>

      {/* ── MVP Calidad: efectividad real vs. estudio pivotal ── */}
      <Card>
        <Eyebrow icon={Target}>Efectividad real vs. estudio pivotal</Eyebrow>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ComparaBar label="PFS promedio" real={ef.pfs_real_prom} esperado={ef.pfs_esperado_prom} ratio={ef.ratio_pfs} unidad="m" />
          <ComparaBar label="OS promedio" real={ef.os_real_prom} esperado={ef.os_esperado_prom} ratio={ef.ratio_os} unidad="m" />
          <ComparaBar label="Respuesta objetiva (ORR)" real={ef.orr_real_pct} esperado={ef.orr_esperada_prom} unidad="%" />
        </div>
        <div className="flex justify-around mt-5 pt-4 border-t border-niebla/10">
          <Gauge value={Number(cmp.cumplimiento_seguimiento_pct || 0)} label="Cumplimiento seguimiento" color={C.petroleoClaro} />
          <Gauge value={Number(cmp.ejecucion_decision_pct || 0)} label="Ejecución de decisión" color={C.pulso} />
        </div>
      </Card>

      {/* ── MVP: desenlace por paciente ── */}
      <Card>
        <Eyebrow icon={Users}>Desenlace por paciente ({pacientesDes.length})</Eyebrow>
        {pacientesDes.length === 0 ? (
          <p className="text-sm text-niebla-oscura py-4 text-center">Sin pacientes en tratamiento con desenlace</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-mono text-niebla-oscura uppercase tracking-[0.15em]">
                  <th className="text-left font-medium py-2 pr-3">Paciente</th>
                  <th className="text-left font-medium py-2 pr-3">Protocolo</th>
                  <th className="text-center font-medium py-2 px-2">Resp.</th>
                  <th className="text-right font-medium py-2 px-2">PFS real/esp</th>
                  <th className="text-right font-medium py-2 px-2">OS real/esp</th>
                  <th className="text-right font-medium py-2 px-2">Costo real</th>
                  <th className="text-right font-medium py-2 pl-2">% PFS</th>
                </tr>
              </thead>
              <tbody>
                {pacientesDes.map(p => {
                  const ratio = (p.pfs_real_meses != null && p.pfs_esperado)
                    ? p.pfs_real_meses / p.pfs_esperado : null
                  const color = ratio == null ? C.nieblaOscura
                    : ratio >= 0.9 ? C.pulso : ratio >= 0.5 ? C.bronce : C.peligro
                  return (
                    <tr key={p.caso_id}
                        onClick={() => navigate(`/casos/${p.caso_id}`)}
                        title="Ver caso"
                        className="border-t border-niebla/10 cursor-pointer hover:bg-hueso/5 transition-colors">
                      <td className="py-2 pr-3 text-hueso">{p.paciente_nombre || `#${p.caso_id}`}</td>
                      <td className="py-2 pr-3 text-niebla truncate max-w-[160px]">{p.protocolo || '—'}</td>
                      <td className="py-2 px-2 text-center">
                        <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-hueso/5 text-niebla">
                          {p.mejor_respuesta || '—'}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right text-niebla">
                        {p.pfs_real_meses ?? '—'} / {p.pfs_esperado ?? '—'}m
                      </td>
                      <td className="py-2 px-2 text-right text-niebla">
                        {p.os_real_meses ?? '—'} / {p.os_esperado ?? '—'}m
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-niebla">
                        {formatCOP(p.costo_real_acumulado || 0)}
                      </td>
                      <td className="py-2 pl-2 text-right font-display font-semibold" style={{ color }}>
                        {ratio == null ? '—' : `${Math.round(ratio * 100)}%`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── MVP: impacto económico del comité ── */}
      {impacto.length > 0 && (
        <Card>
          <Eyebrow icon={ahorroAcum >= 0 ? TrendingDown : TrendingUp}>Impacto económico del comité</Eyebrow>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <MetricCard label={ahorroAcum >= 0 ? 'Ahorro acumulado' : 'Sobrecosto acumulado'}
              value={formatCOP(Math.abs(ahorroAcum))} sub="Rechazos + ajustes de costo"
              icon={ahorroAcum >= 0 ? TrendingDown : TrendingUp} color={ahorroAcum >= 0 ? C.pulso : C.peligro} />
            <MetricCard label="Total aprobado acumulado" value={formatCOP(Number(ultImpacto.total_aprobado_acumulado || 0))}
              sub="Presupuesto comprometido" icon={Shield} color={C.petroleoClaro} />
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={impacto}>
              <XAxis dataKey="mes" tick={chartAxis}
                tickFormatter={v => new Date(v).toLocaleDateString('es-CO', { month: 'short' })} />
              <YAxis tick={chartAxis} tickFormatter={v => `${(v / 1e6).toFixed(0)}M`} />
              <Tooltip contentStyle={chartTooltip} labelStyle={{ color: C.niebla }} formatter={v => formatCOP(v)} />
              <Area type="monotone" dataKey="ahorro_acumulado" name="Ahorro acumulado"
                stroke={C.pulso} fill={C.pulso} fillOpacity={0.15} />
            </AreaChart>
          </ResponsiveContainer>
          <button type="button" onClick={() => setVerDetalleAhorro(v => !v)}
            className="mt-3 flex items-center gap-1.5 text-sm text-pulso hover:underline">
            {verDetalleAhorro ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {verDetalleAhorro ? 'Ocultar detalle del acumulado' : 'Ver detalle del acumulado'}
          </button>
          {verDetalleAhorro && <AhorroDetalle casos={casosAhorro} onCaso={id => navigate(`/casos/${id}`)} />}
        </Card>
      )}

      {/* ── Impacto de las decisiones del comité (indicadores solicitados por el cliente) ── */}
      <ImpactoDecisiones casosValor={casosAhorro} desenlaces={pacientesDes}
        casosBase={casosBase} controles={controlesCV} />

      {/* ── MVP: worklist de riesgo costo/efectividad ── */}
      <Card>
        <Eyebrow icon={Stethoscope}>Riesgo — baja efectividad / toxicidad ({kri.length})</Eyebrow>
        <div className="space-y-2 max-h-56 overflow-y-auto">
          {kri.length === 0 ? (
            <p className="text-sm text-niebla-oscura py-4 text-center">Sin casos en riesgo</p>
          ) : (
            kri.map(k => (
              <div key={k.caso_id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-niebla/10"
                   style={{ background: 'rgba(243,239,231,0.02)' }}>
                <span className="text-sm font-mono text-niebla">#{k.caso_id}</span>
                <span className="text-sm flex-1 truncate text-hueso">{k.protocolo || 'Sin protocolo'}</span>
                <span className="text-xs text-niebla">
                  PFS {k.pfs_real_meses ?? '—'}/{k.pfs_esperado ?? '—'}m
                </span>
                {k.mejor_respuesta && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-hueso/5 text-niebla">{k.mejor_respuesta}</span>
                )}
                {k.baja_efectividad && (
                  <span className="text-[11px] px-2 py-0.5 rounded" style={{ background: 'rgba(217,83,79,0.15)', color: '#E8827E' }}>baja efectividad</span>
                )}
                {k.toxicidad_severa && (
                  <span className="text-[11px] px-2 py-0.5 rounded" style={{ background: 'rgba(185,131,47,0.15)', color: C.bronceClaro }}>toxicidad</span>
                )}
                <span className="text-xs text-niebla-oscura font-mono">{formatCOP(k.costo_real_acumulado || 0)}</span>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Gauges + Alerts */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <Eyebrow icon={Activity}>Indicadores clave</Eyebrow>
          <div className="flex justify-around">
            <Gauge value={s.pct_adherencia || 0} label="Adherencia protocolo" color={C.petroleoClaro} />
            <Gauge value={tasaEjecucion} label="Tasa ejecución" color={C.pulso} />
          </div>
        </Card>

        <Card className="col-span-2">
          <Eyebrow icon={AlertTriangle}>Alertas activas ({alertas.length})</Eyebrow>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {alertas.length === 0 ? (
              <p className="text-sm text-niebla-oscura py-4 text-center">Sin alertas activas</p>
            ) : (
              alertas.map(a => (
                <div key={a.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-niebla/10"
                     style={{ background: 'rgba(243,239,231,0.02)' }}>
                  <span className="w-2 h-2 rounded-full flex-shrink-0 animate-pulse-dot"
                    style={{ background: prioridadColor[a.prioridad] }} />
                  <span className="text-sm flex-1 text-hueso">{a.tipo}</span>
                  <span className="text-xs text-niebla font-mono">
                    {a.casos_comite?.pacientes?.nombre?.split(' ').map(n => n[0]).join('.') || '—'}
                  </span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-hueso/5 text-niebla">
                    {a.prioridad}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Monthly chart */}
      {mensual.length > 0 && (
        <Card>
          <Eyebrow>Casos por mes</Eyebrow>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={mensual}>
              <XAxis dataKey="mes" tick={chartAxis}
                tickFormatter={v => new Date(v).toLocaleDateString('es-CO', { month: 'short' })} />
              <YAxis tick={chartAxis} />
              <Tooltip contentStyle={chartTooltip} labelStyle={{ color: C.niebla }} />
              <Bar dataKey="aprobados" name="Aprobados" fill={C.petroleoClaro} radius={[4, 4, 0, 0]} />
              <Bar dataKey="rechazados" name="Rechazados" fill={C.peligro} radius={[4, 4, 0, 0]} opacity={0.5} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Estado distribution */}
      <Card>
        <Eyebrow>Distribución por estado</Eyebrow>
        <div className="flex gap-3 flex-wrap">
          {[
            { label: 'Activo', val: s.activos, color: C.petroleoClaro, icon: Activity },
            { label: 'En tratamiento', val: s.en_tratamiento, color: C.pulso, icon: Heart },
            { label: 'Progresión', val: s.en_progresion, color: C.bronce, icon: AlertTriangle },
            { label: 'Fallecido', val: s.fallecidos, color: C.peligro, icon: XCircle },
            { label: 'Perdido', val: s.perdidos, color: C.nieblaOscura, icon: Users },
            { label: 'Cancelado', val: s.cancelados, color: C.niebla, icon: XCircle },
          ].map((item, i) => (
            <div key={i} className="px-4 py-3 rounded-xl text-center min-w-[100px]"
                 style={{ background: `${item.color}14`, border: `1px solid ${item.color}33` }}>
              <div className="text-xl font-display font-bold" style={{ color: item.color }}>{item.val || 0}</div>
              <div className="text-[11px] text-niebla mt-0.5">{item.label}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
