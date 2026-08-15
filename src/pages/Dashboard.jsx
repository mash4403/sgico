import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatCOP } from '@/lib/utils'
import {
  AlertTriangle, Users, Clock, TrendingDown, Shield,
  Activity, Heart, XCircle, RefreshCw, Stethoscope, Target, TrendingUp
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
  const [loading, setLoading] = useState(true)

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
      const [efc, cmp, imp, riesgo, pacDes] = await Promise.all([
        supabase.from('vw_kpi_efectividad').select('*').maybeSingle(),
        supabase.from('vw_kpi_cumplimiento').select('*').maybeSingle(),
        supabase.from('vw_kpi_impacto_comite_mensual').select('*').limit(12),
        supabase.from('vw_kri_costo_efectividad').select('*').limit(10),
        supabase.from('vw_desenlace_caso')
          .select('caso_id, paciente_nombre, protocolo, decision, mejor_respuesta, respondedor, pfs_real_meses, pfs_esperado, os_real_meses, os_esperado, costo_real_acumulado')
          .in('decision', ['aprobado', 'modificado'])
          .order('caso_id'),
      ])

      setStats({ ...(dashData || {}), seguimientos_pendientes: pendCount || 0 })
      setMensual(monthData || [])
      setAlertas(alertData || [])
      setEfectividad(efc.data || null)
      setCumplimiento(cmp.data || null)
      setImpacto(imp.data || [])
      setKri(riesgo.data || [])
      setPacientesDes(pacDes.data || [])
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
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow mb-1">Comité oncológico</p>
          <h1 className="text-xl font-display font-bold tracking-tight text-hueso">Panel General</h1>
        </div>
        <button onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 rounded-full text-sm text-niebla
                     hover:text-hueso border border-niebla/20 hover:border-pulso/50 transition-all">
          <RefreshCw size={14} />
          Actualizar
        </button>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard label="Casos totales" value={s.total_casos || 0}
          sub={`${s.activos || 0} activos`} icon={Users} color={C.petroleoClaro} />
        <MetricCard label="Oportunidad" value={`${(s.oportunidad_promedio || 0).toFixed(1)}d`}
          sub="Solicitud → Comité" icon={Clock} color={C.niebla} />
        <MetricCard label="Ahorro acumulado" value={formatCOP(s.diferencia_total || 0)}
          sub="Diferencia pre/post" icon={TrendingDown} color={C.pulso} />
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
        </Card>
      )}

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
