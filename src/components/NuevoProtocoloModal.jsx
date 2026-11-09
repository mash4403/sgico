import { useState } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { X } from 'lucide-react'
import { TIPOS_EVIDENCIA } from '../lib/evidencia'
import { TIPOS_DURACION } from '../lib/duracion'


const SELECT_COLS = 'id, nombre, estudio_pivotal, pfs_esperado_meses, os_esperado_meses, tipo_evidencia, evidencia_link, tipo_duracion, ciclos_esquema, dias_ciclo'

const numOrNull = (v) => {
  const s = String(v ?? '').replace(',', '.').trim()
  return s === '' || isNaN(Number(s)) ? null : Number(s)
}

// Alta rápida de un protocolo en el catálogo (queda activo para todos los casos).
// `inicial` permite precargar el CIE-10 y el diagnóstico del caso.
export default function NuevoProtocoloModal({ inicial = {}, onClose, onCreado }) {
  const [f, setF] = useState({
    nombre: '', estudio_pivotal: '', tipo_evidencia: 'fase_3', evidencia_link: '',
    linea_tratamiento: '', pfs_esperado_meses: '', os_esperado_meses: '',
    cie10: inicial.cie10 || '', diagnostico: inicial.diagnostico || '',
    tipo_duracion: 'hasta_progresion', ciclos_esquema: '', dias_ciclo: '',
  })
  const [guardando, setGuardando] = useState(false)
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }))

  const crear = async () => {
    if (!f.nombre.trim()) { toast.error('Escribe el nombre del protocolo'); return }
    if (!f.estudio_pivotal.trim()) { toast.error('Escribe el estudio que lo soporta'); return }
    if (f.tipo_duracion !== 'hasta_progresion' && !(numOrNull(f.ciclos_esquema) > 0)) {
      toast.error('Indica el número de ciclos del esquema'); return
    }
    setGuardando(true)
    const { data, error } = await supabase.from('protocolos').insert({
      nombre: f.nombre.trim(),
      estudio_pivotal: f.estudio_pivotal.trim(),
      tipo_evidencia: f.tipo_evidencia,
      evidencia_link: f.evidencia_link.trim() || null,
      linea_tratamiento: numOrNull(f.linea_tratamiento),
      pfs_esperado_meses: numOrNull(f.pfs_esperado_meses),
      os_esperado_meses: numOrNull(f.os_esperado_meses),
      tipo_duracion: f.tipo_duracion,
      ciclos_esquema: f.tipo_duracion !== 'hasta_progresion' ? Math.round(numOrNull(f.ciclos_esquema)) : null,
      dias_ciclo: numOrNull(f.dias_ciclo) ? Math.round(numOrNull(f.dias_ciclo)) : null,
      cie10: f.cie10.trim().toUpperCase() || null,
      diagnostico: f.diagnostico.trim().slice(0, 200) || null,
      activo: true,
    }).select(SELECT_COLS).single()
    setGuardando(false)
    if (error) { toast.error(`Error al crear el protocolo: ${error.message}`); return }
    toast.success('Protocolo agregado al catálogo')
    onCreado?.(data)
  }

  const inputCls = 'w-full px-3 py-2 border-2 border-slate-300 rounded-lg text-sm text-slate-900 bg-white'
  const lbl = 'block text-xs font-semibold text-slate-700 mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 print:hidden"
         onClick={() => !guardando && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl border border-slate-300 w-full max-w-lg p-6"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">Agregar protocolo al catálogo</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={lbl}>Nombre del protocolo / régimen <span className="text-red-600">*</span></label>
            <input value={f.nombre} onChange={e => set('nombre', e.target.value)} maxLength={200}
              placeholder="Ej. Pembrolizumab + quimioterapia (1ª línea)" className={inputCls} autoFocus />
          </div>
          <div>
            <label className={lbl}>Estudio que lo soporta <span className="text-red-600">*</span></label>
            <input value={f.estudio_pivotal} onChange={e => set('estudio_pivotal', e.target.value)} maxLength={200}
              placeholder="Ej. KEYNOTE-189" className={inputCls} />
          </div>
          <div>
            <label className={lbl}>Tipo de estudio <span className="text-red-600">*</span></label>
            <select value={f.tipo_evidencia} onChange={e => set('tipo_evidencia', e.target.value)} className={inputCls}>
              {TIPOS_EVIDENCIA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className={lbl}>Enlace al estudio (DOI / PubMed)</label>
            <input value={f.evidencia_link} onChange={e => set('evidencia_link', e.target.value)}
              placeholder="https://doi.org/..." className={inputCls} />
          </div>
          <div>
            <label className={lbl}>PFS esperado (meses)</label>
            <input type="number" step="0.1" min="0" value={f.pfs_esperado_meses}
              onChange={e => set('pfs_esperado_meses', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={lbl}>OS esperado (meses)</label>
            <input type="number" step="0.1" min="0" value={f.os_esperado_meses}
              onChange={e => set('os_esperado_meses', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={lbl}>Duración del tratamiento</label>
            <select value={f.tipo_duracion} onChange={e => set('tipo_duracion', e.target.value)} className={inputCls}>
              {TIPOS_DURACION.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lbl}>{f.tipo_duracion === 'tope' ? 'Máx. ciclos' : 'Ciclos'}{f.tipo_duracion !== 'hasta_progresion' && <span className="text-red-600"> *</span>}</label>
              <input type="number" min="1" step="1" value={f.ciclos_esquema} disabled={f.tipo_duracion === 'hasta_progresion'}
                onChange={e => set('ciclos_esquema', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={lbl}>Días del ciclo</label>
              <input type="number" min="1" step="1" value={f.dias_ciclo} placeholder="21"
                onChange={e => set('dias_ciclo', e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={lbl}>CIE-10</label>
            <input value={f.cie10} onChange={e => set('cie10', e.target.value)} maxLength={10} className={inputCls} />
          </div>
          <div>
            <label className={lbl}>Línea de tratamiento</label>
            <select value={f.linea_tratamiento} onChange={e => set('linea_tratamiento', e.target.value)} className={inputCls}>
              <option value="">—</option>
              {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}ª línea</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className={lbl}>Diagnóstico</label>
            <input value={f.diagnostico} onChange={e => set('diagnostico', e.target.value)} maxLength={200} className={inputCls} />
          </div>
        </div>

        <p className="text-xs text-slate-500 mt-3 mb-4">
          Queda en el catálogo para todos los casos y se selecciona en este caso.
        </p>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={guardando}
            className="px-4 py-2 rounded-lg bg-white border border-slate-400 text-slate-700 hover:bg-slate-50 text-sm">
            Cancelar
          </button>
          <button onClick={crear} disabled={guardando}
            className="px-5 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">
            {guardando ? 'Guardando…' : 'Agregar y seleccionar'}
          </button>
        </div>
      </div>
    </div>
  )
}
