import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { CalendarClock, RefreshCw, User, Pencil, Gavel } from 'lucide-react'

const TIPO_LABEL = {
  tumor_solido: 'Tumor sólido',
  hematologico: 'Hematológico',
  multidisciplinario: 'Multidisciplinario',
}

export default function Agenda() {
  const navigate = useNavigate()
  const [sesiones, setSesiones] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchAgenda = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('casos_comite')
        .select('id, motivo, prioridad, sesion_id, sesion:sesiones_comite(id, fecha, tipo_comite, estado), pacientes(nombre, documento)')
        .eq('presentado', false)
        .not('sesion_id', 'is', null)
      if (error) throw error

      // Agrupar casos por sesión
      const mapa = new Map()
      for (const c of data || []) {
        if (!c.sesion) continue
        if (!mapa.has(c.sesion.id)) mapa.set(c.sesion.id, { ...c.sesion, casos: [] })
        mapa.get(c.sesion.id).casos.push(c)
      }
      const lista = [...mapa.values()].sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
      setSesiones(lista)
    } catch (e) {
      console.error('Error cargando agenda:', e)
      setSesiones([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAgenda() }, [])

  const fmtFecha = (f) =>
    new Date(f).toLocaleDateString('es-CO', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-niebla-oscura" size={24} />
      </div>
    )
  }

  const totalCasos = sesiones.reduce((n, s) => n + s.casos.length, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow mb-1">Comité oncológico</p>
          <h1 className="text-xl font-display font-bold tracking-tight text-hueso">Casos para comité</h1>
        </div>
        <button onClick={fetchAgenda}
          className="flex items-center gap-2 px-4 py-2 rounded-full text-sm text-niebla
                     hover:text-hueso border border-niebla/20 hover:border-pulso/50 transition-all">
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {sesiones.length === 0 ? (
        <div className="rounded-[18px] p-10 border border-niebla/15 bg-tinta-2 text-center">
          <CalendarClock className="mx-auto mb-3 text-niebla-oscura" size={28} />
          <p className="text-niebla">No hay casos agendados.</p>
          <p className="text-sm text-niebla-oscura mt-1">
            Prepara un caso en <span className="text-pulso">Presentar caso</span> y usa “Agendar para comité”.
          </p>
        </div>
      ) : (
        sesiones.map(s => (
          <div key={s.id} className="rounded-[18px] p-5 border border-niebla/15 bg-tinta-2"
               style={{ boxShadow: 'inset 0 1px 0 rgba(53,201,182,0.15)' }}>
            {/* Cabecera de la sesión */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-niebla/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-pulso/10 text-pulso flex items-center justify-center">
                  <CalendarClock size={18} />
                </div>
                <div>
                  <div className="font-display font-bold text-hueso capitalize">{fmtFecha(s.fecha)}</div>
                  <div className="text-[11px] font-mono text-niebla-oscura uppercase tracking-[0.15em]">
                    {TIPO_LABEL[s.tipo_comite] || s.tipo_comite} · {s.estado}
                  </div>
                </div>
              </div>
              <span className="text-[11px] font-mono px-2 py-1 rounded bg-hueso/5 text-niebla">
                {s.casos.length} {s.casos.length === 1 ? 'caso' : 'casos'}
              </span>
            </div>

            {/* Casos de la sesión (orden del día) */}
            <div className="space-y-2">
              {s.casos.map((c, idx) => (
                <div key={c.id}
                     className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-niebla/10"
                     style={{ background: 'rgba(243,239,231,0.02)' }}>
                  <span className="text-[11px] font-mono text-niebla-oscura w-5 text-center shrink-0">{idx + 1}</span>
                  <User size={16} className="text-niebla-oscura shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-hueso truncate">{c.pacientes?.nombre || 'Sin nombre'}</div>
                    <div className="text-xs text-niebla-oscura truncate">
                      {c.pacientes?.documento || '—'}{c.motivo ? ` · ${c.motivo}` : ''}
                    </div>
                  </div>
                  <button onClick={() => navigate(`/presentar/${c.id}`)} title="Editar caso"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-niebla border border-niebla/20 hover:text-hueso hover:border-niebla/40 transition-colors shrink-0">
                    <Pencil size={13} /> Editar
                  </button>
                  <button onClick={() => navigate(`/casos/${c.id}/acta`)} title="Presentar y decidir en comité"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-tinta bg-pulso hover:bg-pulso-oscuro transition-colors shrink-0">
                    <Gavel size={13} /> Presentar
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {sesiones.length > 0 && (
        <p className="text-center text-xs text-niebla-oscura">
          {totalCasos} {totalCasos === 1 ? 'caso agendado' : 'casos agendados'} · Editar para completar · Presentar para llevarlo a la mesa
        </p>
      )}
    </div>
  )
}
