import { useState, useEffect } from 'react'
import { supabase, formatDate } from '../lib/supabase'
import toast from 'react-hot-toast'
import { ClipboardCheck, AlertTriangle, CheckCircle, Clock, XCircle, RefreshCw } from 'lucide-react'

const ESTADOS_CLINICOS = [
  { value: 'estable', label: 'Estable', color: '#22c55e' },
  { value: 'respuesta_parcial', label: 'Respuesta parcial', color: '#3b82f6' },
  { value: 'respuesta_completa', label: 'Respuesta completa', color: '#06b6d4' },
  { value: 'progresion', label: 'Progresión', color: '#f59e0b' },
  { value: 'fallecido', label: 'Fallecido', color: '#ef4444' },
  { value: 'perdido', label: 'Perdido', color: '#7c3aed' },
]

const estadoSeguimientoIcon = {
  pendiente: Clock,
  vencido: AlertTriangle,
  realizado: CheckCircle,
  no_aplica: XCircle,
}

const estadoSeguimientoColor = {
  pendiente: '#f59e0b',
  vencido: '#ef4444',
  realizado: '#22c55e',
  no_aplica: '#94a3b8',
}

export default function Seguimientos() {
  const [seguimientos, setSeguimientos] = useState([])
  const [gestores, setGestores] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('pendientes') // pendientes | todos | alertas
  const [editando, setEditando] = useState(null)
  const [formData, setFormData] = useState({})

  const fetchData = async () => {
    setLoading(true)
    
    // Marcar vencidos automáticamente
    try { await supabase.rpc('marcar_seguimientos_vencidos') } catch(e) {}

    let query = supabase.from('seguimientos')
      .select(`
        *,
        casos_comite(
          id, decision, molecula_aprobada, estado, fecha_presentacion,
          pacientes(nombre, documento),
          medicos(nombre),
          diagnosticos(cie10, descripcion, estadio)
        ),
        gestores(nombre)
      `)
      .order('fecha_programada', { ascending: true })
      .limit(200)

    if (tab === 'pendientes') {
      query = query.in('estado', ['pendiente', 'vencido'])
    }

    const { data, error } = await query
    if (error) console.error(error)
    setSeguimientos(data || [])

    const { data: gestData } = await supabase.from('gestores').select('*').eq('activo', true)
    setGestores(gestData || [])

    setLoading(false)
  }

  useEffect(() => { fetchData() }, [tab])

  const realizarSeguimiento = async (segId) => {
    const f = formData[segId]
    if (!f) return

    try {
      // Actualizar seguimiento
      const { error: segErr } = await supabase.from('seguimientos')
        .update({
          estado: 'realizado',
          fecha_realizada: new Date().toISOString().split('T')[0],
          gestor_id: f.gestor_id || null,
          decision_ejecutada: f.decision_ejecutada,
          motivo_no_ejecucion: f.motivo_no_ejecucion || null,
          estado_clinico: f.estado_clinico || null,
          fecha_inicio_tratamiento: f.fecha_inicio_tratamiento || null,
          observaciones: f.observaciones || null,
        })
        .eq('id', segId)

      if (segErr) throw segErr

      // Si hay estado clínico, actualizar caso
      const seg = seguimientos.find(s => s.id === segId)
      if (f.estado_clinico && seg?.caso_id) {
        const estadoMap = {
          'respuesta_parcial': 'en_tratamiento',
          'respuesta_completa': 'completado',
          'estable': 'en_tratamiento',
          'progresion': 'progresion',
          'fallecido': 'fallecido',
          'perdido': 'perdido',
        }
        const nuevoEstado = estadoMap[f.estado_clinico]
        if (nuevoEstado) {
          await supabase.from('casos_comite')
            .update({ estado: nuevoEstado })
            .eq('id', seg.caso_id)
        }
      }

      // Resolver alertas asociadas
      if (seg?.caso_id) {
        await supabase.from('alertas')
          .update({ estado: 'resuelta', resuelta_at: new Date().toISOString() })
          .eq('caso_id', seg.caso_id)
          .eq('tipo', 'seguimiento_vencido')
          .eq('estado', 'activa')
      }

      toast.success('Seguimiento registrado')
      setEditando(null)
      fetchData()
    } catch (err) {
      toast.error(`Error: ${err.message}`)
    }
  }

  // Contadores
  const pendientes = seguimientos.filter(s => s.estado === 'pendiente').length
  const vencidos = seguimientos.filter(s => s.estado === 'vencido').length
  const hoy = seguimientos.filter(s => 
    s.estado === 'pendiente' && s.fecha_programada === new Date().toISOString().split('T')[0]
  ).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Seguimientos</h1>
        <p className="text-sm text-gray-500">Gestión y registro de seguimientos post-comité</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Vencidos', val: vencidos, color: '#ef4444', icon: AlertTriangle },
          { label: 'Para hoy', val: hoy, color: '#f59e0b', icon: Clock },
          { label: 'Pendientes', val: pendientes, color: '#3b82f6', icon: ClipboardCheck },
          { label: 'Total', val: seguimientos.length, color: '#94a3b8', icon: RefreshCw },
        ].map((item, i) => (
          <div key={i} className="rounded-xl p-4 border border-white/5"
               style={{ background: 'rgba(255,255,255,0.03)', borderLeft: `3px solid ${item.color}` }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">{item.label}</p>
                <p className="text-2xl font-bold mt-1" style={{ color: item.color }}>{item.val}</p>
              </div>
              <item.icon size={18} style={{ color: item.color }} className="opacity-40" />
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {[
          { key: 'pendientes', label: `Pendientes (${pendientes + vencidos})` },
          { key: 'todos', label: 'Todos' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.key 
                ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30' 
                : 'text-gray-500 border border-white/5 hover:border-white/10'
            }`}>
            {t.label}
          </button>
        ))}
        <button onClick={fetchData} className="ml-auto px-3 py-2 rounded-lg text-gray-500 hover:text-gray-300 border border-white/5">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/5 overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)' }}>
        {loading ? (
          <div className="p-8 text-center text-gray-500">Cargando...</div>
        ) : seguimientos.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Sin seguimientos {tab === 'pendientes' ? 'pendientes' : ''}</div>
        ) : (
          <div className="divide-y divide-white/[0.03]">
            {seguimientos.map(s => {
              const Icon = estadoSeguimientoIcon[s.estado] || Clock
              const color = estadoSeguimientoColor[s.estado]
              const pac = s.casos_comite?.pacientes
              const isExpanded = editando === s.id
              const diasVencido = s.estado === 'vencido' 
                ? Math.floor((new Date() - new Date(s.fecha_programada)) / 86400000)
                : 0

              return (
                <div key={s.id}>
                  {/* Row */}
                  <div className="flex items-center gap-4 px-4 py-3 hover:bg-white/[0.02] cursor-pointer"
                    onClick={() => {
                      if (s.estado === 'realizado') return
                      setEditando(isExpanded ? null : s.id)
                      if (!isExpanded) {
                        setFormData({ ...formData, [s.id]: {
                          gestor_id: s.gestor_id || '',
                          decision_ejecutada: true,
                          estado_clinico: '',
                          observaciones: '',
                          fecha_inicio_tratamiento: '',
                          motivo_no_ejecucion: '',
                        }})
                      }
                    }}>
                    <Icon size={18} style={{ color }} className="flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{pac?.nombre || '—'}</span>
                        <span className="text-xs text-gray-500 font-mono">{pac?.documento}</span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {s.casos_comite?.diagnosticos?.cie10} · {s.casos_comite?.molecula_aprobada || 'Sin molécula'}
                      </div>
                    </div>
                    <div className="text-center flex-shrink-0">
                      <div className="text-xs font-semibold px-2.5 py-1 rounded"
                        style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}>
                        {s.tipo.replace('_', ' ').toUpperCase()}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 w-24">
                      <div className="text-sm font-mono text-gray-400">{formatDate(s.fecha_programada)}</div>
                      {diasVencido > 0 && (
                        <div className="text-xs text-red-400 font-semibold">{diasVencido}d vencido</div>
                      )}
                    </div>
                    <div className="flex-shrink-0 w-20 text-right">
                      <span className="text-[11px] px-2 py-0.5 rounded"
                        style={{ background: `${color}10`, color }}>
                        {s.estado}
                      </span>
                    </div>
                  </div>

                  {/* Expanded form */}
                  {isExpanded && s.estado !== 'realizado' && (
                    <div className="px-4 py-4 border-t border-white/5" 
                         style={{ background: 'rgba(59,130,246,0.03)' }}>
                      <div className="grid grid-cols-3 gap-4 max-w-2xl">
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Gestor</label>
                          <select value={formData[s.id]?.gestor_id || ''}
                            onChange={e => setFormData({...formData, [s.id]: {...formData[s.id], gestor_id: e.target.value}})}>
                            <option value="">Seleccionar...</option>
                            {gestores.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">¿Decisión ejecutada?</label>
                          <select value={formData[s.id]?.decision_ejecutada ?? true}
                            onChange={e => setFormData({...formData, [s.id]: {
                              ...formData[s.id], decision_ejecutada: e.target.value === 'true'
                            }})}>
                            <option value="true">Sí</option>
                            <option value="false">No</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Estado clínico</label>
                          <select value={formData[s.id]?.estado_clinico || ''}
                            onChange={e => setFormData({...formData, [s.id]: {...formData[s.id], estado_clinico: e.target.value}})}>
                            <option value="">Seleccionar...</option>
                            {ESTADOS_CLINICOS.map(ec => 
                              <option key={ec.value} value={ec.value}>{ec.label}</option>
                            )}
                          </select>
                        </div>

                        {formData[s.id]?.decision_ejecutada === false && (
                          <div className="col-span-3">
                            <label className="block text-xs text-gray-400 mb-1">Motivo de no ejecución</label>
                            <input value={formData[s.id]?.motivo_no_ejecucion || ''} 
                              placeholder="Barrera administrativa, clínica, del paciente..."
                              onChange={e => setFormData({...formData, [s.id]: {...formData[s.id], motivo_no_ejecucion: e.target.value}})} />
                          </div>
                        )}

                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Fecha inicio tratamiento</label>
                          <input type="date" value={formData[s.id]?.fecha_inicio_tratamiento || ''}
                            onChange={e => setFormData({...formData, [s.id]: {...formData[s.id], fecha_inicio_tratamiento: e.target.value}})} />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-400 mb-1">Observaciones</label>
                          <input value={formData[s.id]?.observaciones || ''} placeholder="Notas del seguimiento..."
                            onChange={e => setFormData({...formData, [s.id]: {...formData[s.id], observaciones: e.target.value}})} />
                        </div>

                        <div className="col-span-3 flex gap-2 mt-2">
                          <button onClick={() => realizarSeguimiento(s.id)}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white bg-green-600 hover:bg-green-700 transition-colors">
                            <CheckCircle size={14} /> Registrar seguimiento
                          </button>
                          <button onClick={() => setEditando(null)}
                            className="px-4 py-2 rounded-lg text-sm text-gray-400 border border-white/10 hover:border-white/20">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Show completed info */}
                  {isExpanded && s.estado === 'realizado' && (
                    <div className="px-4 py-3 border-t border-white/5 text-sm text-gray-400"
                         style={{ background: 'rgba(34,197,94,0.03)' }}>
                      <div className="grid grid-cols-3 gap-3">
                        <p>Realizado: <span className="text-gray-300">{formatDate(s.fecha_realizada)}</span></p>
                        <p>Ejecutada: <span className="text-gray-300">{s.decision_ejecutada ? 'Sí' : 'No'}</span></p>
                        <p>Estado clínico: <span className="text-gray-300">{s.estado_clinico || '—'}</span></p>
                        {s.observaciones && <p className="col-span-3">Obs: <span className="text-gray-300">{s.observaciones}</span></p>}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
