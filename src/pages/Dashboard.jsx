import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { formatCOP } from '@/lib/utils'
import { 
  AlertTriangle, Users, Clock, TrendingDown, Shield, 
  Activity, Heart, XCircle, RefreshCw 
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

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
  const [stats, setStats] = useState(null)
  const [mensual, setMensual] = useState([])
  const [alertas, setAlertas] = useState([])
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

      setStats({
        ...(dashData || {}),
        seguimientos_pendientes: pendCount || 0,
      })
      setMensual(monthData || [])
      setAlertas(alertData || [])
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
