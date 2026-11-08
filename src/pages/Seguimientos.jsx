import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { formatDate, formatCOP } from '@/lib/utils'
import toast from 'react-hot-toast'
import { ClipboardCheck, AlertTriangle, CheckCircle, Clock, XCircle, RefreshCw, TrendingDown, Activity, ChevronDown, ChevronRight, User, Search } from 'lucide-react'

const ECOG_OPTS = [
  { value: '0', label: '0 — Asintomático, totalmente activo' },
  { value: '1', label: '1 — Síntomas leves, ambulatorio' },
  { value: '2', label: '2 — Encamado <50% del día' },
  { value: '3', label: '3 — Encamado >50% del día' },
  { value: '4', label: '4 — Postrado, no se autocuida' },
]

const ESTADOS_CLINICOS = [
  { value: 'sin_iniciar', label: 'Sin iniciar tratamiento' },
  { value: 'en_tratamiento', label: 'En tratamiento activo' },
  { value: 'respuesta_parcial', label: 'Respuesta parcial (RP)' },
  { value: 'respuesta_completa', label: 'Respuesta completa (RC)' },
  { value: 'enfermedad_estable', label: 'Enfermedad estable (EE)' },
  { value: 'progresion', label: 'Progresión (PE)' },
  { value: 'fin_tratamiento', label: 'Fin de tratamiento' },
  { value: 'fallecido', label: 'Fallecido' },
  { value: 'perdido', label: 'Perdido en seguimiento' },
]

const RESPUESTA_RECIST = [
  { value: 'RC', label: 'RC — Respuesta completa' },
  { value: 'RP', label: 'RP — Respuesta parcial' },
  { value: 'EE', label: 'EE — Enfermedad estable' },
  { value: 'PE', label: 'PE — Progresión' },
  { value: 'NE', label: 'NE — No evaluable' },
]

const tipoLabel = {
  post_comite: 'POST-COMITÉ',
  trimestral_1: 'TRIM 1 (3m)',
  trimestral_2: 'TRIM 2 (6m)',
  trimestral_3: 'TRIM 3 (9m)',
  trimestral_4: 'TRIM 4 (12m)',
  semestral: 'SEMESTRAL',
  anual: 'ANUAL',
  ad_hoc: 'AD HOC',
  trimestral: 'TRIMESTRAL',
  cuatrimestral: 'CUATRIMESTRAL',
}

// Controles periódicos (migración 019): tipo = frecuencia + número consecutivo
const etiquetaTipo = (s) =>
  s.numero ? `${tipoLabel[s.tipo] || s.tipo} · CONTROL ${s.numero}` : (tipoLabel[s.tipo] || s.tipo)

const FRECUENCIAS = [
  { value: 'trimestral',    label: 'Trimestral' },
  { value: 'cuatrimestral', label: 'Cuatrimestral' },
  { value: 'semestral',     label: 'Semestral' },
]

const tipoColor = {
  post_comite: '#B9832F',
  trimestral_1: '#156573',
  trimestral_2: '#35C9B6',
  trimestral_3: '#0E9E8C',
  trimestral_4: '#D9A44E',
  semestral: '#0E4C57',
  anual: '#6E8A90',
  ad_hoc: '#A9BEC2',
  trimestral: '#156573',
  cuatrimestral: '#0E9E8C',
}

const estadoIcon = {
  pendiente: Clock,
  vencido: AlertTriangle,
  realizado: CheckCircle,
  no_aplica: XCircle,
}
const estadoColor = {
  pendiente: '#B9832F',
  vencido: '#D9534F',
  realizado: '#0E9E8C',
  no_aplica: '#6E8A90',
}

