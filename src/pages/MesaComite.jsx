import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatDateTime, generarTextoHistoriaClinica } from '../lib/utils'
import { copiarTextoAlPortapapeles } from '../lib/clipboard'
import ActaDocumento from '../components/ActaDocumento'
import AdjuntosVisor from '../components/AdjuntosVisor'
import { agregarAdjuntosACaso } from '../lib/adjuntos'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Gavel, Printer, Plus, X, Lock,
  Loader2, ClipboardList, MessagesSquare, Users, FileSignature, ClipboardCopy, Paperclip, FileText,
  ChevronLeft, ChevronRight, Maximize2, Minimize2,
} from 'lucide-react'

const INTENCION_OPTS = [
  { value: 'curativa',     label: 'Curativa' },
  { value: 'paliativa',    label: 'Paliativa' },
  { value: 'neoadyuvante', label: 'Neoadyuvante' },
  { value: 'adyuvante',    label: 'Adyuvante' },
]

const DECISION_FINAL_OPTS = [
  { value: 'aprobado',       label: 'Aprobado' },
  { value: 'rechazado',      label: 'Rechazado' },
  { value: 'modificado',     label: 'Aprobado con modificaciones' },
  { value: 'diferido',       label: 'Diferido' },
  { value: 'pendiente_info', label: 'Pendiente de información' },
]

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
const ROL_LABEL = Object.fromEntries(ROL_OPTS.map(o => [o.value, o.label]))

const DECISION_BADGE = {
  pendiente:      'bg-amber-100 text-amber-800 ring-amber-300',
  aprobado:       'bg-emerald-100 text-emerald-800 ring-emerald-300',
  rechazado:      'bg-rose-100 text-rose-800 ring-rose-300',
  modificado:     'bg-blue-100 text-blue-800 ring-blue-300',
  diferido:       'bg-slate-200 text-slate-800 ring-slate-400',
  pendiente_info: 'bg-purple-100 text-purple-800 ring-purple-300',
}
const DECISION_LABEL = {
  pendiente: 'Pendiente de comité', aprobado: 'Aprobado', rechazado: 'Rechazado',
  modificado: 'Aprobado con modif.', diferido: 'Diferido', pendiente_info: 'Pendiente info',
}

const inputBase = 'w-full px-3 py-2 border-2 border-slate-300 bg-white rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-600'

const emptyForm = {
  resumen_clinico: '',
  discusion: '',
  decision: '',
  intencion: '',
  decision_final: '',
  observaciones: '',
  costo_aprobado: '',   // costo que el comité aprobó (casos_comite.costo_molecula_aprobada)
  frecuencia_seguimiento: 'trimestral', // casos_comite.frecuencia_seguimiento
  participantes: [],
}

const FRECUENCIA_OPTS = [
  { value: 'trimestral',    label: 'Trimestral (cada 3 meses)' },
  { value: 'cuatrimestral', label: 'Cuatrimestral (cada 4 meses)' },
  { value: 'semestral',     label: 'Semestral (cada 6 meses)' },
]

const esAprobacionFinal = (d) => d === 'aprobado' || d === 'modificado'

// Costo aprobado inicial: el ya aprobado, o el propuesto como respaldo (string para el input)
const costoAprobadoInicial = (caso) => {
  const v = caso?.costo_molecula_aprobada ?? caso?.costo_estimado
  return v == null ? '' : String(v)
}

