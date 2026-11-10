import { useState } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { X } from 'lucide-react'

const TIPOS = {
  tumor_solido: 'Tumor sólido',
  hematologico: 'Hematológico',
  multidisciplinario: 'Multidisciplinario',
}

const hoy = () => new Date().toISOString().slice(0, 10)

// Crea una sesión de comité (sesiones_comite). onCreado recibe la sesión creada.
export default function NuevoComiteModal({ onClose, onCreado }) {
  const [fecha, setFecha] = useState('')
  const [tipo, setTipo] = useState('tumor_solido')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)

  const crear = async () => {
    if (!fecha) { toast.error('Elige la fecha del comité'); return }
    setGuardando(true)
    // Evita dos sesiones del mismo tipo el mismo día
    const { data: existe } = await supabase
      .from('sesiones_comite').select('id').eq('fecha', fecha).eq('tipo_comite', tipo).limit(1)
    if (existe?.length) {
      toast.error(`Ya existe un comité ${TIPOS[tipo].toLowerCase()} ese día`)
      setGuardando(false)
      return
    }
    const { data, error } = await supabase
      .from('sesiones_comite')
      .insert({ fecha, tipo_comite: tipo, notas: notas.trim() || null })
      .select('id, fecha, tipo_comite').single()
    setGuardando(false)
    if (error) { toast.error(`Error al crear el comité: ${error.message}`); return }
    toast.success('Comité creado', { icon: '📅' })
    onCreado?.(data)
  }

  const inputCls = 'w-full px-3 py-2 border-2 border-slate-300 rounded-lg text-sm text-slate-900'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 print:hidden"
         onClick={() => !guardando && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl border border-slate-300 w-full max-w-md p-6"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">Nuevo comité</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Fecha del comité</label>
            <input type="date" value={fecha} min={hoy()} onChange={e => setFecha(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo</label>
            <select value={tipo} onChange={e => setTipo(e.target.value)} className={inputCls}>
              {Object.entries(TIPOS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>

        <label className="block text-xs font-semibold text-slate-700 mb-1">Notas (opcional)</label>
        <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
          placeholder="Lugar, hora, enlace de la reunión…" className={`${inputCls} resize-none mb-3`} />

        <p className="text-xs text-slate-500 mb-4">
          Luego podrás agregar casos a este comité desde «Inscribir caso» o desde el detalle de cada caso.
        </p>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={guardando}
            className="px-4 py-2 rounded-lg bg-white border border-slate-400 text-slate-700 hover:bg-slate-50 text-sm">
            Cancelar
          </button>
          <button onClick={crear} disabled={guardando}
            className="px-5 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">
            {guardando ? 'Creando…' : 'Crear comité'}
          </button>
        </div>
      </div>
    </div>
  )
}