export default function Seguimientos() {
  const [seguimientos, setSeguimientos] = useState([])
  const [gestores, setGestores] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('pendientes')
  const [editando, setEditando] = useState(null)
  const [formData, setFormData] = useState({})
  const [abiertos, setAbiertos] = useState(() => new Set()) // pacientes desplegados
  const [busqueda, setBusqueda] = useState('')

  const fetchData = async () => {
    setLoading(true)
    try { await supabase.rpc('marcar_seguimientos_vencidos') } catch(e) { console.warn('No se pudo marcar vencidos:', e.message) }

    let query = supabase.from('seguimientos')
      .select(`
        *,
        casos_comite(
          id, decision, molecula_aprobada, estado, fecha_presentacion, costo_post, costo_previo, frecuencia_seguimiento, ecog, eva,
          pacientes(nombre, documento),
          medicos(nombre),
          diagnosticos(cie10, descripcion, estadio),
          protocolos(nombre, estudio_pivotal, pfs_esperado_meses, os_esperado_meses)
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

  useEffect(() => { fetchData() }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  const initForm = (s) => {
    if (s.tipo === 'post_comite') {
      return {
        gestor_id: '', decision_ejecutada: true,
        fecha_primera_consulta: '', fecha_inicio_tratamiento: '',
        motivo_no_ejecucion: '', observaciones: '',
      }
    }
    return {
      gestor_id: '', estado_clinico: '', respuesta_recist: '',
      pfs_alcanzado: false, fecha_progresion: '', sitio_progresion: '',
      os_alcanzado: false, fecha_muerte: '', causa_muerte: '',
      toxicidad_grado_max: '', toxicidad_descripcion: '',
      ecog: '', eva: '',
      cambio_dosis: false, suspension_tratamiento: false,
      costo_periodo: '', costo_acumulado_tratamiento: '',
      estado_vital: 'vivo', fecha_ultimo_contacto: new Date().toISOString().split('T')[0],
      observaciones: '',
    }
  }

  const guardar = async (segId) => {
    const f = formData[segId]
    if (!f) return
    const seg = seguimientos.find(s => s.id === segId)
    const today = new Date().toISOString().split('T')[0]

    const dateFields = seg.tipo === 'post_comite'
      ? [
          ['fecha_primera_consulta', 'La fecha de primera consulta no puede ser futura'],
          ['fecha_inicio_tratamiento', 'La fecha de inicio de tratamiento no puede ser futura'],
        ]
      : [
          ['fecha_progresion', 'La fecha de progresión no puede ser futura'],
          ['fecha_muerte', 'La fecha de muerte no puede ser futura'],
          ['fecha_ultimo_contacto', 'La fecha de último contacto no puede ser futura'],
        ]
    for (const [field, msg] of dateFields) {
      if (f[field] && f[field] > today) {
        toast.error(msg)
        return
      }
    }
    // Calidad de vida: ECOG y EVA son obligatorios si el paciente está vivo
    if (seg.tipo !== 'post_comite' && (f.estado_vital || 'vivo') === 'vivo' && (f.ecog === '' || f.eva === '')) {
      toast.error('Registra el ECOG y el dolor (EVA) del paciente en este control')
      return
    }

    try {
      const updateData = {
        estado: 'realizado',
        fecha_realizada: today,
        gestor_id: f.gestor_id || null,
        observaciones: f.observaciones || null,
      }

      if (seg.tipo === 'post_comite') {
        updateData.decision_ejecutada = f.decision_ejecutada
        updateData.fecha_primera_consulta = f.fecha_primera_consulta || null
        updateData.fecha_inicio_tratamiento = f.fecha_inicio_tratamiento || null
        updateData.motivo_no_ejecucion = f.motivo_no_ejecucion || null
      } else {
        updateData.estado_clinico = f.estado_clinico || null
        updateData.respuesta_recist = f.respuesta_recist || null
        updateData.pfs_alcanzado = f.pfs_alcanzado || false
        updateData.fecha_progresion = f.fecha_progresion || null
        updateData.sitio_progresion = f.sitio_progresion || null
        updateData.os_alcanzado = f.os_alcanzado || false
        updateData.fecha_muerte = f.fecha_muerte || null
        updateData.causa_muerte = f.causa_muerte || null
        updateData.toxicidad_grado_max = f.toxicidad_grado_max ? parseInt(f.toxicidad_grado_max) : null
        updateData.toxicidad_descripcion = f.toxicidad_descripcion || null
        updateData.ecog = f.ecog === '' || f.ecog == null ? null : parseInt(f.ecog)
        updateData.eva = f.eva === '' || f.eva == null ? null : parseInt(f.eva)
        updateData.cambio_dosis = f.cambio_dosis || false
        updateData.suspension_tratamiento = f.suspension_tratamiento || false
        updateData.costo_periodo = parseFloat(f.costo_periodo) || 0
        updateData.costo_acumulado_tratamiento = parseFloat(f.costo_acumulado_tratamiento) || 0
        updateData.estado_vital = f.estado_vital || 'vivo'
        updateData.fecha_ultimo_contacto = f.fecha_ultimo_contacto || null
      }

      const { error } = await supabase.from('seguimientos')
        .update(updateData).eq('id', segId)
      if (error) throw error

      // Resolver alertas
      if (seg?.caso_id) {
        await supabase.from('alertas')
          .update({ estado: 'resuelta', resuelta_at: new Date().toISOString() })
          .eq('caso_id', seg.caso_id)
          .eq('estado', 'activa')
      }

      toast.success(seg.tipo === 'post_comite'
        ? 'Evaluación post-comité registrada'
        : 'Evaluación trimestral registrada')
      setEditando(null)
      fetchData()
    } catch (err) {
      toast.error(`Error: ${err.message}`)
    }
  }

  const updateField = (segId, field, value) =>
    setFormData(prev => ({...prev, [segId]: {...prev[segId], [field]: value}}))

  const pendientes = seguimientos.filter(s => s.estado === 'pendiente').length
  const vencidos = seguimientos.filter(s => s.estado === 'vencido').length
  const postComite = seguimientos.filter(s => s.tipo === 'post_comite' && s.estado !== 'realizado').length
  const periodicos = seguimientos.filter(s => s.tipo !== 'post_comite' && s.estado !== 'realizado').length

  // Agrupar las evaluaciones por paciente: primero quien tiene vencidos, luego por la próxima fecha
  const grupos = (() => {
    const mapa = new Map()
    for (const s of seguimientos) {
      const pac = s.casos_comite?.pacientes
      const key = pac?.documento || `caso-${s.caso_id}`
      if (!mapa.has(key)) mapa.set(key, { key, paciente: pac, items: [] })
      mapa.get(key).items.push(s)
    }
    const q = busqueda.trim().toLowerCase()
    return [...mapa.values()]
      .map(g => {
        const abiertas = g.items.filter(s => s.estado !== 'realizado')
        return {
          ...g,
          vencidos: g.items.filter(s => s.estado === 'vencido').length,
          pendientes: g.items.filter(s => s.estado === 'pendiente').length,
          realizados: g.items.filter(s => s.estado === 'realizado').length,
          proxima: abiertas[0]?.fecha_programada || null,
        }
      })
      .filter(g => !q || g.paciente?.nombre?.toLowerCase().includes(q) || g.paciente?.documento?.toLowerCase().includes(q))
      .sort((a, b) =>
        (b.vencidos > 0) - (a.vencidos > 0) ||
        (a.proxima || '9999').localeCompare(b.proxima || '9999') ||
        (a.paciente?.nombre || '').localeCompare(b.paciente?.nombre || ''))
  })()

  const cambiarFrecuencia = async (caso, frecuencia) => {
    if (frecuencia === caso.frecuencia_seguimiento) return
    const label = FRECUENCIAS.find(f => f.value === frecuencia)?.label.toLowerCase()
    if (!window.confirm(`¿Cambiar el seguimiento a ${label}? El control pendiente se reprograma con la nueva frecuencia.`)) return
    const { error } = await supabase.rpc('cambiar_frecuencia_seguimiento', { p_caso_id: caso.id, p_frecuencia: frecuencia })
    if (error) {
      toast.error(`No se pudo cambiar la frecuencia: ${error.message}`)
      return
    }
    toast.success(`Seguimiento ${label}`)
    fetchData()
  }

  const toggleGrupo = (key) => setAbiertos(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Seguimiento Clínico y Económico</h1>
        <p className="text-sm text-gray-500">Evaluaciones post-comité y trimestrales con desenlaces</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Vencidos', val: vencidos, color: '#ef4444', icon: AlertTriangle },
          { label: 'Post-comité pendiente', val: postComite, color: '#f59e0b', icon: Clock },
          { label: 'Controles periódicos pendiente', val: periodicos, color: '#3b82f6', icon: Activity },
          { label: 'Total evaluaciones', val: seguimientos.length, color: '#94a3b8', icon: ClipboardCheck },
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
            }`}>{t.label}</button>
        ))}
        <div className="relative ml-auto">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar paciente o documento…"
            className="pl-8 pr-3 py-2 rounded-lg text-sm border border-white/5 bg-transparent focus:outline-none focus:border-blue-500/30 w-64" />
        </div>
        <button onClick={fetchData} className="px-3 py-2 rounded-lg text-gray-500 hover:text-gray-300 border border-white/5">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* List */}
      <div className="rounded-xl border border-white/5 overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)' }}>
        {loading ? (
          <div className="p-8 text-center text-gray-500">Cargando...</div>
        ) : grupos.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {busqueda ? 'Ningún paciente coincide con la búsqueda' : `Sin evaluaciones ${tab === 'pendientes' ? 'pendientes' : ''}`}
          </div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {grupos.map(g => {
              const abierto = abiertos.has(g.key) || !!busqueda.trim()
              const casoRef = g.items[0]?.casos_comite
              return (
                <div key={g.key}>
                  {/* Paciente */}
                  <button type="button" onClick={() => toggleGrupo(g.key)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02]">
                    {abierto ? <ChevronDown size={16} className="text-gray-500 shrink-0" /> : <ChevronRight size={16} className="text-gray-500 shrink-0" />}
                    <User size={18} className="text-gray-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold truncate">{g.paciente?.nombre || '—'}</span>
                        <span className="text-xs text-gray-500 font-mono">{g.paciente?.documento}</span>
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {casoRef?.diagnosticos?.descripcion || casoRef?.molecula_aprobada || ''}
                        {g.proxima ? ` · Próxima: ${formatDate(g.proxima)}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {g.vencidos > 0 && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ background: `${estadoColor.vencido}15`, color: estadoColor.vencido }}>
                          {g.vencidos} vencido{g.vencidos > 1 ? 's' : ''}
                        </span>
                      )}
                      {g.pendientes > 0 && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ background: `${estadoColor.pendiente}15`, color: estadoColor.pendiente }}>
                          {g.pendientes} pendiente{g.pendientes > 1 ? 's' : ''}
                        </span>
                      )}
                      {g.realizados > 0 && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ background: `${estadoColor.realizado}15`, color: estadoColor.realizado }}>
                          {g.realizados} realizado{g.realizados > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </button>

                  {abierto && (
                  <div className="divide-y divide-white/[0.03] border-t border-white/5 bg-white/[0.01]">
                    {/* Frecuencia de los controles, por caso del paciente */}
                    {[...new Map(g.items.map(s => [s.casos_comite?.id, s.casos_comite])).values()].filter(Boolean).map(caso => (
                      <div key={caso.id} className="flex flex-wrap items-center gap-3 pl-12 pr-4 py-2.5 text-sm">
                        <span className="text-gray-500">Frecuencia de seguimiento{caso.molecula_aprobada ? ` · ${caso.molecula_aprobada}` : ''}:</span>
                        <select value={caso.frecuencia_seguimiento || 'trimestral'}
                          onChange={e => cambiarFrecuencia(caso, e.target.value)}
                          className="px-2 py-1 rounded-lg text-sm border border-white/10 bg-transparent focus:outline-none focus:border-blue-500/30">
                          {FRECUENCIAS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                        </select>
                      </div>
                    ))}
            {g.items.map(s => {
              const Icon = estadoIcon[s.estado] || Clock
              const color = estadoColor[s.estado]
              const proto = s.casos_comite?.protocolos
              const isExpanded = editando === s.id
              const diasVencido = s.estado === 'vencido'
                ? Math.floor((new Date() - new Date(s.fecha_programada)) / 86400000) : 0
              const tColor = tipoColor[s.tipo] || '#64748b'

              return (
                <div key={s.id}>
                  {/* Row */}
                  <div className="flex items-center gap-4 pl-12 pr-4 py-3 hover:bg-white/[0.02] cursor-pointer"
                    onClick={() => {
                      if (s.estado === 'realizado' && !isExpanded) {
                        setEditando(s.id)
                        return
                      }
                      if (s.estado === 'realizado') { setEditando(null); return }
                      setEditando(isExpanded ? null : s.id)
                      if (!isExpanded) {
                        setFormData({ ...formData, [s.id]: initForm(s) })
                      }
                    }}>
                    <Icon size={18} style={{ color }} className="flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-300">
                        {s.casos_comite?.molecula_aprobada || 'Sin molécula'}
                        {proto ? ` · ${proto.nombre}` : ''}
                      </div>
                    </div>
                    <div className="text-center flex-shrink-0">
                      <div className="text-xs font-semibold px-2.5 py-1 rounded"
                        style={{ background: `${tColor}15`, color: tColor, border: `1px solid ${tColor}30` }}>
                        {etiquetaTipo(s)}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 w-28">
                      <div className="text-sm font-mono text-gray-400">{formatDate(s.fecha_programada)}</div>
                      {diasVencido > 0 && (
                        <div className="text-xs text-red-400 font-semibold">{diasVencido}d vencido</div>
                      )}
                    </div>
                    <div className="flex-shrink-0 w-20 text-right">
                      <span className="text-[11px] px-2 py-0.5 rounded"
                        style={{ background: `${color}10`, color }}>{s.estado}</span>
                    </div>
                  </div>

                  {/* Expanded: POST-COMITÉ form */}
                  {isExpanded && s.estado !== 'realizado' && s.tipo === 'post_comite' && (
                    <div className="px-4 py-4 border-t border-white/5" style={{ background: 'rgba(245,158,11,0.03)' }}>
                      <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-3">
                        Evaluación Post-Comité — ¿Se ejecutó la decisión?
                      </h4>
                      <div className="grid grid-cols-3 gap-4 max-w-2xl">
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">¿Decisión ejecutada?</label>
                          <select value={formData[s.id]?.decision_ejecutada ?? true}
                            onChange={e => updateField(s.id, 'decision_ejecutada', e.target.value === 'true')}>
                            <option value="true">Sí</option>
                            <option value="false">No</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Fecha primera consulta</label>
                          <input type="date" value={formData[s.id]?.fecha_primera_consulta || ''}
                            max={new Date().toISOString().split('T')[0]}
                            onChange={e => updateField(s.id, 'fecha_primera_consulta', e.target.value)} />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Fecha inicio tratamiento</label>
                          <input type="date" value={formData[s.id]?.fecha_inicio_tratamiento || ''}
                            max={new Date().toISOString().split('T')[0]}
                            onChange={e => updateField(s.id, 'fecha_inicio_tratamiento', e.target.value)} />
                        </div>
                        {formData[s.id]?.decision_ejecutada === false && (
                          <div className="col-span-3">
                            <label className="block text-xs text-gray-400 mb-1">Motivo de no ejecución</label>
                            <input value={formData[s.id]?.motivo_no_ejecucion || ''} placeholder="Barrera administrativa, clínica, del paciente..."
                              onChange={e => updateField(s.id, 'motivo_no_ejecucion', e.target.value)} />
                          </div>
                        )}
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Gestor</label>
                          <select value={formData[s.id]?.gestor_id || ''}
                            onChange={e => updateField(s.id, 'gestor_id', e.target.value)}>
                            <option value="">Seleccionar...</option>
                            {gestores.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-400 mb-1">Observaciones</label>
                          <input value={formData[s.id]?.observaciones || ''} placeholder="Notas..."
                            onChange={e => updateField(s.id, 'observaciones', e.target.value)} />
                        </div>
                        <div className="col-span-3 flex gap-2 mt-2">
                          <button onClick={() => guardar(s.id)}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white bg-amber-600 hover:bg-amber-700">
                            <CheckCircle size={14} /> Registrar evaluación post-comité
                          </button>
                          <button onClick={() => setEditando(null)}
                            className="px-4 py-2 rounded-lg text-sm text-gray-400 border border-white/10">Cancelar</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Expanded: TRIMESTRAL form */}
                  {isExpanded && s.estado !== 'realizado' && s.tipo !== 'post_comite' && (
                    <div className="px-4 py-4 border-t border-white/5" style={{ background: 'rgba(59,130,246,0.03)' }}>
                      <h4 className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-3">
                        Evaluación Trimestral — Estado clínico, desenlaces y costos
                      </h4>
                      {proto && (
                        <div className="mb-4 px-3 py-2 rounded-lg bg-purple-500/5 border border-purple-500/15 text-xs text-gray-400">
                          <span className="text-purple-400 font-semibold">{proto.estudio_pivotal}:</span>{' '}
                          PFS esperado {proto.pfs_esperado_meses}m · OS esperado {proto.os_esperado_meses || 'NR'}m
                        </div>
                      )}
                      <div className="grid grid-cols-3 gap-4 max-w-3xl">
                        {/* Estado clínico */}
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Estado clínico</label>
                          <select value={formData[s.id]?.estado_clinico || ''}
                            onChange={e => updateField(s.id, 'estado_clinico', e.target.value)}>
                            <option value="">Seleccionar...</option>
                            {ESTADOS_CLINICOS.map(ec => <option key={ec.value} value={ec.value}>{ec.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Respuesta (RECIST)</label>
                          <select value={formData[s.id]?.respuesta_recist || ''}
                            onChange={e => updateField(s.id, 'respuesta_recist', e.target.value)}>
                            <option value="">Seleccionar...</option>
                            {RESPUESTA_RECIST.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Estado vital</label>
                          <select value={formData[s.id]?.estado_vital || 'vivo'}
                            onChange={e => updateField(s.id, 'estado_vital', e.target.value)}>
                            <option value="vivo">Vivo</option>
                            <option value="fallecido">Fallecido</option>
                            <option value="perdido">Perdido</option>
                          </select>
                        </div>

                        {/* Calidad de vida: se compara con el ingreso al comité */}
                        <div className="col-span-3 mt-2">
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Calidad de vida</p>
                          <p className="text-xs text-gray-500">
                            Al ingreso al comité: ECOG {s.casos_comite?.ecog ?? '—'} · Dolor EVA {s.casos_comite?.eva ?? '—'}
                          </p>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">ECOG actual {(formData[s.id]?.estado_vital || 'vivo') === 'vivo' && <span className="text-red-500">*</span>}</label>
                          <select value={formData[s.id]?.ecog ?? ''}
                            onChange={e => updateField(s.id, 'ecog', e.target.value)}>
                            <option value="">Seleccionar...</option>
                            {ECOG_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Dolor EVA actual (0-10) {(formData[s.id]?.estado_vital || 'vivo') === 'vivo' && <span className="text-red-500">*</span>}</label>
                          <select value={formData[s.id]?.eva ?? ''}
                            onChange={e => updateField(s.id, 'eva', e.target.value)}>
                            <option value="">Seleccionar...</option>
                            {Array.from({ length: 11 }, (_, i) => (
                              <option key={i} value={String(i)}>{i}{i === 0 ? ' — sin dolor' : i === 10 ? ' — máximo dolor' : ''}</option>
                            ))}
                          </select>
                        </div>
                        <div />

                        {/* PFS */}
                        <div className="col-span-3 mt-2">
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Supervivencia libre de progresión (PFS)</p>
                        </div>
                        <div>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={formData[s.id]?.pfs_alcanzado || false}
                              onChange={e => updateField(s.id, 'pfs_alcanzado', e.target.checked)} />
                            <span className="text-sm text-gray-300">¿Progresó? (PFS alcanzado)</span>
                          </label>
                        </div>
                        {formData[s.id]?.pfs_alcanzado && (
                          <>
                            <div>
                              <label className="block text-xs text-gray-400 mb-1">Fecha progresión</label>
                              <input type="date" value={formData[s.id]?.fecha_progresion || ''}
                                max={new Date().toISOString().split('T')[0]}
                                onChange={e => updateField(s.id, 'fecha_progresion', e.target.value)} />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-400 mb-1">Sitio progresión</label>
                              <input value={formData[s.id]?.sitio_progresion || ''} placeholder="Hígado, SNC, hueso..."
                                onChange={e => updateField(s.id, 'sitio_progresion', e.target.value)} />
                            </div>
                          </>
                        )}

                        {/* OS */}
                        {formData[s.id]?.estado_vital === 'fallecido' && (
                          <>
                            <div className="col-span-3 mt-2">
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Supervivencia global (OS)</p>
                            </div>
                            <div>
                              <label className="block text-xs text-gray-400 mb-1">Fecha de muerte</label>
                              <input type="date" value={formData[s.id]?.fecha_muerte || ''}
                                max={new Date().toISOString().split('T')[0]}
                                onChange={e => updateField(s.id, 'fecha_muerte', e.target.value)} />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-400 mb-1">Causa de muerte</label>
                              <input value={formData[s.id]?.causa_muerte || ''} placeholder="Progresión, toxicidad, otra..."
                                onChange={e => updateField(s.id, 'causa_muerte', e.target.value)} />
                            </div>
                          </>
                        )}

                        {/* Toxicidad */}
                        <div className="col-span-3 mt-2">
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Toxicidad</p>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Grado máximo (0-5)</label>
                          <select value={formData[s.id]?.toxicidad_grado_max || ''}
                            onChange={e => updateField(s.id, 'toxicidad_grado_max', e.target.value)}>
                            <option value="">Sin toxicidad</option>
                            {[1,2,3,4,5].map(n => <option key={n} value={n}>Grado {n}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Descripción toxicidad</label>
                          <input value={formData[s.id]?.toxicidad_descripcion || ''} placeholder="Astenia, rash, diarrea..."
                            onChange={e => updateField(s.id, 'toxicidad_descripcion', e.target.value)} />
                        </div>
                        <div className="flex gap-4 items-end">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={formData[s.id]?.cambio_dosis || false}
                              onChange={e => updateField(s.id, 'cambio_dosis', e.target.checked)} />
                            <span className="text-xs text-gray-300">Cambio dosis</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={formData[s.id]?.suspension_tratamiento || false}
                              onChange={e => updateField(s.id, 'suspension_tratamiento', e.target.checked)} />
                            <span className="text-xs text-gray-300">Suspensión</span>
                          </label>
                        </div>

                        {/* Costos */}
                        <div className="col-span-3 mt-2">
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Seguimiento económico</p>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Costo este periodo (COP)</label>
                          <input type="number" value={formData[s.id]?.costo_periodo || ''}
                            placeholder="0"
                            onChange={e => updateField(s.id, 'costo_periodo', e.target.value)} />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Costo acumulado total (COP)</label>
                          <input type="number" value={formData[s.id]?.costo_acumulado_tratamiento || ''}
                            placeholder="0"
                            onChange={e => updateField(s.id, 'costo_acumulado_tratamiento', e.target.value)} />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Fecha último contacto</label>
                          <input type="date" value={formData[s.id]?.fecha_ultimo_contacto || ''}
                            max={new Date().toISOString().split('T')[0]}
                            onChange={e => updateField(s.id, 'fecha_ultimo_contacto', e.target.value)} />
                        </div>

                        {/* Observaciones + Guardar */}
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Gestor</label>
                          <select value={formData[s.id]?.gestor_id || ''}
                            onChange={e => updateField(s.id, 'gestor_id', e.target.value)}>
                            <option value="">Seleccionar...</option>
                            {gestores.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-400 mb-1">Observaciones</label>
                          <input value={formData[s.id]?.observaciones || ''} placeholder="Notas de la evaluación..."
                            onChange={e => updateField(s.id, 'observaciones', e.target.value)} />
                        </div>

                        <div className="col-span-3 flex gap-2 mt-2">
                          <button onClick={() => guardar(s.id)}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700">
                            <CheckCircle size={14} /> Registrar evaluación trimestral
                          </button>
                          <button onClick={() => setEditando(null)}
                            className="px-4 py-2 rounded-lg text-sm text-gray-400 border border-white/10">Cancelar</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Expanded: show completed info */}
                  {isExpanded && s.estado === 'realizado' && (
                    <div className="px-4 py-3 border-t border-white/5" style={{ background: 'rgba(34,197,94,0.03)' }}>
                      <div className="grid grid-cols-3 gap-3 text-sm text-gray-400">
                        <p>Realizado: <span className="text-gray-300">{formatDate(s.fecha_realizada)}</span></p>
                        {s.tipo === 'post_comite' ? (
                          <>
                            <p>Ejecutada: <span className="text-gray-300">{s.decision_ejecutada ? 'Sí' : 'No'}</span></p>
                            <p>Inicio tx: <span className="text-gray-300">{formatDate(s.fecha_inicio_tratamiento) || '—'}</span></p>
                            <p>1a consulta: <span className="text-gray-300">{formatDate(s.fecha_primera_consulta) || '—'}</span></p>
                          </>
                        ) : (
                          <>
                            <p>Estado: <span className="text-gray-300">{s.estado_clinico || '—'}</span></p>
                            <p>RECIST: <span className="text-gray-300">{s.respuesta_recist || '—'}</span></p>
                            <p>PFS: <span className="text-gray-300">{s.pfs_alcanzado ? `Sí — ${formatDate(s.fecha_progresion)}` : 'No alcanzado'}</span></p>
                            <p>Vital: <span className="text-gray-300">{s.estado_vital}</span></p>
                            <p>Costo acumulado: <span className="text-gray-300 font-mono">{formatCOP(s.costo_acumulado_tratamiento)}</span></p>
                            {(s.ecog != null || s.eva != null) && <p>ECOG / EVA: <span className="text-gray-300">{s.ecog ?? '—'} / {s.eva ?? '—'}</span></p>}
                            {s.toxicidad_grado_max && <p>Toxicidad: <span className="text-gray-300">G{s.toxicidad_grado_max} — {s.toxicidad_descripcion}</span></p>}
                          </>
                        )}
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
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