export default function MesaComite() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [caso, setCaso] = useState(null)
  const [acta, setActa] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [roster, setRoster] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState(false)
  // Presentación por temas: una sección a la vez, a pantalla completa
  const [seccion, setSeccion] = useState(0)
  const [pantallaCompleta, setPantallaCompleta] = useState(false)
  const totalSecciones = 6

  useEffect(() => { cargarDatos() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Flechas ← → cambian de tema, salvo mientras se escribe en un campo
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return
      if (e.key === 'ArrowRight') setSeccion(i => Math.min(i + 1, totalSecciones - 1))
      if (e.key === 'ArrowLeft')  setSeccion(i => Math.max(i - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [totalSecciones])

  useEffect(() => {
    const onChange = () => setPantallaCompleta(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const togglePantallaCompleta = () => {
    if (document.fullscreenElement) document.exitFullscreen?.()
    else document.documentElement.requestFullscreen?.().catch(() => toast.error('El navegador no permitió la pantalla completa'))
  }

  async function cargarDatos() {
    setLoading(true)
    try {
      const [casoRes, actaRes, rosterRes] = await Promise.all([
        supabase
          .from('casos_comite')
          .select('*, paciente:pacientes(*, eps:eps(nombre)), sesion:sesiones_comite(fecha, tipo_comite)')
          .eq('id', id)
          .single(),
        supabase
          .from('actas_comite')
          .select('*')
          .eq('caso_id', id)
          .maybeSingle(),
        supabase
          .from('participantes_comite')
          .select('id, nombre, rol, especialidad, registro, firma_path')
          .eq('activo', true)
          .order('nombre', { ascending: true }),
      ])

      if (casoRes.error) throw casoRes.error
      setCaso(casoRes.data)
      if (!rosterRes.error) setRoster(rosterRes.data || [])

      if (actaRes.error) throw actaRes.error
      if (actaRes.data) {
        setActa(actaRes.data)
        setForm({
          resumen_clinico: actaRes.data.resumen_clinico || '',
          discusion:       actaRes.data.discusion || '',
          decision:        actaRes.data.decision || '',
          intencion:       actaRes.data.intencion || '',
          decision_final:  actaRes.data.decision_final || '',
          observaciones:   actaRes.data.observaciones || '',
          costo_aprobado:  costoAprobadoInicial(casoRes.data),
          frecuencia_seguimiento: casoRes.data.frecuencia_seguimiento || 'trimestral',
          participantes:   Array.isArray(actaRes.data.participantes) ? actaRes.data.participantes : [],
        })
      } else {
        // Acta nueva: pre-llenar el resumen con los datos del caso
        setActa(null)
        setForm({
          ...emptyForm,
          resumen_clinico: generarResumenClinico(casoRes.data),
          costo_aprobado: costoAprobadoInicial(casoRes.data),
          frecuencia_seguimiento: casoRes.data.frecuencia_seguimiento || 'trimestral',
        })
      }
    } catch (e) {
      toast.error(`No se pudo cargar la mesa de comité: ${e.message}`)
      navigate(`/casos/${id}`)
    } finally {
      setLoading(false)
    }
  }

  const readOnly = acta?.firmada === true

  const setField = (key, value) => setForm(f => ({ ...f, [key]: value }))

  // Persiste en el caso el costo aprobado y la frecuencia de seguimiento.
  // Si la decisión no es una aprobación (o el valor es inválido), el costo se limpia a null.
  async function persistirCostoAprobado() {
    const raw = form.costo_aprobado
    const costo = esAprobacionFinal(form.decision_final)
      && raw !== '' && raw != null && !isNaN(Number(raw))
        ? Number(raw)
        : null
    const { error } = await supabase
      .from('casos_comite')
      .update({ costo_molecula_aprobada: costo, frecuencia_seguimiento: form.frecuencia_seguimiento || 'trimestral' })
      .eq('id', Number(id))
    if (error) throw error
  }

  function handleRegenerarResumen() {
    if (!window.confirm('¿Sobrescribir el resumen actual con los datos más recientes del caso?')) return
    setForm(prev => ({ ...prev, resumen_clinico: generarResumenClinico(caso) }))
    toast.success('Resumen regenerado')
  }

  // Marca / desmarca la asistencia de un miembro del roster.
  const toggleAsistio = (miembro) =>
    setForm(f => {
      const yaEsta = f.participantes.some(p => p.participante_id === miembro.id)
      const participantes = yaEsta
        ? f.participantes.filter(p => p.participante_id !== miembro.id)
        : [...f.participantes, {
            participante_id: miembro.id,
            nombre: miembro.nombre,
            rol: miembro.rol || '',
            especialidad: miembro.especialidad || '',
            registro: miembro.registro || '',
            firma_path: miembro.firma_path || null,
          }]
      return { ...f, participantes }
    })

  // Hash SHA-256 del contenido del acta (evidencia de integridad al firmar).
  async function hashActa() {
    const canonical = JSON.stringify({
      resumen_clinico: form.resumen_clinico,
      discusion: form.discusion,
      decision: form.decision,
      intencion: form.intencion,
      decision_final: form.decision_final,
      asistentes: form.participantes.map(p => p.participante_id ?? p.nombre),
    })
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
  }

  function buildPayload(firmada, extra = {}) {
    const participantes = form.participantes
      .map(p => ({
        participante_id: p.participante_id ?? null,
        nombre: (p.nombre || '').trim(),
        rol: p.rol || '',
        especialidad: (p.especialidad || '').trim(),
        registro: p.registro || '',
        firma_path: p.firma_path || null,
        fecha_firma: firmada ? (p.fecha_firma || new Date().toISOString()) : (p.fecha_firma || null),
      }))
      .filter(p => p.nombre)
    return {
      caso_id: Number(id),
      resumen_clinico: form.resumen_clinico,
      discusion: form.discusion,
      decision: form.decision,
      intencion: form.intencion || null,
      decision_final: form.decision_final || null,
      observaciones: form.observaciones || null,
      participantes,
      firmada,
      ...extra,
    }
  }

  async function guardarBorrador() {
    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('actas_comite')
        .upsert(buildPayload(false), { onConflict: 'caso_id' })
        .select()
        .single()
      if (error) throw error
      setActa(data)
      await persistirCostoAprobado()
      toast.success('Borrador guardado')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function firmar() {
    if (form.participantes.length === 0) {
      toast.error('Marca al menos un asistente antes de firmar el acta')
      return
    }
    const ok = window.confirm(
      'Al firmar, el acta queda bloqueada con la firma de los asistentes y se actualiza la decisión del caso. ¿Continuar?'
    )
    if (!ok) return
    setSaving(true)
    try {
      const { data: userData } = await supabase.auth.getUser()
      const cerrada_por = userData?.user?.email || userData?.user?.id || null
      const hash_contenido = await hashActa()
      // Antes de firmar: el trigger de aprobación programa los seguimientos con esta frecuencia
      await persistirCostoAprobado()
      const { error } = await supabase
        .from('actas_comite')
        .upsert(buildPayload(true, { cerrada_por, hash_contenido }), { onConflict: 'caso_id' })
      if (error) throw error
      // Firmar el acta = el caso fue presentado en comité: sale de la agenda
      await supabase.from('casos_comite').update({ presentado: true }).eq('id', Number(id))
      toast.success('Acta firmada y caso actualizado')
      await cargarDatos()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function copiarAHistoriaClinica() {
    // Copiar el estado en pantalla (form), incluyendo cambios sin guardar.
    // Se conserva fecha_firma del acta guardada si existe.
    const actaEnPantalla = {
      discusion: form.discusion,
      decision: form.decision,
      intencion: form.intencion,
      decision_final: form.decision_final,
      participantes: form.participantes,
      fecha_firma: acta?.fecha_firma ?? null,
    }
    const texto = generarTextoHistoriaClinica(caso, actaEnPantalla)
    try {
      await copiarTextoAlPortapapeles(texto)
      toast.success('Texto copiado. Pégalo en la historia clínica.')
    } catch {
      toast.error('No se pudo copiar automáticamente. Texto: ' + texto, { duration: 12000 })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    )
  }
  if (!caso) return null

  // Vista de documento: acta firmada (solo lectura) o vista previa del borrador.
  if (readOnly || preview) {
    return (
      <div className="max-w-5xl mx-auto p-4 lg:p-6 print:p-0 print:max-w-full">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6 no-print">
          {readOnly ? (
            <button onClick={() => navigate(`/casos/${id}`)}
              className="flex items-center gap-2 text-sm text-slate-300 hover:text-white font-medium">
              <ArrowLeft className="w-4 h-4" /> Volver al caso
            </button>
          ) : (
            <button onClick={() => setPreview(false)}
              className="flex items-center gap-2 text-sm text-slate-300 hover:text-white font-medium">
              <ArrowLeft className="w-4 h-4" /> Volver a editar
            </button>
          )}
          <div className="flex items-center gap-2">
            {readOnly && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ring-1 bg-emerald-100 text-emerald-800 ring-emerald-300">
                <Lock className="w-3.5 h-3.5" />
                Acta firmada el {formatDateTime(acta.fecha_firma)}
              </span>
            )}
            {/* La historia clínica solo recibe el acta ya firmada */}
            {readOnly && (
              <button onClick={copiarAHistoriaClinica}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-800 font-semibold text-sm hover:bg-slate-50">
                <ClipboardCopy className="w-4 h-4" /> Copiar a historia clínica
              </button>
            )}
            <button onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-pulso text-tinta font-semibold text-sm hover:bg-pulso-oscuro">
              <Printer className="w-4 h-4" /> Imprimir / PDF
            </button>
            {/* Acta cerrada: seguir con los demás casos de la sesión */}
            {readOnly && (
              <button onClick={() => navigate('/agenda')}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700">
                <Gavel className="w-4 h-4" /> Volver al comité
              </button>
            )}
          </div>
        </div>
        <ActaDocumento caso={caso} form={form} acta={acta} />
      </div>
    )
  }

  const badgeColor = DECISION_BADGE[caso.decision] || DECISION_BADGE.pendiente
  const badgeLabel = DECISION_LABEL[caso.decision] || caso.decision
  const diagnostico = [caso.cie10, caso.diagnostico_descripcion].filter(Boolean).join(' — ')

  const textoGrande = `${inputBase} resize-none flex-1 min-h-[16rem] !text-lg leading-relaxed`
  const secciones = [
    {
      key: 'resumen', title: 'Resumen clínico', icon: ClipboardList,
      actions: !readOnly && (
        <button type="button" onClick={handleRegenerarResumen}
          className="text-xs text-blue-600 hover:underline">
          Regenerar desde caso
        </button>
      ),
      content: (
        <textarea
          value={form.resumen_clinico}
          onChange={e => setField('resumen_clinico', e.target.value)}
          disabled={readOnly}
          placeholder="Síntesis del caso para el comité..."
          className={textoGrande} />
      ),
    },
    {
      key: 'adjuntos', title: `Adjuntos${caso.adjuntos?.length ? ` (${caso.adjuntos.length})` : ''}`, icon: Paperclip,
      content: (
        <AdjuntosVisor adjuntos={caso.adjuntos || []}
          onSubidos={readOnly ? undefined : async (nuevos) => {
            const adjuntos = await agregarAdjuntosACaso(caso.id, caso.adjuntos, nuevos)
            setCaso(c => ({ ...c, adjuntos }))
          }} />
      ),
    },
    {
      key: 'discusion', title: 'Discusión', icon: MessagesSquare,
      content: (
        <textarea
          value={form.discusion}
          onChange={e => setField('discusion', e.target.value)}
          disabled={readOnly}
          placeholder="Puntos discutidos durante el comité..."
          className={textoGrande} />
      ),
    },
    {
      key: 'asistencia', title: 'Asistencia y firmas', icon: Users,
      content: readOnly
        ? <FirmasView participantes={form.participantes} cerradaPor={acta?.cerrada_por} />
        : <AsistenciaEditor roster={roster} seleccionados={form.participantes} onToggle={toggleAsistio} />,
    },
    {
      key: 'decision', title: 'Decisión', icon: FileSignature,
      content: (
        <div className="flex-1 flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">Intención</label>
              <select
                value={form.intencion}
                onChange={e => setField('intencion', e.target.value)}
                disabled={readOnly} className={`${inputBase} !text-base`}>
                <option value="">Seleccione...</option>
                {INTENCION_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">Decisión final</label>
              <select
                value={form.decision_final}
                onChange={e => setField('decision_final', e.target.value)}
                disabled={readOnly} className={`${inputBase} !text-base`}>
                <option value="">Seleccione...</option>
                {DECISION_FINAL_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          {esAprobacionFinal(form.decision_final) && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                Costo aprobado por el comité <span className="normal-case text-slate-500">(por ciclo, COP)</span>
              </label>
              <input
                type="number" min="0"
                value={form.costo_aprobado}
                onChange={e => setField('costo_aprobado', e.target.value)}
                disabled={readOnly}
                placeholder={caso.costo_estimado != null ? `Propuesto: ${caso.costo_estimado}` : 'Ej. 2500000'}
                className={`${inputBase} !text-base`} />
              <p className="text-xs text-slate-500 mt-1">
                Precargado con el costo propuesto. Cámbialo solo si el comité aprobó un monto distinto — mayor o menor.
              </p>
            </div>
          )}
          {esAprobacionFinal(form.decision_final) && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">Frecuencia de seguimiento</label>
              <select
                value={form.frecuencia_seguimiento}
                onChange={e => setField('frecuencia_seguimiento', e.target.value)}
                disabled={readOnly} className={`${inputBase} !text-base`}>
                {FRECUENCIA_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <p className="text-xs text-slate-500 mt-1">
                Siempre se programa el seguimiento post-comité; luego los controles con esta frecuencia. Se puede cambiar después en Seguimientos.
              </p>
            </div>
          )}
          <div className="flex-1 flex flex-col">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">Decisión (narrativa)</label>
            <textarea
              value={form.decision}
              onChange={e => setField('decision', e.target.value)}
              disabled={readOnly}
              placeholder="Texto explicativo de la decisión..."
              className={textoGrande} />
          </div>
        </div>
      ),
    },
    {
      key: 'observaciones', title: 'Observaciones', icon: ClipboardList,
      content: (
        <textarea
          value={form.observaciones}
          onChange={e => setField('observaciones', e.target.value)}
          disabled={readOnly}
          placeholder="Observaciones del acta: información al paciente, constancias, salvedades..."
          className={textoGrande} />
      ),
    },
  ].filter(Boolean)
  const actual = Math.min(seccion, secciones.length - 1)
  const sec = secciones[actual]

  return (
    <div className="max-w-7xl mx-auto p-4 lg:p-6 print:p-0 print:max-w-full">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-300 px-6 py-4 mb-4 print:shadow-none print:border print:rounded-none">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4 print:hidden">
          <button onClick={() => navigate(`/casos/${id}`)}
            className="flex items-center gap-2 text-sm text-slate-700 hover:text-slate-900 font-medium">
            <ArrowLeft className="w-4 h-4" /> Volver al caso
          </button>
          <button onClick={() => setPreview(true)}
            className="flex items-center gap-2 text-sm text-blue-700 hover:text-blue-900 font-medium">
            <FileText className="w-4 h-4" /> Vista previa del acta
          </button>
        </div>

        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ring-1 ${badgeColor}`}>
            {badgeLabel}
          </span>
        </div>
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 mb-1">
          {caso.paciente?.nombre || '—'}
        </h1>
        <div className="text-sm text-slate-700 flex flex-wrap gap-x-4 gap-y-1">
          <span>{caso.paciente?.tipo_documento} {caso.paciente?.documento}</span>
          {diagnostico && <span>· {diagnostico}</span>}
        </div>
      </div>

      {/* Temas: navegación */}
      <div className="flex items-center gap-2 mb-4 print:hidden">
        <div className="flex-1 flex gap-1 overflow-x-auto">
          {secciones.map((sec, i) => {
            const Icon = sec.icon
            return (
              <button key={sec.key} type="button" onClick={() => setSeccion(i)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  i === actual ? 'bg-blue-600 text-white' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}>
                <Icon className="w-4 h-4" /> {sec.title}
              </button>
            )
          })}
        </div>
        <button type="button" onClick={togglePantallaCompleta}
          title={pantallaCompleta ? 'Salir de pantalla completa' : 'Pantalla completa'}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 shrink-0">
          {pantallaCompleta ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Tema actual: ocupa toda la pantalla */}
      <SectionCard title={sec.title} icon={sec.icon} actions={sec.actions} fill>
        {sec.content}
      </SectionCard>

      <div className="flex items-center justify-between gap-3 mt-4 print:hidden">
        <button type="button" onClick={() => setSeccion(actual - 1)} disabled={actual === 0}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white border border-slate-300 text-slate-800 text-sm font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
          <ChevronLeft className="w-4 h-4" /> {actual > 0 ? secciones[actual - 1].title : 'Anterior'}
        </button>
        <span className="text-xs font-mono text-slate-500">{actual + 1} / {secciones.length}</span>
        <button type="button" onClick={() => setSeccion(actual + 1)} disabled={actual === secciones.length - 1}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white border border-slate-300 text-slate-800 text-sm font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
          {actual < secciones.length - 1 ? secciones[actual + 1].title : 'Siguiente'} <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Acciones */}
      <div className="flex flex-col sm:flex-row sm:justify-end gap-3 mt-6 print:hidden">
        {readOnly ? (
          <button onClick={() => window.print()}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium">
            <Printer className="w-4 h-4" /> Imprimir acta
          </button>
        ) : (
          <>
            <button onClick={guardarBorrador} disabled={saving}
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-white border border-slate-400 text-slate-800 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Guardar borrador
            </button>
            <button onClick={firmar} disabled={saving}
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gavel className="w-4 h-4" />}
              Firmar y cerrar
            </button>
          </>
        )}
      </div>

      <style>{`
        @media print {
          @page { margin: 1.5cm; size: A4; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
          .print\\:p-0 { padding: 0 !important; }
          .print\\:max-w-full { max-width: 100% !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:rounded-none { border-radius: 0 !important; }
        }
      `}</style>
    </div>
  )
}

function SectionCard({ title, icon: Icon, actions, children, fill }) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-slate-300 p-6 print:shadow-none print:border print:rounded-none ${
      fill ? 'flex flex-col min-h-[calc(100vh-17rem)]' : ''}`}>
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-200">
        <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        {actions && <div className="ml-auto print:hidden">{actions}</div>}
      </div>
      {fill ? <div className="flex-1 flex flex-col">{children}</div> : children}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────
   Generación del resumen clínico a partir del caso
   ────────────────────────────────────────────────────────────── */
const GENERO_RESUMEN = { M: 'Masculino', F: 'Femenino', I: 'Indeterminado' }
const TABACO_RESUMEN = { nunca: 'No fumador', exfumador: 'Exfumador', activo: 'Fumador activo' }
const ALCOHOL_RESUMEN = {
  nunca: 'No consume alcohol', social: 'Consumo social',
  frecuente: 'Consumo frecuente', abuso: 'Abuso/dependencia',
}

const resumenVal = (x) => {
  const s = (x ?? '').toString().trim()
  return s || 'No registrado'
}
const resumenFirst = (...xs) => {
  for (const x of xs) {
    const s = (x ?? '').toString().trim()
    if (s) return s
  }
  return 'No registrado'
}
const resumenCOP = (n) => {
  if (n == null || n === '' || isNaN(Number(n))) return 'No registrado'
  return '$ ' + Number(n).toLocaleString('es-CO') + ' COP'
}
const resumenEdad = (fechaNac) => {
  if (!fechaNac) return null
  const nac = new Date(fechaNac)
  if (isNaN(nac.getTime())) return null
  const hoy = new Date()
  let edad = hoy.getFullYear() - nac.getFullYear()
  const m = hoy.getMonth() - nac.getMonth()
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--
  return edad >= 0 ? edad : null
}

function generarResumenClinico(caso) {
  if (!caso) return ''
  const p = caso.paciente || {}

  // PACIENTE
  const edad = resumenEdad(p.fecha_nacimiento)
  const edadTxt = edad == null ? 'Edad no registrada' : `${edad} años`
  const sexo = GENERO_RESUMEN[p.genero] || 'No registrado'
  const paciente = `PACIENTE: ${resumenVal(p.nombre)}, ${edadTxt}, ${sexo}`

  // DIAGNÓSTICO (omitir guión si falta cie10 o descripción)
  const diag = [caso.cie10, caso.diagnostico_descripcion]
    .map(x => (x ?? '').toString().trim()).filter(Boolean).join(' - ')

  const bloque1 = [
    paciente,
    `DIAGNÓSTICO: ${diag || 'No registrado'}`,
    `ESTADIO: ${resumenVal(caso.estadio_clinico)} (TNM: ${resumenVal(caso.tnm)})`,
    ...(caso.estadio_observaciones ? [`OBSERVACIÓN ESTADIO: ${caso.estadio_observaciones}`] : []),
    `HISTOLOGÍA: ${caso.histologia || (caso.patologia_observaciones ? `Sin dato (${caso.patologia_observaciones})` : 'No registrado')}`,
    `BIOMARCADORES: ${resumenVal(caso.biomarcadores)}`,
    `MOLECULAR/NGS: ${resumenVal(caso.estudios_moleculares)}`,
  ].join('\n')

  // CAPACIDAD FUNCIONAL / COMORBILIDADES / HÁBITOS
  const tabaco = TABACO_RESUMEN[caso.habito_tabaquico] || caso.habito_tabaquico || 'No registrado'
  const alcohol = ALCOHOL_RESUMEN[caso.habito_alcohol] || caso.habito_alcohol || 'No registrado'
  const evaTxt = caso.eva != null ? `${caso.eva}/10` : 'No registrado'
  const bloque2 = [
    `ECOG: ${resumenVal(caso.ecog)} · EVA: ${evaTxt}`,
    `COMORBILIDADES: ${resumenVal(caso.comorbilidades)}`,
    `HÁBITOS: ${tabaco}, ${alcohol}`,
  ].join('\n')

  // TRATAMIENTOS PREVIOS (omitir modalidades vacías)
  const trat = []
  const pushTrat = (label, valor) => {
    const s = (valor ?? '').toString().trim()
    if (s) trat.push(`- ${label}: ${s}`)
  }
  pushTrat('Línea actual', caso.molecula_previa)
  pushTrat('Quimioterapia y líneas previas', caso.tratamiento_qt)
  pushTrat('Radioterapia', caso.tratamiento_rt)
  pushTrat('Cirugía', caso.tratamiento_quirurgico)
  pushTrat('Terapia dirigida', caso.tratamiento_dirigido)
  if (trat.length === 0) trat.push('- No registrado')
  const bloque3 = ['TRATAMIENTOS PREVIOS:', ...trat].join('\n')

  // VALORACIONES INTERDISCIPLINARIAS
  const valoracion = (label, valorado, concepto) => {
    if (valorado === true) {
      const c = (concepto ?? '').toString().trim()
      return `- ${label}: Sí${c ? ` — ${c}` : ''}`
    }
    if (valorado === false) return `- ${label}: No valorado`
    return `- ${label}: Sin información`
  }
  const bloque4 = [
    'VALORACIONES INTERDISCIPLINARIAS:',
    valoracion('Psicología', caso.valorado_psicologia, caso.concepto_psicologia),
    valoracion('Trabajo social', caso.valorado_trabajo_social, caso.concepto_trabajo_social),
    valoracion('Cuidados paliativos', caso.valorado_paliativos, caso.concepto_paliativos),
  ].join('\n')

  // PREGUNTA AL COMITÉ
  const bloque5 = `PREGUNTA AL COMITÉ:\n${resumenFirst(caso.pregunta_comite, caso.motivo)}`

  // PROPUESTA
  const pfs = caso.pfs_esperado_estudio
  const os = caso.os_esperado_estudio
  const pfsTxt = (pfs == null || pfs === '') ? 'No registrado' : `${pfs} meses`
  const osTxt = (os == null || os === '') ? 'No registrado' : `${os} meses`
  const bloque6 = [
    'PROPUESTA:',
    resumenFirst(caso.tratamiento_propuesto, caso.molecula_propuesta),
    resumenFirst(caso.justificacion_clinica, caso.justificacion),
    `PFS esperado: ${pfsTxt} | OS esperado: ${osTxt}`,
  ].join('\n')

  // COSTOS
  const bloque7 = [
    'COSTOS:',
    `- Costo previo: ${resumenCOP(caso.costo_previo)}`,
    `- Costo propuesto: ${resumenCOP(caso.costo_estimado)}`,
  ].join('\n')

  return [bloque1, bloque2, bloque3, bloque4, bloque5, bloque6, bloque7]
    .join('\n\n').trim()
}

// Selección de asistencia desde el roster de miembros (modo edición).
function AsistenciaEditor({ roster, seleccionados, onToggle }) {
  const isSel = (id) => seleccionados.some(p => p.participante_id === id)
  if (!roster.length) {
    return (
      <p className="text-sm text-slate-600">
        No hay miembros activos. Agrégalos en{' '}
        <Link to="/miembros" className="text-blue-700 font-medium underline">Miembros del comité</Link>{' '}
        y sube sus firmas antes del comité.
      </p>
    )
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        Marca quiénes asistieron. Al firmar el acta se estampa la firma de cada asistente.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {roster.map(m => {
          const sel = isSel(m.id)
          return (
            <label key={m.id}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${sel ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'}`}>
              <input type="checkbox" checked={sel} onChange={() => onToggle(m)} className="w-4 h-4 accent-emerald-600" />
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900 truncate">{m.nombre}</div>
                <div className="text-xs text-slate-500 truncate">
                  {ROL_LABEL[m.rol] || m.rol || 'Sin rol'}{m.especialidad ? ` · ${m.especialidad}` : ''}
                  {!m.firma_path && <span className="text-amber-600"> · sin firma</span>}
                </div>
              </div>
            </label>
          )
        })}
      </div>
    </div>
  )
}

// Bloque de firmas del acta firmada (solo lectura / impresión).
function FirmasView({ participantes, cerradaPor }) {
  if (!participantes.length) {
    return <p className="text-sm text-slate-500 italic">Sin asistentes registrados.</p>
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {participantes.map((p, i) => (
          <div key={i} className="border border-slate-300 rounded-lg p-3">
            <FirmaImg path={p.firma_path} />
            <div className="mt-2 border-t border-slate-300 pt-2">
              <div className="text-sm font-semibold text-slate-900">{p.nombre}</div>
              <div className="text-xs text-slate-500">
                {ROL_LABEL[p.rol] || p.rol || ''}{p.especialidad ? ` · ${p.especialidad}` : ''}
              </div>
              {p.fecha_firma && (
                <div className="text-[11px] text-slate-400 mt-0.5">Firmado: {formatDateTime(p.fecha_firma)}</div>
              )}
            </div>
          </div>
        ))}
      </div>
      {cerradaPor && (
        <p className="text-xs text-slate-500">Acta cerrada por <b>{cerradaPor}</b>.</p>
      )}
    </div>
  )
}

// Firma desde una URL firmada temporal del bucket privado.
function FirmaImg({ path }) {
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
    <div className="h-16 flex items-center justify-center">
      {url
        ? <img src={url} alt="Firma" className="max-h-16 max-w-full object-contain" />
        : <span className="text-xs text-slate-400 italic">{path ? 'Cargando firma…' : 'Sin firma en archivo'}</span>}
    </div>
  )
}
