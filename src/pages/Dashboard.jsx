import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatCOP } from '@/lib/utils'
import {
  AlertTriangle, Users, Clock, TrendingDown, Shield,
  Activity, Heart, XCircle, RefreshCw, Stethoscope, Target, TrendingUp
} from 'lucide-react'
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

// Metric card component
function MetricCard({ label, value, sub, icon: Icon, color = '#3b82f6' }) {
  return (
    <div className="rounded-xl p-5 border border-white/5" 
         style={{ background: 'rgba(255,255,255,0.03)', borderLeft: `3px solid ${color}` }}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">{label}</p>
          <p className="text-2xl font-bold mt-1 tracking-tight" style={{ color: '#f1f5f9' }}>{value}</p>
          {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
        </div>
        {Icon && <Icon size={20} style={{ color }} className="opacity-50" />}
      </div>
    </div>
  )
}

// Comparación real vs. estudio pivotal (barra de cumplimiento)
function ComparaBar({ label, real, esperado, ratio, unidad = '' }) {
  const r = real == null ? null : Number(real)
  const e = esperado == null ? null : Number(esperado)
  const rr = ratio != null ? Number(ratio) : (r != null && e ? r / e : null)
  const color = rr == null ? '#64748b' : rr >= 0.9 ? '#22c55e' : rr >= 0.5 ? '#f59e0b' : '#ef4444'
  const pct = rr == null ? 0 : Math.min(100, Math.max(0, rr * 100))
  return (
    <div className="rounded-lg p-4 border border-white/5" style={{ background: 'rgba(255,255,255,0.02)' }}>
      <p className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold mb-2">{label}</p>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold" style={{ color: '#f1f5f9' }}>
          {r == null ? '—' : r}{r == null ? '' : unidad}
        </span>
        <span className="text-xs text-gray-500">vs {e == null ? '—' : `${e}${unidad}`} estudio</span>
      </div>
      <div className="h-1.5 rounded-full mt-3 overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div className="h-full rounded-full"
          style={{ width: `${pct}%`, background: color, transition: 'width 1s ease' }} />
      </div>
      <p className="text-[11px] mt-1.5 font-semibold" style={{ color }}>
        {rr == null ? 'Sin datos aún' : `${Math.round(rr * 100)}% del estudio`}
      </p>
    </div>
  )
}

// Gauge component
function Gauge({ value, label, color, size = 100 }) {
  const r = (size - 14) / 2
  const circ = Math.PI * r
  const offset = circ - (value / 100) * circ
  return (
    <div className="text-center">
      <svg width={size} height={size / 2 + 18} viewBox={`0 0 ${size} ${size / 2 + 18}`}>
        <path d={`M 7 ${size / 2 + 7} A ${r} ${r} 0 0 1 ${size - 7} ${size / 2 + 7}`}
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={9} strokeLinecap="round" />
        <path d={`M 7 ${size / 2 + 7} A ${r} ${r} 0 0 1 ${size - 7} ${size / 2 + 7}`}
          fill="none" stroke={color} strokeWidth={9} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s ease' }} />
        <text x={size / 2} y={size / 2 + 2} textAnchor="middle" fill="#e2e8f0"
          fontSize={20} fontWeight={700} fontFamily="'DM Sans', sans-serif">
          {Math.round(value)}%
        </text>
      </svg>
      <div className="text-[11px] text-gray-500 -mt-1 font-medium">{label}</div>
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
      // Fetch dashboard stats
      const { data: dashData } = await supabase.from('vw_dashboard_general').select('*').single()
      
      // Fetch monthly KPIs
      const { data: monthData } = await supabase.from('vw_kpi_mensual').select('*').limit(6)
      
      // Fetch active alerts
      const { data: alertData } = await supabase.from('alertas')
        .select('*, casos_comite(paciente_id, pacientes(nombre))')
        .eq('estado', 'activa')
        .order('created_at', { ascending: false })
        .limit(10)
      
      // Fetch pending follow-ups count
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

      setStats({
        ...(dashData || {}),
        seguimientos_pendientes: pendCount || 0,
      })
      setMensual(monthData || [])
      setAlertas(alertData || [])
      setEfectividad(efc.data || null)
      setCumplimiento(cmp.data || null)
      setImpacto(imp.data || [])
      setKri(riesgo.data || [])
      setPacientesDes(pacDes.data || [])
    } catch (err) {
      console.error('Error loading dashboard:', err)
      // Fallback con datos de demo si no hay conexión
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
        <RefreshCw className="animate-spin text-gray-500" size={24} />
      </div>
    )
  }

  const s = stats || {}
  const tasaEjecucion = s.total_casos > 0 
    ? ((s.en_tratamiento + (s.fallecidos || 0)) / s.total_casos * 100) 
    : 0

  const prioridadColor = { alta: '#ef4444', media: '#f59e0b', baja: '#22c55e' }

  // MVP calidad — accesores seguros ante vistas vacías
  const ef = efectividad || {}
  const cmp = cumplimiento || {}
  const ultImpacto = impacto.length ? impacto[impacto.length - 1] : {}
  const ahorroAcum = Number(ultImpacto.ahorro_acumulado || 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Panel General</h1>
          <p className="text-sm text-gray-500">Vista integral del comité oncológico</p>
        </div>
        <button onClick={fetchData}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 
                     hover:text-gray-200 border border-white/10 hover:border-white/20 transition-all">
          <RefreshCw size={14} />
          Actualizar
        </button>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard label="Casos totales" value={s.total_casos || 0}
          sub={`${s.activos || 0} activos`} icon={Users} color="#3b82f6" />
        <MetricCard label="Oportunidad" value={`${(s.oportunidad_promedio || 0).toFixed(1)}d`}
          sub="Solicitud → Comité" icon={Clock} color="#06b6d4" />
        <MetricCard label="Ahorro acumulado" value={formatCOP(s.diferencia_total || 0)}
          sub="Diferencia pre/post" icon={TrendingDown} color="#22c55e" />
        <MetricCard label="Seguimientos pendientes" value={s.seguimientos_pendientes || 0}
          sub={`${s.fallecidos || 0} fallecidos`} icon={AlertTriangle} color="#f59e0b" />
      </div>

      {/* ── MVP Calidad: efectividad real vs. estudio pivotal ── */}
      <div className="rounded-xl p-5 border border-white/5" style={{ background: 'rgba(255,255,255,0.03)' }}>
        <div className="flex items-center gap-2 mb-4">
          <Target size={14} className="text-gray-500" />
          <h3 className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">
            Efectividad real vs. estudio pivotal
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ComparaBar label="PFS promedio" real={ef.pfs_real_prom} esperado={ef.pfs_esperado_prom} ratio={ef.ratio_pfs} unidad="m" />
          <ComparaBar label="OS promedio" real={ef.os_real_prom} esperado={ef.os_esperado_prom} ratio={ef.ratio_os} unidad="m" />
          <ComparaBar label="Respuesta objetiva (ORR)" real={ef.orr_real_pct} esperado={ef.orr_esperada_prom} unidad="%" />
        </div>
        <div className="flex justify-around mt-5 pt-4 border-t border-white/5">
          <Gauge value={Number(cmp.cumplimiento_seguimiento_pct || 0)} label="Cumplimiento seguimiento" color="#06b6d4" />
          <Gauge value={Number(cmp.ejecucion_decision_pct || 0)} label="Ejecución de decisión" color="#22c55e" />
        </div>
      </div>

      {/* ── MVP: desenlace por paciente ── */}
      <div className="rounded-xl p-5 border border-white/5" style={{ background: 'rgba(255,255,255,0.03)' }}>
        <div className="flex items-center gap-2 mb-4">
          <Users size={14} className="text-gray-500" />
          <h3 className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">
            Desenlace por paciente ({pacientesDes.length})
          </h3>
        </div>
        {pacientesDes.length === 0 ? (
          <p className="text-sm text-gray-600 py-4 text-center">Sin pacientes en tratamiento con desenlace</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] text-gray-500 uppercase tracking-wider">
                  <th className="text-left font-semibold py-2 pr-3">Paciente</th>
                  <th className="text-left font-semibold py-2 pr-3">Protocolo</th>
                  <th className="text-center font-semibold py-2 px-2">Resp.</th>
                  <th className="text-right font-semibold py-2 px-2">PFS real/esp</th>
                  <th className="text-right font-semibold py-2 px-2">OS real/esp</th>
                  <th className="text-right font-semibold py-2 px-2">Costo real</th>
                  <th className="text-right font-semibold py-2 pl-2">% PFS</th>
                </tr>
              </thead>
              <tbody>
                {pacientesDes.map(p => {
                  const ratio = (p.pfs_real_meses != null && p.pfs_esperado)
                    ? p.pfs_real_meses / p.pfs_esperado : null
                  const color = ratio == null ? '#64748b'
                    : ratio >= 0.9 ? '#22c55e' : ratio >= 0.5 ? '#f59e0b' : '#ef4444'
                  return (
                    <tr key={p.caso_id}
                        onClick={() => navigate(`/casos/${p.caso_id}`)}
                        title="Ver caso"
                        className="border-t border-white/5 cursor-pointer hover:bg-white/5 transition-colors">
                      <td className="py-2 pr-3 text-gray-200">{p.paciente_nombre || `#${p.caso_id}`}</td>
                      <td className="py-2 pr-3 text-gray-500 truncate max-w-[160px]">{p.protocolo || '—'}</td>
                      <td className="py-2 px-2 text-center">
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-white/5 text-gray-300">
                          {p.mejor_respuesta || '—'}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right text-gray-300">
                        {p.pfs_real_meses ?? '—'} / {p.pfs_esperado ?? '—'}m
                      </td>
                      <td className="py-2 px-2 text-right text-gray-300">
                        {p.os_real_meses ?? '—'} / {p.os_esperado ?? '—'}m
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-gray-400">
                        {formatCOP(p.costo_real_acumulado || 0)}
                      </td>
                      <td className="py-2 pl-2 text-right font-semibold" style={{ color }}>
                        {ratio == null ? '—' : `${Math.round(ratio * 100)}%`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── MVP: impacto económico del comité ── */}
      {impacto.length > 0 && (
        <div className="rounded-xl p-5 border border-white/5" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <div className="flex items-center gap-2 mb-4">
            {ahorroAcum >= 0
              ? <TrendingDown size={14} className="text-gray-500" />
              : <TrendingUp size={14} className="text-gray-500" />}
            <h3 className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">
              Impacto económico del comité
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <MetricCard label={ahorroAcum >= 0 ? 'Ahorro acumulado' : 'Sobrecosto acumulado'}
              value={formatCOP(Math.abs(ahorroAcum))} sub="Rechazos + ajustes de costo"
              icon={ahorroAcum >= 0 ? TrendingDown : TrendingUp} color={ahorroAcum >= 0 ? '#22c55e' : '#ef4444'} />
            <MetricCard label="Total aprobado acumulado" value={formatCOP(Number(ultImpacto.total_aprobado_acumulado || 0))}
              sub="Presupuesto comprometido" icon={Shield} color="#3b82f6" />
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={impacto}>
              <XAxis dataKey="mes" tick={{ fill: '#64748b', fontSize: 11 }}
                tickFormatter={v => new Date(v).toLocaleDateString('es-CO', { month: 'short' })} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={v => `${(v / 1e6).toFixed(0)}M`} />
              <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                labelStyle={{ color: '#94a3b8' }} formatter={v => formatCOP(v)} />
              <Area type="monotone" dataKey="ahorro_acumulado" name="Ahorro acumulado"
                stroke="#22c55e" fill="#22c55e" fillOpacity={0.15} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── MVP: worklist de riesgo costo/efectividad ── */}
      <div className="rounded-xl p-5 border border-white/5" style={{ background: 'rgba(255,255,255,0.03)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Stethoscope size={14} className="text-gray-500" />
          <h3 className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">
            Riesgo — baja efectividad / toxicidad ({kri.length})
          </h3>
        </div>
        <div className="space-y-2 max-h-56 overflow-y-auto">
          {kri.length === 0 ? (
            <p className="text-sm text-gray-600 py-4 text-center">Sin casos en riesgo</p>
          ) : (
            kri.map(k => (
              <div key={k.caso_id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-white/5"
                   style={{ background: 'rgba(255,255,255,0.02)' }}>
                <span className="text-sm font-mono text-gray-400">#{k.caso_id}</span>
                <span className="text-sm flex-1 truncate">{k.protocolo || 'Sin protocolo'}</span>
                <span className="text-xs text-gray-500">
                  PFS {k.pfs_real_meses ?? '—'}/{k.pfs_esperado ?? '—'}m
                </span>
                {k.mejor_respuesta && (
                  <span className="text-[11px] px-2 py-0.5 rounded bg-white/5 text-gray-400">{k.mejor_respuesta}</span>
                )}
                {k.baja_efectividad && (
                  <span className="text-[11px] px-2 py-0.5 rounded" style={{ background: '#ef444420', color: '#f87171' }}>baja efectividad</span>
                )}
                {k.toxicidad_severa && (
                  <span className="text-[11px] px-2 py-0.5 rounded" style={{ background: '#f59e0b20', color: '#fbbf24' }}>toxicidad</span>
                )}
                <span className="text-xs text-gray-500 font-mono">{formatCOP(k.costo_real_acumulado || 0)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Gauges + Alerts */}
      <div className="grid grid-cols-3 gap-4">
        {/* Gauges */}
        <div className="rounded-xl p-5 border border-white/5" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <h3 className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold mb-4">
            Indicadores clave
          </h3>
          <div className="flex justify-around">
            <Gauge value={s.pct_adherencia || 0} label="Adherencia protocolo" color="#3b82f6" />
            <Gauge value={tasaEjecucion} label="Tasa ejecución" color="#22c55e" />
          </div>
        </div>

        {/* Alerts */}
        <div className="col-span-2 rounded-xl p-5 border border-white/5" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <h3 className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold mb-3">
            Alertas activas ({alertas.length})
          </h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {alertas.length === 0 ? (
              <p className="text-sm text-gray-600 py-4 text-center">Sin alertas activas</p>
            ) : (
              alertas.map(a => (
                <div key={a.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-white/5"
                     style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <span className="w-2 h-2 rounded-full flex-shrink-0 animate-pulse-dot"
                    style={{ background: prioridadColor[a.prioridad] }} />
                  <span className="text-sm flex-1">{a.tipo}</span>
                  <span className="text-xs text-gray-500 font-mono">
                    {a.casos_comite?.pacientes?.nombre?.split(' ').map(n => n[0]).join('.') || '—'}
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded bg-white/5 text-gray-500">
                    {a.prioridad}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Monthly chart */}
      {mensual.length > 0 && (
        <div className="rounded-xl p-5 border border-white/5" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <h3 className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold mb-4">
            Casos por mes
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={mensual}>
              <XAxis dataKey="mes" tick={{ fill: '#64748b', fontSize: 11 }}
                tickFormatter={v => new Date(v).toLocaleDateString('es-CO', { month: 'short' })} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
              <Tooltip 
                contentStyle={{ background: '#1f2937', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                labelStyle={{ color: '#94a3b8' }} />
              <Bar dataKey="aprobados" name="Aprobados" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="rechazados" name="Rechazados" fill="#ef4444" radius={[4, 4, 0, 0]} opacity={0.4} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Estado distribution */}
      <div className="rounded-xl p-5 border border-white/5" style={{ background: 'rgba(255,255,255,0.03)' }}>
        <h3 className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold mb-4">
          Distribución por estado
        </h3>
        <div className="flex gap-3 flex-wrap">
          {[
            { label: 'Activo', val: s.activos, color: '#3b82f6', icon: Activity },
            { label: 'En tratamiento', val: s.en_tratamiento, color: '#06b6d4', icon: Heart },
            { label: 'Progresión', val: s.en_progresion, color: '#f59e0b', icon: AlertTriangle },
            { label: 'Fallecido', val: s.fallecidos, color: '#ef4444', icon: XCircle },
            { label: 'Perdido', val: s.perdidos, color: '#7c3aed', icon: Users },
            { label: 'Cancelado', val: s.cancelados, color: '#94a3b8', icon: XCircle },
          ].map((item, i) => (
            <div key={i} className="px-4 py-3 rounded-lg text-center min-w-[100px]"
                 style={{ 
                   background: `${item.color}08`, 
                   border: `1px solid ${item.color}20` 
                 }}>
              <div className="text-xl font-bold" style={{ color: item.color }}>{item.val || 0}</div>
              <div className="text-[11px] text-gray-500 mt-0.5">{item.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
