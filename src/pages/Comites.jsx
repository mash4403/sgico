import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { Landmark, RefreshCw, Search, ChevronDown, ChevronUp, User, Gavel, FileText } from 'lucide-react'

const TIPO_LABEL = {
  tumor_solido: 'Tumor sólido',
  hematologico: 'Hematológico',
  multidisciplinario: 'Multidisciplinario',
}

const DECISION_LABEL = {
  pendiente: 'Pendiente', aprobado: 'Aprobado', rechazado: 'Rechazado',
  modificado: 'Aprobado con modificaciones', diferido: 'Diferido', pendiente_info: 'Pendiente de información',
}

const ESTADO_INFO = {
  programado: { label: 'Programado',            cls: 'bg-blue-100 text-blue-800 ring-blue-300' },
  realizado:  { label: 'Realizado',             cls: 'bg-emerald-100 text-emerald-800 ring-emerald-300' },
  pendiente:  { label: 'Realizado con pendientes', cls: 'bg-amber-100 text-amber-800 ring-amber-300' },
}

const hoy = () => new Date().toISOString().split('T')[0]

// El estado se deduce de los casos: la sesión está realizada cuando todas sus actas
// quedaron firmadas (presentado=true); si ya pasó la fecha y quedan casos, tiene pendientes.
const estadoSesion = (s) => {
  const total = s.casos.length
  const presentados = s.casos.filter(c => c.presentado).length
  if (total > 0 && presentados === total) return 'realizado'
  if (s.fecha < hoy() && total > 0) return 'pendiente'
  return 'programado'
}

