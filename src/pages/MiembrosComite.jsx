import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import {
  Users, Plus, Trash2, Save, Upload, X, PenLine, Loader2, CheckCircle2,
} from 'lucide-react'

const ROL_OPTS = [
  { value: 'oncologo',      label: 'Oncólogo' },
  { value: 'hematologo',    label: 'Hematólogo' },
  { value: 'radiologo',     label: 'Radiólogo' },
  { value: 'patologo',      label: 'Patólogo' },
  { value: 'cirujano',      label: 'Cirujano' },
  { value: 'farmaceutico',  label: 'Farmacéutico' },
  { value: 'gestor',        label: 'Gestor de caso' },
  { value: 'moderador',     label: 'Moderador' },
  { value: 'invitado',      label: 'Invitado' },
  { value: 'otro',          label: 'Otro' },
]
const ROL_LABEL =Object.fromEntries(ROL_OPTS.map(o => [o.value, o.label]))

const inputBase = 'w-full px-3 py-2 border-2 border-slate-300 bg-white rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500'

export default function MiembrosComite() {
  const [miembros, setMiembros] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [nuevo, setNuevo] = useState({ nombre: '', rol: '', especialidad: '', registro: '' })
  const [creando, setCreando] = useState(false)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    const { data, error } = await supabase
      .from('participantes_comite')
      .select('*')
      .order('activo', { ascending: false })
      .order('nombre', { ascending: true })
    if (error) toast.error(error.message)
    else setMiembros(data || [])
    setLoading(false)
  }

  const setLocal = (id, key, value) =>
    setMiembros(ms => ms.map(m => m.id === id ? { ...m, [key]: value } : m))

  async function crear() {
    const nombre = nuevo.nombre.trim()
    if (!nombre) { toast.error('Escribe el nombre del miembro'); return }
    setCreando(true)
    const { error } = await supabase.from('participantes_comite').insert({
      nombre, rol: nuevo.rol || null, especialidad: nuevo.especialidad.trim() || null,
      registro: nuevo.registro?.trim() || null, activo: true,
    })
    setCreando(false)
    if (error) { toast.error(error.message); return }
    setNuevo({ nombre: '', rol: '', especialidad: '', registro: '' })
    toast.success('Miembro agregado')
    cargar()
  }

  async function guardar(m) {
    if (!m.nombre?.trim()) { toast.error('El nombre no puede quedar vacío'); return }
    setSavingId(m.id)
    const { error } = await supabase.from('participantes_comite')
      .update({
        nombre: m.nombre.trim(),
        rol: m.rol || null,
        especialidad: m.especialidad?.trim() || null,
        registro: m.registro?.trim() || null,
        activo: m.activo,
        updated_at: new Date().toISOString(),
      })
      .eq('id', m.id)
    setSavingId(null)
    if (error) { toast.error(error.message); return }
    toast.success('Cambios guardados')
  }

  async function subirFirma(m, file) {
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('La firma debe ser una imagen'); return }
    if (file.size > 2 * 1024 * 1024) { toast.error('La imagen supera 2 MB'); return }
    setSavingId(m.id)
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const path = `${m.id}/firma-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('firmas')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw upErr
      // Borrar la firma anterior si existía
      if (m.firma_path && m.firma_path !== path) {
        await supabase.storage.from('firmas').remove([m.firma_path])
      }
      const { error: updErr } = await supabase.from('participantes_comite')
        .update({ firma_path: path, updated_at: new Date().toISOString() })
        .eq('id', m.id)
      if (updErr) throw updErr
      setLocal(m.id, 'firma_path', path)
      toast.success('Firma cargada')
    } catch (e) {
      toast.error(`No se pudo subir la firma: ${e.message}`)
    } finally {
      setSavingId(null)
    }
  }

  async function quitarFirma(m) {
    if (!m.firma_path) return
    setSavingId(m.id)
    try {
      await supabase.storage.from('firmas').remove([m.firma_path])
      const { error } = await supabase.from('participantes_comite')
        .update({ firma_path: null, updated_at: new Date().toISOString() })
        .eq('id', m.id)
      if (error) throw error
      setLocal(m.id, 'firma_path', null)
      toast.success('Firma eliminada')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSavingId(null)
    }
  }

  async function eliminar(m) {
    if (!window.confirm(`¿Eliminar a "${m.nombre}" del comité? Esta acción no se puede deshacer.`)) return
    if (m.firma_path) await supabase.storage.from('firmas').remove([m.firma_path])
    const { error } = await supabase.from('participantes_comite').delete().eq('id', m.id)
    if (error) { toast.error(error.message); return }
    toast.success('Miembro eliminado')
    cargar()
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Users className="w-6 h-6 text-pulso" /> Miembros del comité
        </h1>
        <p className="text-niebla text-sm mt-1">
          Registra los miembros y sube su firma. Los <b>activos</b> aparecen en la mesa para marcar asistencia
          y firmar el acta. Sube la firma <b>antes del comité</b>.
        </p>
      </div>

      {/* Alta de miembro */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-300 p-5">
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">Agregar miembro</h2>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px_1fr_140px_auto] gap-2">
          <input value={nuevo.nombre} onChange={e => setNuevo(n => ({ ...n, nombre: e.target.value }))}
            placeholder="Nombre completo" className={inputBase} onKeyDown={e => e.key === 'Enter' && crear()} />
          <select value={nuevo.rol} onChange={e => setNuevo(n => ({ ...n, rol: e.target.value }))} className={inputBase}>
            <option value="">Rol...</option>
            {ROL_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input value={nuevo.especialidad} onChange={e => setNuevo(n => ({ ...n, especialidad: e.target.value }))}
            placeholder="Especialidad (opcional)" className={inputBase} onKeyDown={e => e.key === 'Enter' && crear()} />
          <input value={nuevo.registro} onChange={e => setNuevo(n => ({ ...n, registro: e.target.value }))}
            placeholder="Registro (RM)" className={inputBase} onKeyDown={e => e.key === 'Enter' && crear()} />
          <button onClick={crear} disabled={creando}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-pulso text-tinta font-semibold text-sm hover:bg-pulso-oscuro disabled:opacity-50">
            {creando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Agregar
          </button>
        </div>
      </div>

      {/* Listado */}
      {loading ? (
        <div className="text-center text-niebla py-10">Cargando…</div>
      ) : miembros.length === 0 ? (
        <div className="text-center text-niebla py-10 italic">Aún no hay miembros registrados.</div>
      ) : (
        <div className="space-y-3">
          {miembros.map(m => (
            <MiembroCard key={m.id} m={m} saving={savingId === m.id}
              onChange={(k, v) => setLocal(m.id, k, v)}
              onGuardar={() => guardar(m)}
              onSubirFirma={file => subirFirma(m, file)}
              onQuitarFirma={() => quitarFirma(m)}
              onEliminar={() => eliminar(m)} />
          ))}
        </div>
      )}
    </div>
  )
}

function MiembroCard({ m, saving, onChange, onGuardar, onSubirFirma, onQuitarFirma, onEliminar }) {
  const fileRef = useRef(null)
  return (
    <div className={`bg-white rounded-2xl shadow-sm border p-4 ${m.activo ? 'border-slate-300' : 'border-slate-200 opacity-70'}`}>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-start">
        {/* Datos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input value={m.nombre || ''} onChange={e => onChange('nombre', e.target.value)}
            placeholder="Nombre" className={inputBase} />
          <select value={m.rol || ''} onChange={e => onChange('rol', e.target.value)} className={inputBase}>
            <option value="">Rol...</option>
            {ROL_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input value={m.especialidad || ''} onChange={e => onChange('especialidad', e.target.value)}
            placeholder="Especialidad" className={inputBase} />
          <input value={m.registro || ''} onChange={e => onChange('registro', e.target.value)}
            placeholder="Registro médico (RM)" className={inputBase} />
        </div>

        {/* Firma + acciones */}
        <div className="flex items-center gap-3">
          <FirmaPreview path={m.firma_path} />
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={e => { onSubirFirma(e.target.files?.[0]); e.target.value = '' }} />
          <div className="flex flex-col gap-1">
            <button onClick={() => fileRef.current?.click()} disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium hover:bg-slate-200 disabled:opacity-50">
              <Upload className="w-3.5 h-3.5" /> {m.firma_path ? 'Cambiar firma' : 'Subir firma'}
            </button>
            {m.firma_path && (
              <button onClick={onQuitarFirma} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-rose-700 text-xs font-medium hover:bg-rose-50 disabled:opacity-50">
                <X className="w-3.5 h-3.5" /> Quitar firma
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-200">
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input type="checkbox" checked={m.activo} onChange={e => onChange('activo', e.target.checked)}
            className="w-4 h-4 accent-emerald-600" />
          Activo en el comité
        </label>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={onGuardar} disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Guardar
          </button>
          <button onClick={onEliminar} disabled={saving} title="Eliminar miembro"
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-700 hover:bg-rose-50 disabled:opacity-50">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// Muestra la firma desde una URL firmada temporal del bucket privado.
function FirmaPreview({ path }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let vivo = true
    if (!path) { setUrl(null); return }
    supabase.storage.from('firmas').createSignedUrl(path, 300).then(({ data }) => {
      if (vivo) setUrl(data?.signedUrl || null)
    })
    return () => { vivo = false }
  }, [path])

  return (
    <div className="w-28 h-16 rounded-lg border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
      {url
        ? <img src={url} alt="Firma" className="max-h-full max-w-full object-contain" />
        : <span className="text-[10px] text-slate-400 flex flex-col items-center gap-1"><PenLine className="w-4 h-4" /> Sin firma</span>}
    </div>
  )
}
