import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatDateTime } from '../lib/utils'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Gavel, Printer, Plus, X, Lock,
  Loader2, ClipboardList, MessagesSquare, Users, FileSignature,
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
  participantes: [],
}

export default function MesaComite() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [caso, setCaso] = useState(null)
  const [acta, setActa] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { cargarDatos() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function cargarDatos() {
    setLoading(true)
    try {
      const [casoRes, actaRes] = await Promise.all([
        supabase
          .from('casos_comite')
          .select('*, paciente:pacientes(*)')
          .eq('id', id)
          .single(),
        supabase
          .from('actas_comite')
          .select('*')
          .eq('caso_id', id)
          .maybeSingle(),
      ])

      if (casoRes.error) throw casoRes.error
      setCaso(casoRes.data)

      if (actaRes.error) throw actaRes.error
      if (actaRes.data) {
        setActa(actaRes.data)
        setForm({
          resumen_clinico: actaRes.data.resumen_clinico || '',
          discusion:       actaRes.data.discusion || '',
          decision:        actaRes.data.decision || '',
          intencion:       actaRes.data.intencion || '',
          decision_final:  actaRes.data.decision_final || '',
          participantes:   Array.isArray(actaRes.data.participantes) ? actaRes.data.participantes : [],
        })
      } else {
        // Acta nueva: pre-llenar el resumen con los datos del caso
        setActa(null)
        setForm({ ...emptyForm, resumen_clinico: generarResumenClinico(casoRes.data) })
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

  function handleRegenerarResumen() {
    if (!window.confirm('¿Sobrescribir el resumen actual con los datos más recientes del caso?')) return
    setForm(prev => ({ ...prev, resumen_clinico: generarResumenClinico(caso) }))
    toast.success('Resumen regenerado')
  }

  const addParticipante = () =>
    setForm(f => ({ ...f, participantes: [...f.participantes, { nombre: '', rol: '', especialidad: '' }] }))

  const updateParticipante = (i, key, value) =>
    setForm(f => ({
      ...f,
      participantes: f.participantes.map((p, idx) => idx === i ? { ...p, [key]: value } : p),
    }))

  const removeParticipante = (i) =>
    setForm(f => ({ ...f, participantes: f.participantes.filter((_, idx) => idx !== i) }))

  function buildPayload(firmada) {
    const participantes = form.participantes
      .map(p => ({
        nombre: (p.nombre || '').trim(),
        rol: p.rol || '',
        especialidad: (p.especialidad || '').trim(),
      }))
      .filter(p => p.nombre)
    return {
      caso_id: Number(id),
      resumen_clinico: form.resumen_clinico,
      discusion: form.discusion,
      decision: form.decision,
      intencion: form.intencion || null,
      decision_final: form.decision_final || null,
      participantes,
      firmada,
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
      toast.success('Borrador guardado')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function firmar() {
    const ok = window.confirm(
      'Al firmar, el acta queda bloqueada y se actualiza la decisión del caso. ¿Continuar?'
    )
    if (!ok) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('actas_comite')
        .upsert(buildPayload(true), { onConflict: 'caso_id' })
      if (error) throw error
      toast.success('Acta firmada y caso actualizado')
      await cargarDatos()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
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

  const badgeColor = DECISION_BADGE[caso.decision] || DECISION_BADGE.pendiente
  const badgeLabel = DECISION_LABEL[caso.decision] || caso.decision
  const diagnostico = [caso.cie10, caso.diagnostico_descripcion].filter(Boolean).join(' — ')

  return (
    <div className="max-w-5xl mx-auto p-4 lg:p-6 print:p-0 print:max-w-full">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-300 p-6 mb-6 print:shadow-none print:border print:rounded-none">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4 print:hidden">
          <button onClick={() => navigate(`/casos/${id}`)}
            className="flex items-center gap-2 text-sm text-slate-700 hover:text-slate-900 font-medium">
            <ArrowLeft className="w-4 h-4" /> Volver al caso
          </button>
          {readOnly && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ring-1 bg-emerald-100 text-emerald-800 ring-emerald-300">
              <Lock className="w-3.5 h-3.5" />
              Acta firmada el {formatDateTime(acta.fecha_firma)}
            </span>
          )}
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

      {/* Secciones */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Resumen clínico" icon={ClipboardList}
          actions={!readOnly && (
            <button type="button" onClick={handleRegenerarResumen}
              className="text-xs text-blue-600 hover:underline">
              Regenerar desde caso
            </button>
          )}>
          <textarea
            value={form.resumen_clinico}
            onChange={e => setField('resumen_clinico', e.target.value)}
            disabled={readOnly} rows={8}
            placeholder="Síntesis del caso para el comité..."
            className={`${inputBase} resize-none`} />
        </SectionCard>

        <SectionCard title="Discusión" icon={MessagesSquare}>
          <textarea
            value={form.discusion}
            onChange={e => setField('discusion', e.target.value)}
            disabled={readOnly} rows={8}
            placeholder="Puntos discutidos durante el comité..."
            className={`${inputBase} resize-none`} />
        </SectionCard>

        <SectionCard title="Participantes" icon={Users}>
          <ParticipantesEditor
            value={form.participantes}
            readOnly={readOnly}
            onAdd={addParticipante}
            onUpdate={updateParticipante}
            onRemove={removeParticipante} />
        </SectionCard>

        <SectionCard title="Decisión" icon={FileSignature}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">Intención</label>
              <select
                value={form.intencion}
                onChange={e => setField('intencion', e.target.value)}
                disabled={readOnly} className={inputBase}>
                <option value="">Seleccione...</option>
                {INTENCION_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">Decisión final</label>
              <select
                value={form.decision_final}
                onChange={e => setField('decision_final', e.target.value)}
                disabled={readOnly} className={inputBase}>
                <option value="">Seleccione...</option>
                {DECISION_FINAL_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">Decisión (narrativa)</label>
              <textarea
                value={form.decision}
                onChange={e => setField('decision', e.target.value)}
                disabled={readOnly} rows={4}
                placeholder="Texto explicativo de la decisión..."
                className={`${inputBase} resize-none`} />
            </div>
          </div>
        </SectionCard>
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

function SectionCard({ title, icon: Icon, actions, children }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-300 p-6 print:shadow-none print:border print:rounded-none">
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-200">
        <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        {actions && <div className="ml-auto print:hidden">{actions}</div>}
      </div>
      {children}
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
    `HISTOLOGÍA: ${resumenVal(caso.histologia)}`,
    `BIOMARCADORES: ${resumenVal(caso.biomarcadores)}`,
  ].join('\n')

  // ECOG / COMORBILIDADES / HÁBITOS
  const tabaco = TABACO_RESUMEN[caso.habito_tabaquico] || 'No registrado'
  const alcohol = ALCOHOL_RESUMEN[caso.habito_alcohol] || 'No registrado'
  const bloque2 = [
    `ECOG: ${resumenVal(caso.ecog)}`,
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

function ParticipantesEditor({ value, readOnly, onAdd, onUpdate, onRemove }) {
  return (
    <div className="space-y-3">
      {value.length === 0 && (
        <p className="text-sm text-slate-500 italic">Sin participantes registrados.</p>
      )}
      {value.map((p, i) => (
        <div key={i} className="bg-slate-50 rounded-lg border border-slate-200 p-3">
          <div className="flex items-start gap-2">
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                value={p.nombre || ''}
                onChange={e => onUpdate(i, 'nombre', e.target.value)}
                disabled={readOnly} placeholder="Nombre"
                className={inputBase} />
              <select
                value={p.rol || ''}
                onChange={e => onUpdate(i, 'rol', e.target.value)}
                disabled={readOnly} className={inputBase}>
                <option value="">Rol...</option>
                {ROL_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <input
                value={p.especialidad || ''}
                onChange={e => onUpdate(i, 'especialidad', e.target.value)}
                disabled={readOnly} placeholder="Especialidad"
                className={inputBase} />
            </div>
            {!readOnly && (
              <button onClick={() => onRemove(i)} title="Eliminar participante"
                className="shrink-0 mt-1 p-1.5 rounded-lg text-slate-500 hover:text-rose-700 hover:bg-rose-50">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      ))}
      {!readOnly && (
        <button onClick={onAdd}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-400 text-slate-800 hover:bg-slate-50 text-sm font-medium">
          <Plus className="w-4 h-4" /> Agregar participante
        </button>
      )}
    </div>
  )
}