export default function Comites() {
  const navigate = useNavigate()
  const [sesiones, setSesiones] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [abierta, setAbierta] = useState(null)

  const fetchSesiones = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('sesiones_comite')
      .select('id, fecha, tipo_comite, notas, casos:casos_comite(id, presentado, decision, motivo, molecula_propuesta, pacientes(nombre, documento), diagnosticos(cie10, descripcion))')
      .order('fecha', { ascending: false })
    if (error) {
      console.error('Error cargando comités:', error)
      toast.error('Error cargando comités')
    }
    setSesiones((data || []).map(s => ({ ...s, casos: s.casos || [], estado: estadoSesion({ ...s, casos: s.casos || [] }) })))
    setLoading(false)
  }

  useEffect(() => { fetchSesiones() }, [])

  const filtradas = useMemo(() => {
    const q = search.trim().toLowerCase()
    return sesiones
      .filter(s => {
        if (filtroEstado === 'programado' && s.estado !== 'programado') return false
        if (filtroEstado === 'realizado' && s.estado === 'programado') return false
        if (filtroTipo && s.tipo_comite !== filtroTipo) return false
        if (desde && s.fecha < desde) return false
        if (hasta && s.fecha > hasta) return false
        return true
      })
      .map(s => {
        if (!q) return { ...s, coincidencias: s.casos }
        const coincidencias = s.casos.filter(c =>
          c.pacientes?.nombre?.toLowerCase().includes(q) ||
          c.pacientes?.documento?.toLowerCase().includes(q) ||
          c.diagnosticos?.cie10?.toLowerCase().includes(q) ||
          c.diagnosticos?.descripcion?.toLowerCase().includes(q) ||
          c.molecula_propuesta?.toLowerCase().includes(q) ||
          c.motivo?.toLowerCase().includes(q)
        )
        const enSesion = s.notas?.toLowerCase().includes(q)
        return (coincidencias.length || enSesion) ? { ...s, coincidencias: enSesion ? s.casos : coincidencias } : null
      })
      .filter(Boolean)
  }, [sesiones, search, filtroEstado, filtroTipo, desde, hasta])

  const fmtFecha = (f) =>
    new Date(`${f}T00:00:00`).toLocaleDateString('es-CO', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })

  const programadas = sesiones.filter(s => s.estado === 'programado').length
  const hayFiltros = search || filtroEstado || filtroTipo || desde || hasta
  const inputCls = 'px-3 py-2 rounded-lg text-sm border border-niebla/20 bg-tinta-2 text-hueso focus:outline-none focus:border-pulso/50'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow mb-1">Comité oncológico</p>
          <h1 className="text-xl font-display font-bold tracking-tight text-hueso">Comités</h1>
          <p className="text-sm text-niebla-oscura mt-1">
            {sesiones.length} sesiones · {programadas} programadas · {sesiones.length - programadas} realizadas
          </p>
        </div>
        <button onClick={fetchSesiones}
          className="flex items-center gap-2 px-4 py-2 rounded-full text-sm text-niebla
                     hover:text-hueso border border-niebla/20 hover:border-pulso/50 transition-all">
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[16rem]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-niebla-oscura" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Paciente, documento, CIE-10, diagnóstico, medicamento…"
            className={`${inputCls} w-full pl-9`} />
        </div>
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className={inputCls}>
          <option value="">Todos los estados</option>
          <option value="programado">Programados</option>
          <option value="realizado">Realizados</option>
        </select>
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} className={inputCls}>
          <option value="">Todos los tipos</option>
          {Object.entries(TIPO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <label className="text-xs text-niebla-oscura">
          Desde
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className={`${inputCls} block mt-1`} />
        </label>
        <label className="text-xs text-niebla-oscura">
          Hasta
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className={`${inputCls} block mt-1`} />
        </label>
        {hayFiltros && (
          <button onClick={() => { setSearch(''); setFiltroEstado(''); setFiltroTipo(''); setDesde(''); setHasta('') }}
            className="text-sm text-pulso hover:underline pb-2">
            Limpiar filtros
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="animate-spin text-niebla-oscura" size={24} />
        </div>
      ) : filtradas.length === 0 ? (
        <div className="rounded-[18px] p-10 border border-niebla/15 bg-tinta-2 text-center">
          <Landmark className="mx-auto mb-3 text-niebla-oscura" size={28} />
          <p className="text-niebla">{hayFiltros ? 'Ningún comité coincide con la búsqueda.' : 'Aún no hay comités registrados.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtradas.map(s => {
            const info = ESTADO_INFO[s.estado]
            const presentados = s.casos.filter(c => c.presentado).length
            const expandida = abierta === s.id || !!search.trim()
            return (
              <div key={s.id} className="rounded-[18px] border border-niebla/15 bg-tinta-2">
                <button type="button" onClick={() => setAbierta(abierta === s.id ? null : s.id)}
                  className="w-full flex items-center gap-3 p-4 text-left">
                  <div className="w-10 h-10 rounded-xl bg-pulso/10 text-pulso flex items-center justify-center shrink-0">
                    <Landmark size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-bold text-hueso capitalize">{fmtFecha(s.fecha)}</div>
                    <div className="text-[11px] font-mono text-niebla-oscura uppercase tracking-[0.15em]">
                      {TIPO_LABEL[s.tipo_comite] || s.tipo_comite} · {presentados}/{s.casos.length} actas firmadas
                    </div>
                  </div>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ring-1 shrink-0 ${info.cls}`}>
                    {info.label}
                  </span>
                  {expandida ? <ChevronUp size={16} className="text-niebla-oscura" /> : <ChevronDown size={16} className="text-niebla-oscura" />}
                </button>

                {expandida && (
                  <div className="px-4 pb-4 space-y-2">
                    {s.notas && <p className="text-xs text-niebla-oscura italic px-1">{s.notas}</p>}
                    {s.coincidencias.length === 0 && (
                      <p className="text-sm text-niebla-oscura px-1">Sin casos en esta sesión.</p>
                    )}
                    {s.coincidencias.map((c, idx) => (
                      <div key={c.id}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-niebla/10"
                        style={{ background: 'rgba(243,239,231,0.02)' }}>
                        <span className="text-[11px] font-mono text-niebla-oscura w-5 text-center shrink-0">{idx + 1}</span>
                        <User size={16} className="text-niebla-oscura shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-hueso truncate">{c.pacientes?.nombre || 'Sin nombre'}</div>
                          <div className="text-xs text-niebla-oscura truncate">
                            {c.pacientes?.documento || '—'}
                            {c.diagnosticos?.cie10 ? ` · ${c.diagnosticos.cie10}` : ''}
                            {c.diagnosticos?.descripcion ? ` ${c.diagnosticos.descripcion}` : ''}
                          </div>
                        </div>
                        <span className="text-xs text-niebla shrink-0">
                          {c.presentado ? (DECISION_LABEL[c.decision] || c.decision || '—') : 'Sin presentar'}
                        </span>
                        <button onClick={() => navigate(`/casos/${c.id}`)} title="Ver caso"
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-niebla border border-niebla/20 hover:text-hueso hover:border-niebla/40 transition-colors shrink-0">
                          <FileText size={13} /> Ver caso
                        </button>
                        <button onClick={() => navigate(`/casos/${c.id}/acta`)} title={c.presentado ? 'Ver acta' : 'Presentar y decidir en comité'}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-tinta bg-pulso hover:bg-pulso-oscuro transition-colors shrink-0">
                          <Gavel size={13} /> {c.presentado ? 'Acta' : 'Presentar'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
