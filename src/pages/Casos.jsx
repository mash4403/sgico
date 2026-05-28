import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatCOP, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { Search, Filter, ChevronDown, ChevronUp, Check, X, Eye } from 'lucide-react'

const DECISIONES = ['pendiente', 'aprobado', 'rechazado', 'modificado', 'diferido', 'pendiente_info']
const ESTADOS = ['activo', 'en_tratamiento', 'completado', 'progresion', 'cancelado', 'fallecido', 'perdido']

const decisionColor = {
  pendiente: '#f59e0b', aprobado: '#22c55e', rechazado: '#ef4444',
  modificado: '#3b82f6', diferido: '#94a3b8', pendiente_info: '#f59e0b',
}

export default function Casos() {
  const [casos, setCasos] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterEstado, setFilterEstado] = useState('')
  const [filterDecision, setFilterDecision] = useState('')
  const [expanded, setExpanded] = useState(null) // ID del caso expandido
  const [editDecision, setEditDecision] = useState({})

  const fetchCasos = async () => {
    setLoading(true)
    let query = supabase.from('casos_comite')
      .select(`
        *,
        pacientes(nombre, documento, tipo_documento),
        medicos(nombre),
        sedes(nombre),
        protocolos(nombre, estudio_pivotal),
        diagnosticos(cie10, descripcion, estadio)
      `)
      .order('fecha_solicitud', { ascending: false })
      .limit(100)

    if (filterEstado) query = query.eq('estado', filterEstado)
    if (filterDecision) query = query.eq('decision', filterDecision)

    const { data, error } = await query
    if (error) {
      console.error(error)
      toast.error('Error cargando casos')
    }
    setCasos(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchCasos() }, [filterEstado, filterDecision])

  const filteredCasos = casos.filter(c => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      c.pacientes?.nombre?.toLowerCase().includes(s) ||
      c.pacientes?.documento?.includes(s) ||
      c.molecula_propuesta?.toLowerCase().includes(s) ||
      c.diagnosticos?.descripcion?.toLowerCase().includes(s)
    )
  })

  const guardarDecision = async (casoId) => {
    const d = editDecision[casoId]
    if (!d) return
    const today = new Date().toISOString().split('T')[0]
    if (d.fecha_presentacion && d.fecha_presentacion > today) {
      toast.error('La fecha de presentación no puede ser futura')
      return
    }
    const costoAprobado = parseFloat(d.costo_aprobado) || 0
    const { error } = await supabase.from('casos_comite')
      .update({
        decision: d.decision,
        molecula_aprobada: d.molecula_aprobada,
        justificacion_decision: d.justificacion_decision,
        adherente_protocolo: d.adherente_protocolo,
        costo_molecula_aprobada: costoAprobado,
        costo_post: costoAprobado,
        fecha_presentacion: d.fecha_presentacion || today,
      })
      .eq('id', casoId)
    
    if (error) {
      toast.error('Error guardando decisión')
    } else {
      toast.success('Decisión registrada')
      setExpanded(null)
      fetchCasos()
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Casos del comité</h1>
        <p className="text-sm text-gray-500">Gestión de casos y registro de decisiones</p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, documento, molécula..."
            className="pl-9" />
        </div>
        <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)}
          className="w-40">
          <option value="">Todo estado</option>
          {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <select value={filterDecision} onChange={e => setFilterDecision(e.target.value)}
          className="w-40">
          <option value="">Toda decisión</option>
          {DECISIONES.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {/* Cases table */}
      <div className="rounded-xl border border-white/5 overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)' }}>
        {loading ? (
          <div className="p-8 text-center text-gray-500">Cargando...</div>
        ) : filteredCasos.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No hay casos registrados</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                {['Fecha', 'Paciente', 'Dx', 'Molécula propuesta', 'Decisión', 'Estado', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[11px] text-gray-500 font-semibold uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredCasos.map(c => (
                <React.Fragment key={c.id}>
                  <tr className="border-b border-white/[0.03] hover:bg-white/[0.02] cursor-pointer"
                    onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                    <td className="px-4 py-3 text-sm text-gray-400 font-mono">{formatDate(c.fecha_solicitud)}</td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium">{c.pacientes?.nombre || '—'}</div>
                      <div className="text-xs text-gray-500 font-mono">{c.pacientes?.documento}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {c.diagnosticos?.cie10} — {c.diagnosticos?.estadio}
                    </td>
                    <td className="px-4 py-3 text-sm">{c.molecula_propuesta || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-semibold px-2.5 py-1 rounded"
                        style={{ 
                          background: `${decisionColor[c.decision]}15`,
                          color: decisionColor[c.decision],
                          border: `1px solid ${decisionColor[c.decision]}30`
                        }}>
                        {c.decision?.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{c.estado}</td>
                    <td className="px-4 py-3 text-gray-500">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/casos/${c.id}`}
                          onClick={e => e.stopPropagation()}
                          title="Ver detalle"
                          className="p-1 rounded hover:bg-white/10 hover:text-gray-200 transition-colors"
                        >
                          <Eye size={16} />
                        </Link>
                        {expanded === c.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </td>
                  </tr>

                  {/* Expanded: Decision form */}
                  {expanded === c.id && (
                    <tr key={`${c.id}-detail`}>
                      <td colSpan={7} className="px-4 py-4 border-b border-white/5" 
                          style={{ background: 'rgba(59,130,246,0.03)' }}>
                        <div className="grid grid-cols-3 gap-4 max-w-2xl">
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Decisión</label>
                            <select 
                              value={editDecision[c.id]?.decision || c.decision}
                              onChange={e => setEditDecision({
                                ...editDecision, 
                                [c.id]: {...(editDecision[c.id] || {}), decision: e.target.value}
                              })}>
                              {DECISIONES.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Fecha presentación</label>
                            <input type="date"
                              max={new Date().toISOString().split('T')[0]}
                              value={editDecision[c.id]?.fecha_presentacion || c.fecha_presentacion || ''}
                              onChange={e => setEditDecision({
                                ...editDecision,
                                [c.id]: {...(editDecision[c.id] || {}), fecha_presentacion: e.target.value}
                              })} />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Molécula aprobada</label>
                            <input 
                              value={editDecision[c.id]?.molecula_aprobada || c.molecula_aprobada || ''}
                              placeholder="Molécula aprobada"
                              onChange={e => setEditDecision({
                                ...editDecision,
                                [c.id]: {...(editDecision[c.id] || {}), molecula_aprobada: e.target.value}
                              })} />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Costo tratamiento aprobado (COP)</label>
                            <input type="number"
                              value={editDecision[c.id]?.costo_aprobado ?? c.costo_molecula_aprobada ?? c.costo_post ?? ''}
                              onChange={e => setEditDecision({
                                ...editDecision,
                                [c.id]: {...(editDecision[c.id] || {}), costo_aprobado: e.target.value}
                              })} />
                            {(() => {
                              const raw = editDecision[c.id]?.costo_aprobado ?? c.costo_molecula_aprobada ?? c.costo_post
                              const aprobado = parseFloat(raw)
                              const previo = parseFloat(c.costo_previo)
                              if (!Number.isFinite(aprobado) || !Number.isFinite(previo)) return null
                              const diff = previo - aprobado
                              if (diff > 0) return <p className="text-xs text-green-400 mt-1">Ahorro: {formatCOP(diff)}</p>
                              if (diff < 0) return <p className="text-xs text-red-400 mt-1">Sobrecosto: {formatCOP(-diff)}</p>
                              return <p className="text-xs text-gray-400 mt-1">Sin variación</p>
                            })()}
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">¿Adherente a protocolo?</label>
                            <select
                              value={editDecision[c.id]?.adherente_protocolo ?? c.adherente_protocolo ?? ''}
                              onChange={e => setEditDecision({
                                ...editDecision,
                                [c.id]: {...(editDecision[c.id] || {}), adherente_protocolo: e.target.value === 'true'}
                              })}>
                              <option value="">Sin evaluar</option>
                              <option value="true">Sí</option>
                              <option value="false">No</option>
                            </select>
                          </div>
                          <div className="col-span-3 flex gap-2 mt-2">
                            <button onClick={() => guardarDecision(c.id)}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium 
                                         text-white bg-blue-500 hover:bg-blue-600 transition-colors">
                              <Check size={14} /> Guardar decisión
                            </button>
                            <button onClick={() => setExpanded(null)}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm 
                                         text-gray-400 border border-white/10 hover:border-white/20">
                              <X size={14} /> Cancelar
                            </button>
                          </div>

                          {/* Info adicional */}
                          <div className="col-span-3 mt-2 grid grid-cols-2 gap-4 pt-3 border-t border-white/5">
                            <div>
                              <p className="text-xs text-gray-500">Médico: <span className="text-gray-300">{c.medicos?.nombre || '—'}</span></p>
                              <p className="text-xs text-gray-500">Sede: <span className="text-gray-300">{c.sedes?.nombre || '—'}</span></p>
                              <p className="text-xs text-gray-500">Protocolo: <span className="text-gray-300">{c.protocolos?.nombre || 'No asociado'}</span></p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500">Costo previo: <span className="text-gray-300 font-mono">{formatCOP(c.costo_previo)}</span></p>
                              <p className="text-xs text-gray-500">Oportunidad: <span className="text-gray-300 font-mono">{c.oportunidad_dias ?? '—'} días</span></p>
                              <p className="text-xs text-gray-500">Obligatoria: <span className="text-gray-300">{c.presentacion_obligatoria ? 'Sí' : 'No'}</span></p>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-xs text-gray-600 text-center">
        {filteredCasos.length} caso(s) · Click en una fila para registrar/editar decisión
      </div>
    </div>
  )
}
