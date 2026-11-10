import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { mensajeCostoPrevio, mensajeSinDiferencial } from '../lib/utils'
import { buscarCIE10, CIE10_INDEX } from '../lib/cie10'
import { buscarHistologia } from '../lib/histologia'
import toast from 'react-hot-toast'
import NuevoProtocoloModal from '../components/NuevoProtocoloModal'
import { TIPOS_EVIDENCIA } from '../lib/evidencia'
import { AdjuntosPorCategoria } from '../components/AdjuntosVisor'
import { eliminarArchivoAdjunto } from '../lib/adjuntos'
import { TIPOS_DURACION, ciclosSegunDuracion, etiquetaCiclos } from '../lib/duracion'
import { superficieCorporal, imc, categoriaImc, errorAntropometria, aNumero, RANGO_PESO, RANGO_TALLA } from '../lib/antropometria'
import {
  ChevronLeft, ChevronRight, Send, Check,
  Building2, User, Stethoscope, HeartPulse, FlaskConical,
  Pill, BookOpen, MessageSquareQuote, DollarSign, Paperclip, FileCheck2,
  Users, CalendarPlus, X, Activity,
} from 'lucide-react'

const TIPO_COMITE_OPTS = [
  { value: 'tumor_solido', label: 'Tumor sólido' },
  { value: 'hematologico', label: 'Hematológico' },
  { value: 'multidisciplinario', label: 'Multidisciplinario' },
]

const STEPS = [
  { id: 'admin',       label: 'Administrativo',  icon: Building2 },
  { id: 'demograf',    label: 'Demográficos',    icon: User },
  { id: 'diagnostico', label: 'Diagnóstico',     icon: Stethoscope },
  { id: 'antec',       label: 'Antecedentes',    icon: HeartPulse },
  { id: 'capacidad',   label: 'Capacidad funcional', icon: Activity },
  { id: 'estudios',    label: 'Estudios',        icon: FlaskConical },
  { id: 'tratamientos',label: 'Tratamientos',    icon: Pill },
  { id: 'valoraciones',label: 'Valoraciones',    icon: Users },
  { id: 'evidencia',   label: 'Evidencia',       icon: BookOpen },
  { id: 'pregunta',    label: 'Pregunta',        icon: MessageSquareQuote },
  { id: 'costos',      label: 'Costos',          icon: DollarSign },
  { id: 'adjuntos',    label: 'Adjuntos',        icon: Paperclip },
]

const DRAFT_KEY = 'sgico_presentacion_draft'
const PROTOCOLO_COLS = 'id, nombre, estudio_pivotal, pfs_esperado_meses, os_esperado_meses, tipo_evidencia, evidencia_link'
const NA = '__NA__'
// Comodín de la CAC para una fecha que existe pero no se conoce.
const FECHA_DESCONOCIDA_CAC = '1800-01-01'
const SIN_ESTADIO = 'Sin estadificación'
const ANTECEDENTE_NEGATIVO = 'Antecedente negativo'
const NO_HA_RECIBIDO = 'No ha recibido'
const SIN_PROPUESTA = 'Sin propuesta'

// Definiciones acordadas con el cliente para la prioridad del caso.
const PRIORIDAD_OPTS = [
  { value: 'normal',  label: 'Normal',  def: 'Puede presentarse en un comité dentro de los próximos 8 días hábiles.' },
  { value: 'urgente', label: 'Urgente', def: 'Debe presentarse en el próximo comité, sin importar cuánto falte para él.' },
  { value: 'critica', label: 'Crítica', def: 'Amerita un comité extraordinario por su condición clínica o administrativa.' },
]

// Borradores y casos agendados antes de los ajustes de la reunión con el
// cliente pueden traer valores que el formulario ya no admite.
const normalizarBorrador = (bd) => {
  if (!bd) return bd
  if (bd.ecog === NA) bd.ecog = ''
  if (bd.patologia_realizada === 'no') bd.patologia_realizada = ''
  if (bd.estudios_patologia === NA) bd.estudios_patologia = ''
  if (!Array.isArray(bd.patologias_list)) {
    bd.patologias_list = (bd.histologia || bd.estudios_patologia || bd.fecha_patologia)
      ? [{ fecha: bd.fecha_patologia || '', histologia: bd.histologia || '', descripcion: bd.estudios_patologia || '' }]
      : []
  }
  if (bd.estudios_laboratorio === NA) bd.estudios_laboratorio = ''
  if (bd.estado_fisico === NA) bd.estado_fisico = ''
  if (bd.habito_tabaquico === NA) bd.habito_tabaquico = ''
  if (bd.habito_alcohol === NA) bd.habito_alcohol = ''
  return bd
}

// Contexto terapéutico (enum clínico). Neo/adyuvancia NO son líneas metastásicas.
const CONTEXTO_OPTS = [
  { value: 'naive',                 label: 'Naive / sin tratamiento previo' },
  { value: 'neoadyuvancia',         label: 'Neoadyuvancia' },
  { value: 'adyuvancia',            label: 'Adyuvancia' },
  { value: 'metastasica_1',         label: 'Primera línea metastásica' },
  { value: 'metastasica_2',         label: 'Segunda línea metastásica' },
  { value: 'metastasica_3',         label: 'Tercera línea metastásica' },
  { value: 'metastasica_posterior', label: 'Líneas metastásicas posteriores' },
]

// Sin tratamiento oncológico actual: naive (nunca tratado) y neoadyuvancia
// (el tratamiento neoadyuvante es el que se propone). Fuente de verdad para
// bloquear el tratamiento actual, su costo y su supervivencia.
const CONTEXTOS_SIN_TX_ACTUAL = ['naive', 'neoadyuvancia']
const esPacienteNaive = (ctx) => CONTEXTOS_SIN_TX_ACTUAL.includes(ctx)
const etiquetaSinTx = (ctx) => (ctx === 'neoadyuvancia' ? 'en neoadyuvancia' : 'naive')

// Deriva linea_actual (integer) desde el contexto, por compatibilidad con datos previos.
const contextoALinea = (ctx) => {
  switch (ctx) {
    case 'naive': return 0
    case 'metastasica_1': return 1
    case 'metastasica_2': return 2
    case 'metastasica_3': return 3
    case 'metastasica_posterior': return 4
    default: return null // neo/adyuvancia no son líneas metastásicas
  }
}

// Catálogo de biomarcadores con su TIPO de resultado (E3). Ampliable.
//   hormonal → resultado + % (RE/RP) · indice → % (Ki-67) · her2 → cruces (+FISH si 2+)
//   pdl1 → resultado + % · msi → estado MSI · mutacion → resultado + detalle · binario → pos/neg
const BIOMARCADORES = [
  { v: 'RE (receptor estrógeno)', tipo: 'hormonal' },
  { v: 'RP (receptor progesterona)', tipo: 'hormonal' },
  { v: 'Ki-67', tipo: 'indice' },
  { v: 'HER2 / ERBB2', tipo: 'her2' },
  { v: 'PD-L1', tipo: 'pdl1' },
  { v: 'EGFR', tipo: 'mutacion' },
  { v: 'EGFR T790M', tipo: 'mutacion' },
  { v: 'ALK', tipo: 'binario' },
  { v: 'ROS1', tipo: 'binario' },
  { v: 'BRAF', tipo: 'mutacion' },
  { v: 'KRAS', tipo: 'mutacion' },
  { v: 'KRAS G12C', tipo: 'binario' },
  { v: 'MET', tipo: 'binario' },
  { v: 'RET', tipo: 'binario' },
  { v: 'NTRK', tipo: 'binario' },
  { v: 'MSI / MMR', tipo: 'msi' },
  { v: 'BRCA1', tipo: 'mutacion' },
  { v: 'BRCA2', tipo: 'mutacion' },
  { v: 'FISH', tipo: 'mutacion' },
  { v: 'PIK3CA', tipo: 'mutacion' },
  { v: 'ESR1', tipo: 'mutacion' },
  { v: 'IDH1', tipo: 'mutacion' },
  { v: 'IDH2', tipo: 'mutacion' },
  { v: 'FGFR', tipo: 'binario' },
  { v: 'cKIT', tipo: 'mutacion' },
  { v: 'Otro', tipo: 'binario' },
]
const BIOMARCADOR_OPTS = BIOMARCADORES.map(b => ({ value: b.v, label: b.v }))
const BIOMARCADOR_TIPO = Object.fromEntries(BIOMARCADORES.map(b => [b.v, b.tipo]))

const RES_POS_NEG = [
  { value: 'positivo', label: 'Positivo' },
  { value: 'negativo', label: 'Negativo' },
  { value: 'no_evaluable', label: 'No evaluable' },
]
const HER2_CRUCES = [
  { value: '0', label: '0' },
  { value: '1+', label: '1+' },
  { value: '2+', label: '2+ (indeterminado)' },
  { value: '3+', label: '3+' },
]
const FISH_OPTS = [
  { value: 'no_solicitado', label: 'No solicitado' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'positivo', label: 'Solicitado — positivo (amplificado)' },
  { value: 'negativo', label: 'Solicitado — negativo (no amplificado)' },
]
const MSI_OPTS = [
  { value: 'mss', label: 'MSS / estable' },
  { value: 'msi_h', label: 'MSI-H / inestable alto (dMMR)' },
  { value: 'msi_l', label: 'MSI-L / inestable bajo' },
  { value: 'no_evaluable', label: 'No evaluable' },
]
const RES_LABEL = { positivo: 'Positivo', negativo: 'Negativo', no_evaluable: 'No evaluable', indeterminado: 'Indeterminado' }
const FISH_LABEL = Object.fromEntries(FISH_OPTS.map(o => [o.value, o.label]))
const MSI_LABEL = Object.fromEntries(MSI_OPTS.map(o => [o.value, o.label]))

// Interpretación HER2 según cruces (+ FISH si 2+)
const her2Interp = (cruces, fish) => {
  if (cruces === '3+') return 'positivo'
  if (cruces === '0' || cruces === '1+') return 'negativo'
  if (cruces === '2+') {
    if (fish === 'positivo') return 'positivo (FISH+)'
    if (fish === 'negativo') return 'negativo (FISH−)'
    return `indeterminado (FISH ${FISH_LABEL[fish] || 'pendiente'})`
  }
  return null
}

// Formato de un biomarcador para el resumen de texto
const fmtBiomarcador = (r) => {
  const bm = r.biomarcador
  const tipo = BIOMARCADOR_TIPO[bm] || 'binario'
  const fecha = r.fecha ? ` (${r.fecha})` : ''
  let cuerpo
  switch (tipo) {
    case 'hormonal':
      cuerpo = `${RES_LABEL[r.resultado] || r.resultado || '—'}${r.porcentaje ? ` ${r.porcentaje}%` : ''}`
      break
    case 'indice':
      cuerpo = r.porcentaje ? `${r.porcentaje}%` : (RES_LABEL[r.resultado] || '—')
      break
    case 'her2': {
      cuerpo = `${r.cruces || '—'}${r.cruces === '2+' && r.fish ? ` · FISH ${FISH_LABEL[r.fish]}` : ''}`
      const interp = her2Interp(r.cruces, r.fish)
      if (interp) cuerpo += ` → ${interp}`
      break
    }
    case 'pdl1':
      cuerpo = `${RES_LABEL[r.resultado] || '—'}${r.porcentaje ? ` ${r.porcentaje}%` : ''}`
      break
    case 'msi':
      cuerpo = MSI_LABEL[r.resultado] || r.resultado || '—'
      break
    case 'mutacion':
      cuerpo = `${RES_LABEL[r.resultado] || r.resultado || '—'}${r.observaciones ? ` — ${r.observaciones}` : ''}`
      break
    default:
      cuerpo = RES_LABEL[r.resultado] || r.resultado || '—'
  }
  return `${bm}: ${cuerpo}${fecha}`
}

// Resumen de texto derivado del arreglo (para la columna biomarcadores y las vistas legadas)
const resumenBiomarcadores = (list) => {
  if (!Array.isArray(list)) return null
  const items = list.filter(r => r.biomarcador).map(fmtBiomarcador)
  return items.length ? items.join(' · ') : null
}

// Catálogo de arranque de imágenes diagnósticas (denominaciones tipo CUPS, E4). Ampliable.
const IMAGEN_OPTS = [
  'TAC de tórax', 'TAC de abdomen', 'TAC de pelvis', 'TAC de tórax y abdomen',
  'TAC de tórax, abdomen y pelvis', 'TAC de cráneo', 'TAC de cuello',
  'RM cerebral', 'RM de columna cervical', 'RM de columna dorsal', 'RM de columna lumbar',
  'RM de abdomen', 'RM de pelvis',
  'PET/CT', 'Gammagrafía ósea',
  'Ecografía abdominal', 'Ecografía mamaria', 'Mamografía', 'Radiografía de tórax',
  'Otro',
].map(v => ({ value: v, label: v }))

const resumenImagenes = (list) => {
  if (!Array.isArray(list)) return null
  const items = list
    .filter(r => r.estudio)
    .map(r => `${r.estudio}${r.fecha ? ` (${r.fecha})` : ''}${r.hallazgo ? `: ${r.hallazgo}` : ''}`)
  return items.length ? items.join(' · ') : null
}

// Varias patologías → columnas de texto que leen Detalle, Mesa y Acta
const patologiasValidas = (list) =>
  (Array.isArray(list) ? list : []).filter(r => r.histologia || r.descripcion || r.fecha)
const histologiasTexto = (list) => {
  const unicas = [...new Set(patologiasValidas(list).map(r => r.histologia?.trim()).filter(Boolean))]
  return unicas.length ? unicas.join(' / ').slice(0, 300) : null
}
const resumenPatologias = (list) => {
  const filas = patologiasValidas(list)
  if (!filas.length) return null
  if (filas.length === 1) return filas[0].descripcion?.trim() || null
  return filas.map((r, i) =>
    `${i + 1}. ${[r.fecha, r.histologia].filter(Boolean).join(' · ')}${r.descripcion ? `: ${r.descripcion.trim()}` : ''}`
  ).join('\n')
}
const fechaPatologiaReciente = (list) => {
  const fechas = patologiasValidas(list).map(r => r.fecha).filter(Boolean).sort()
  return fechas.length ? fechas[fechas.length - 1] : null
}

const toIntOrNull = (v) => {
  if (v === '' || v === null || v === undefined) return null
  const n = parseInt(v, 10)
  return isNaN(n) ? null : n
}

const toFloatOrNull = (v) => {
  if (v === '' || v === null || v === undefined || v === NA) return null
  const n = parseFloat(v)
  return isNaN(n) ? null : n
}

const initialState = {
  // 1. Administrativo
  sede_id: '', eps_id: '', medico_id: '', gestor_id: '',
  fecha_solicitud: new Date().toISOString().slice(0, 10),
  prioridad: 'normal',
  tipo_comite: 'tumor_solido',

  // 2. Demográficos
  documento: '', tipo_documento: 'CC', nombre: '', fecha_nacimiento: '',
  genero: '', telefono1: '',

  // 3. Diagnóstico (incluye patología, IHQ y molecular/NGS)
  cie10: '', diagnostico_descripcion: '',
  patologia_realizada: '', histologia: '',
  estudios_patologia: '', fecha_patologia: '', patologia_observaciones: '',
  patologias_list: [],  // varias patologías: { fecha, histologia, descripcion }
  inmunohistoquimica_realizada: '', inmunohistoquimica: '',
  estadio_clinico: '', estadio_observaciones: '', tnm_t: '', tnm_n: '', tnm_m: '',
  fecha_diagnostico: '', biomarcadores: '', biomarcadores_list: [],
  estudios_moleculares: '', fecha_moleculares: '',

  // 4. Antecedentes
  comorbilidades: '', alergias: '',
  habito_tabaquico: '', habito_alcohol: '',
  medicacion_actual: '',

  // 5. Capacidad funcional
  ecog: '', eva: '', estado_fisico: '',
  peso_kg: '', talla_cm: '',

  // 6. Estudios (paraclínicos)
  estudios_imagenes: '', imagenes_list: [], estudios_laboratorio: '',

  // 6. Tratamientos
  contexto_actual: '',
  tratamiento_actual: '',                  // ← antes: molecula_previa
  quimioterapia_lineas_previas: '',        // ← campo único combinado
  tratamiento_quirurgico: '',
  tratamiento_rt: '',
  tratamiento_dirigido: '',
  respuesta_previa: '',

  // 7. Valoraciones interdisciplinarias (opcionales)
  valorado_psicologia: null,
  concepto_psicologia: '',
  valorado_trabajo_social: null,
  concepto_trabajo_social: '',
  valorado_paliativos: null,
  concepto_paliativos: '',

  // 8. Evidencia (PFS/OS del propuesto del estudio pivotal)
  protocolo_id: '', evidencia_referencia: '',
  evidencia_tipo: '', evidencia_link: '',
  pfs_esperado_estudio: '', os_esperado_estudio: '',

  // 8. Pregunta
  pregunta_comite: '', tratamiento_propuesto: '',
  justificacion_clinica: '',
  contexto_propuesto: '', fuera_protocolo: '',

  // 9. Costos por ciclo + PFS/OS del actual
  costo_ciclo_actual: '', dias_ciclo_actual: '21',
  pfs_actual_meses: '', os_actual_meses: '',
  costo_ciclo_propuesto: '', dias_ciclo_propuesto: '21',
  // Duración para costos: hasta_progresion | fija | tope (ver lib/duracion.js)
  duracion_propuesto: 'hasta_progresion', ciclos_propuesto: '',
  duracion_actual: 'hasta_progresion', ciclos_actual: '',
  tiene_invima: '',
  en_unirse: '',

  // 10. Adjuntos
  adjuntos: [],
}

export default function PresentacionComite() {
  const navigate = useNavigate()
  const { id: editIdParam } = useParams()
  const [editId, setEditId] = useState(editIdParam ? Number(editIdParam) : null)
  const [step, setStep] = useState(0)
  const [data, setData] = useState(initialState)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  // Agendar para comité
  const [showAgendar, setShowAgendar] = useState(false)
  const [sesiones, setSesiones] = useState([])
  const [sesionSel, setSesionSel] = useState('nueva')
  const [nuevaFecha, setNuevaFecha] = useState('')
  const [nuevoTipo, setNuevoTipo] = useState('tumor_solido')
  const [agendando, setAgendando] = useState(false)

  const [sedes, setSedes] = useState([])
  const [eps, setEps] = useState([])
  const [medicos, setMedicos] = useState([])
  const [gestores, setGestores] = useState([])
  const [protocolos, setProtocolos] = useState([])

  useEffect(() => {
    cargarCatalogos()
    // Modo edición: rehidratar un caso agendado desde su borrador_data (sin pérdida)
    if (editIdParam) {
      ;(async () => {
        const { data: caso, error } = await supabase
          .from('casos_comite').select('borrador_data').eq('id', editIdParam).single()
        if (!error && caso?.borrador_data) {
          const bd = normalizarBorrador(caso.borrador_data)
          setData(prev => ({ ...prev, ...bd }))
          toast.success('Caso agendado cargado', { icon: '📂' })
        }
      })()
      return
    }
    const draft = localStorage.getItem(DRAFT_KEY)
    if (draft) {
      try {
        const parsed = JSON.parse(draft)
        normalizarBorrador(parsed.data)
        setData(prev => ({ ...prev, ...parsed.data }))
        setStep(parsed.step || 0)
        toast.success('Borrador recuperado', { icon: '📝' })
      } catch { /* ignore */ }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (editIdParam) return // en modo edición el caso vive en BD, no en localStorage
    const t = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ data, step }))
    }, 800)
    return () => clearTimeout(t)
  }, [data, step]) // eslint-disable-line react-hooks/exhaustive-deps

  async function cargarCatalogos() {
    const [s, e, m, g, p] = await Promise.all([
      supabase.from('sedes').select('id, nombre').eq('activa', true).order('nombre'),
      supabase.from('eps').select('id, nombre').eq('activa', true).order('nombre'),
      supabase.from('medicos').select('id, nombre, especialidad').eq('activo', true).order('nombre'),
      supabase.from('gestores').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('protocolos')
        .select(`${PROTOCOLO_COLS}, tipo_duracion, ciclos_esquema, dias_ciclo`)
        .eq('activo', true).order('nombre')
        // Respaldo mientras no esté aplicada la migración 022
        .then(r => r.error ? supabase.from('protocolos').select(PROTOCOLO_COLS).eq('activo', true).order('nombre') : r),
    ])
    setSedes(s.data || [])
    setEps(e.data || [])
    setMedicos(m.data || [])
    setGestores(g.data || [])
    setProtocolos(p.data || [])
  }

  const update = (field, value) => {
    setData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }))
  }

  // Adjuntos: actualización funcional para no perder archivos si se suben en paralelo
  const adj = {
    lista: data.adjuntos || [],
    agregar: (nuevos) => setData(prev => ({ ...prev, adjuntos: [...(prev.adjuntos || []), ...nuevos] })),
    eliminar: async (path) => {
      await eliminarArchivoAdjunto(path)
      setData(prev => ({ ...prev, adjuntos: (prev.adjuntos || []).filter(f => f.path !== path) }))
    },
  }

  const updateMany = (patch) => {
    setData(prev => ({ ...prev, ...patch }))
    setErrors(prev => {
      const next = { ...prev }
      Object.keys(patch).forEach(f => delete next[f])
      return next
    })
  }

  // contexto 'naive' implica paciente sin tratamiento previo: los campos del
  // tratamiento actual se autocompletan (NA en PFS/OS mantiene es_naive en
  // calcularProyeccion) y se limpian si el usuario se corrige a otro contexto.
  const updateContextoActual = (value) => {
    if (esPacienteNaive(value) === esPacienteNaive(data.contexto_actual)) {
      update('contexto_actual', value)
      return
    }
    updateMany({
      contexto_actual: value,
      ...(esPacienteNaive(value)
        ? { costo_ciclo_actual: '0', dias_ciclo_actual: '0',
            pfs_actual_meses: NA, os_actual_meses: NA }
        : { costo_ciclo_actual: '', dias_ciclo_actual: '',
            pfs_actual_meses: '', os_actual_meses: '' }),
    })
  }

  const toggleNA = (field) => {
    update(field, data[field] === NA ? '' : NA)
  }

  /* ── Cálculo de proyección: PFS, duración fija o PFS con tope ── */
  const proyeccion = useMemo(() => {
    return calcularProyeccion(data)
  }, [ // eslint-disable-line react-hooks/exhaustive-deps
    data.costo_ciclo_actual, data.dias_ciclo_actual,
    data.costo_ciclo_propuesto, data.dias_ciclo_propuesto,
    data.pfs_actual_meses, data.os_actual_meses,
    data.pfs_esperado_estudio, data.os_esperado_estudio,
    data.duracion_propuesto, data.ciclos_propuesto, data.duracion_actual, data.ciclos_actual,
    data.contexto_actual,
  ])

  const validateStep = (idx) => {
    const errs = {}
    const today = new Date().toISOString().split('T')[0]
    // allowNA: false para campos donde "No aplica" no es una respuesta válida
    const req = (f, { allowNA = true } = {}) => {
      const v = data[f]
      if (v === '' || v === null || v === undefined || (!allowNA && v === NA)) {
        errs[f] = 'Requerido'
      }
    }
    const noFuture = (f) => {
      const v = data[f]
      if (v && v !== NA && v > today) errs[f] = 'No puede ser futura'
    }

    switch (idx) {
      case 0:
        req('sede_id'); req('eps_id'); req('medico_id'); req('fecha_solicitud')
        req('tipo_comite')
        noFuture('fecha_solicitud')
        break
      case 1:
        req('documento'); req('tipo_documento'); req('nombre')
        req('fecha_nacimiento'); req('genero')
        noFuture('fecha_nacimiento')
        break
      case 2:
        ;['cie10','diagnostico_descripcion','estadio_clinico','fecha_diagnostico']
          .forEach(f => req(f))
        noFuture('fecha_diagnostico')
        // Sin estadificación: observación obligatoria y TNM opcional
        if (data.estadio_clinico === NA) {
          req('estadio_observaciones')
        } else {
          ;['tnm_t','tnm_n','tnm_m'].forEach(f => req(f))
        }
        // Patología (sí / sin dato). Todo paciente con CA tiene patología:
        // si no se conoce el dato, la observación es obligatoria.
        req('patologia_realizada')
        if (data.patologia_realizada === 'si') {
          const filas = data.patologias_list || []
          if (!filas.length) errs.patologias_list = 'Agrega al menos una patología'
          else if (filas.some(r => !r.histologia || !r.descripcion?.trim()))
            errs.patologias_list = 'Cada patología necesita histología y descripción'
          else if (filas.some(r => r.fecha && r.fecha > today))
            errs.patologias_list = 'La fecha de la patología no puede ser futura'
        }
        if (data.patologia_realizada === 'sin_dato') req('patologia_observaciones')
        // Inmunohistoquímica (sí/no). Si sí, descripción requerida.
        req('inmunohistoquimica_realizada')
        if (data.inmunohistoquimica_realizada === 'si') req('inmunohistoquimica')
        // Molecular / NGS (diagnóstico)
        req('estudios_moleculares'); noFuture('fecha_moleculares')
        // biomarcadores: sub-formulario estructurado, opcional (0..n filas)
        break
      case 3:
        ;['comorbilidades','alergias','medicacion_actual'].forEach(f => req(f))
        req('habito_tabaquico', { allowNA: false }); req('habito_alcohol', { allowNA: false })
        break
      case 4:
        // Capacidad funcional
        req('ecog', { allowNA: false })
        req('eva')
        req('estado_fisico', { allowNA: false })
        {
          const ep = errorAntropometria(data.peso_kg, RANGO_PESO, 'kg')
          const et = errorAntropometria(data.talla_cm, RANGO_TALLA, 'cm')
          if (ep) errs.peso_kg = ep
          if (et) errs.talla_cm = et
        }
        break
      case 5:
        // Estudios (paraclínicos): solo laboratorio requerido; imágenes opcionales.
        req('estudios_laboratorio', { allowNA: false })
        break
      case 6:
        // Contexto terapéutico y tratamiento actual son requeridos
        req('contexto_actual')
        if (!esPacienteNaive(data.contexto_actual)) req('tratamiento_actual')
        // El resto se permiten "No aplica"
        ;['quimioterapia_lineas_previas','tratamiento_quirurgico',
          'tratamiento_rt','tratamiento_dirigido','respuesta_previa']
          .forEach(f => req(f))
        break
      case 7:
        // Valoraciones interdisciplinarias: solo Sí / No, obligatorio responder
        ;['valorado_psicologia','valorado_trabajo_social','valorado_paliativos']
          .forEach(f => { if (data[f] !== true && data[f] !== false) errs[f] = 'Indique Sí o No' })
        break
      case 8:
        req('protocolo_id')
        // Sin propuesta: no hay estudio pivotal que referenciar
        if (data.protocolo_id !== NA) {
          req('evidencia_referencia')
          // En duración fija (adyuvancia, neoadyuvancia…) el costo no depende del PFS
          if (data.duracion_propuesto !== 'fija') { req('pfs_esperado_estudio'); req('os_esperado_estudio') }
          if (data.duracion_propuesto !== 'hasta_progresion' && !(parseFloat(data.ciclos_propuesto) > 0)) {
            errs.ciclos_propuesto = 'Indica el número de ciclos'
          }
        }
        break
      case 9:
        req('pregunta_comite')
        // Con protocolo, el tratamiento propuesto es el protocolo elegido
        if (data.protocolo_id === NA) req('tratamiento_propuesto')
        req('justificacion_clinica')
        break
      case 10:
        // El paciente naive no tiene tratamiento actual que costear
        if (!esPacienteNaive(data.contexto_actual)) {
          req('costo_ciclo_actual'); req('dias_ciclo_actual')
          if (data.duracion_actual !== 'fija') { req('pfs_actual_meses'); req('os_actual_meses') }
          if (data.duracion_actual !== 'hasta_progresion' && !(parseFloat(data.ciclos_actual) > 0)) {
            errs.ciclos_actual = 'Indica el número de ciclos'
          }
        }
        if (data.protocolo_id !== NA) {
          req('costo_ciclo_propuesto'); req('dias_ciclo_propuesto')
        }
        break
      case 11:
        break
    }
    setErrors(errs)
    return errs
  }

  const stepIsValid = (errs) => Object.keys(errs).length === 0
  const hasFutureDateError = (errs) =>
    Object.values(errs).some(v => v === 'No puede ser futura')

  const next = () => {
    const errs = validateStep(step)
    if (!stepIsValid(errs)) {
      toast.error(hasFutureDateError(errs)
        ? 'La fecha no puede ser futura'
        : 'Completa los campos requeridos')
      return
    }
    setStep(s => Math.min(s + 1, STEPS.length - 1))
  }
  const back = () => setStep(s => Math.max(s - 1, 0))
  const goTo = (idx) => {
    if (idx > step) {
      const errs = validateStep(step)
      if (!stepIsValid(errs)) {
        toast.error(hasFutureDateError(errs)
          ? 'La fecha no puede ser futura'
          : 'Completa el paso actual primero')
        return
      }
    }
    setStep(idx)
  }

  // Busca el paciente por documento o lo crea. Devuelve su id.
  async function obtenerPacienteId() {
    const { data: pac } = await supabase
      .from('pacientes').select('id').eq('documento', data.documento).maybeSingle()
    if (pac?.id) return pac.id
    const { data: nuevo, error } = await supabase
      .from('pacientes')
      .insert({
        documento: data.documento,
        tipo_documento: data.tipo_documento,
        nombre: data.nombre,
        fecha_nacimiento: data.fecha_nacimiento,
        genero: data.genero,
        telefono1: clean(data.telefono1),
        eps_id: toIntOrNull(data.eps_id),
        sede_id: toIntOrNull(data.sede_id),
      })
      .select('id').single()
    if (error) throw error
    return nuevo.id
  }

  // Abre el modal de agendar tras validar el mínimo (Administrativo + Demográficos)
  async function abrirAgendar() {
    for (const i of [0, 1]) {
      const errs = validateStep(i)
      if (!stepIsValid(errs)) {
        setStep(i)
        toast.error(`Para agendar, completa: ${STEPS[i].label}`)
        return
      }
    }
    const hoy = new Date().toISOString().slice(0, 10)
    const { data: ses } = await supabase
      .from('sesiones_comite').select('*').gte('fecha', hoy).order('fecha')
    setSesiones(ses || [])
    setSesionSel(ses && ses.length ? String(ses[0].id) : 'nueva')
    setShowAgendar(true)
  }

  // Guarda/actualiza el caso como AGENDADO (presentado=false) en la sesión elegida
  async function confirmarAgendar() {
    setAgendando(true)
    try {
      let sesionId
      if (sesionSel === 'nueva') {
        if (!nuevaFecha) { toast.error('Elige la fecha del comité'); setAgendando(false); return }
        const { data: nueva, error } = await supabase
          .from('sesiones_comite')
          .insert({ fecha: nuevaFecha, tipo_comite: nuevoTipo })
          .select('id').single()
        if (error) throw error
        sesionId = nueva.id
      } else {
        sesionId = Number(sesionSel)
      }

      const pacienteId = await obtenerPacienteId()
      const fila = {
        paciente_id: pacienteId,
        sede_id: toIntOrNull(data.sede_id),
        medico_id: toIntOrNull(data.medico_id),
        gestor_id: toIntOrNull(data.gestor_id),
        protocolo_id: toIntOrNull(data.protocolo_id),
        tipo_comite: data.tipo_comite,
        prioridad: data.prioridad,
        fecha_solicitud: data.fecha_solicitud,
        motivo: clean(data.pregunta_comite),
        decision: 'pendiente',
        sesion_id: sesionId,
        presentado: false,
        borrador_data: data,
      }

      if (editId) {
        const { error } = await supabase.from('casos_comite').update(fila).eq('id', editId)
        if (error) throw error
      } else {
        const { data: ins, error } = await supabase
          .from('casos_comite').insert(fila).select('id').single()
        if (error) throw error
        setEditId(ins.id)
      }

      setShowAgendar(false)
      localStorage.removeItem(DRAFT_KEY)
      toast.success('Caso agendado para comité', { icon: '📅' })
      navigate('/agenda')
    } catch (e) {
      console.error('Error al agendar:', e)
      toast.error(`Error al agendar: ${e.message}`)
    } finally {
      setAgendando(false)
    }
  }

  const presentar = async () => {
    for (let i = 0; i < STEPS.length; i++) {
      const errs = validateStep(i)
      if (!stepIsValid(errs)) {
        setStep(i)
        toast.error(hasFutureDateError(errs)
          ? 'La fecha no puede ser futura'
          : `Faltan datos en: ${STEPS[i].label}`)
        return
      }
    }

    setSubmitting(true)
    try {
      const pacienteId = await obtenerPacienteId()

      const preguntaTexto = data.pregunta_comite
      const tratamientoTexto = tratamientoPropuestoTexto(data, protocolos)
      const justificacionTexto = data.justificacion_clinica

      const payload = {
        paciente_id: pacienteId,
        sede_id: toIntOrNull(data.sede_id),
        medico_id: toIntOrNull(data.medico_id),
        gestor_id: toIntOrNull(data.gestor_id),
        protocolo_id: toIntOrNull(data.protocolo_id),

        fecha_solicitud: data.fecha_solicitud,
        tipo_comite: data.tipo_comite,
        prioridad: data.prioridad,
        decision: 'pendiente',

        // Compatibilidad campos viejos
        motivo: preguntaTexto,
        justificacion: justificacionTexto,
        molecula_propuesta: tratamientoTexto?.slice(0, 100) || null,
        molecula_previa: clean(data.tratamiento_actual)?.slice(0, 100) || null,
        contexto_actual: data.contexto_actual || null,
        contexto_propuesto: data.contexto_propuesto || null,
        // "fuera de protocolo" = NO adherente al protocolo
        adherente_protocolo: data.fuera_protocolo === 'si' ? false : data.fuera_protocolo === 'no' ? true : null,
        linea_actual: contextoALinea(data.contexto_actual),
        linea_propuesta: contextoALinea(data.contexto_propuesto),
        // tratamiento_previo unifica todas las modalidades en texto
        tratamiento_previo: [
          data.quimioterapia_lineas_previas,
          data.tratamiento_quirurgico,
          data.tratamiento_rt,
          data.tratamiento_dirigido,
        ].filter(x => x && x !== NA).join(' | ') || null,

        // Costos planos. El naive no tiene costo previo: null (sin dato), no 0,
        // para que no contamine los agregados.
        costo_previo:    esPacienteNaive(data.contexto_actual)
          ? null
          : toFloatOrNull(data.costo_ciclo_actual),
        costo_estimado:  toFloatOrNull(data.costo_ciclo_propuesto),
        proyeccion_costos: proyeccion,

        // Regulatorio
        tiene_invima: data.tiene_invima === 'si' ? true : data.tiene_invima === 'no' ? false : null,
        en_unirse:    data.en_unirse === 'si' ? true : data.en_unirse === 'no' ? false : null,

        // Clínicos detallados
        diagnostico_descripcion: clean(data.diagnostico_descripcion),
        // Patología (sí/no). Histología y descripción solo si hubo patología.
        // Patología (sí / sin dato). 'no' solo existe en casos anteriores.
        patologia_realizada: data.patologia_realizada === 'si' ? true
                           : data.patologia_realizada === 'no' ? false : null,
        patologia_observaciones: data.patologia_realizada === 'sin_dato'
          ? clean(data.patologia_observaciones) : null,
        histologia: data.patologia_realizada === 'si' ? histologiasTexto(data.patologias_list) : null,
        // Inmunohistoquímica (sí/no) + descripción
        inmunohistoquimica_realizada: data.inmunohistoquimica_realizada === 'si' ? true
                                    : data.inmunohistoquimica_realizada === 'no' ? false : null,
        inmunohistoquimica: data.inmunohistoquimica_realizada === 'si' ? clean(data.inmunohistoquimica) : null,
        estadio_clinico: data.estadio_clinico === NA ? SIN_ESTADIO : clean(data.estadio_clinico),
        estadio_observaciones: data.estadio_clinico === NA ? clean(data.estadio_observaciones) : null,
        tnm: armarTNM(data),
        fecha_diagnostico: data.fecha_diagnostico === NA
          ? FECHA_DESCONOCIDA_CAC : cleanDate(data.fecha_diagnostico),
        // texto = resumen derivado del arreglo (compat con Detalle/Mesa); jsonb = estructurado
        biomarcadores: resumenBiomarcadores(data.biomarcadores_list) || clean(data.biomarcadores),
        biomarcadores_estructurados: (data.biomarcadores_list?.length ? data.biomarcadores_list : null),

        // Capacidad funcional
        ecog: clean(data.ecog),
        eva: (data.eva === '' || data.eva === NA) ? null : Number(data.eva),
        estado_fisico: clean(data.estado_fisico),
        // Solo valores dentro de rango (al agendar un caso incompleto no se valida)
        peso_kg: errorAntropometria(data.peso_kg, RANGO_PESO, 'kg') ? null : aNumero(data.peso_kg),
        talla_cm: errorAntropometria(data.talla_cm, RANGO_TALLA, 'cm') ? null : aNumero(data.talla_cm),
        superficie_corporal: superficieCorporal(data.peso_kg, data.talla_cm),
        comorbilidades: cleanAntecedente(data.comorbilidades),
        alergias: cleanAntecedente(data.alergias),
        habito_tabaquico: cleanAntecedente(data.habito_tabaquico),
        habito_alcohol: cleanAntecedente(data.habito_alcohol),
        medicacion_actual: cleanAntecedente(data.medicacion_actual),

        estudios_imagenes: resumenImagenes(data.imagenes_list) || clean(data.estudios_imagenes),
        imagenes_estructuradas: (data.imagenes_list?.length ? data.imagenes_list : null),
        estudios_laboratorio: clean(data.estudios_laboratorio),
        estudios_patologia: data.patologia_realizada === 'si' ? resumenPatologias(data.patologias_list) : null,
        estudios_moleculares: clean(data.estudios_moleculares),
        fecha_patologia: data.patologia_realizada === 'si' ? fechaPatologiaReciente(data.patologias_list) : null,
        fecha_moleculares: cleanDate(data.fecha_moleculares),

        tratamiento_quirurgico: cleanNoRecibido(data.tratamiento_quirurgico),
        // El nuevo campo combinado se mapea a tratamiento_qt para preservar BD
        tratamiento_qt: clean(data.quimioterapia_lineas_previas),
        tratamiento_rt: cleanNoRecibido(data.tratamiento_rt),
        tratamiento_dirigido: cleanNoRecibido(data.tratamiento_dirigido),
        respuesta_previa: clean(data.respuesta_previa),

        // Valoraciones interdisciplinarias (boolean | null + concepto opcional)
        valorado_psicologia: data.valorado_psicologia,
        concepto_psicologia: data.concepto_psicologia?.trim() || null,
        valorado_trabajo_social: data.valorado_trabajo_social,
        concepto_trabajo_social: data.concepto_trabajo_social?.trim() || null,
        valorado_paliativos: data.valorado_paliativos,
        concepto_paliativos: data.concepto_paliativos?.trim() || null,

        evidencia_referencia: clean(data.evidencia_referencia),
        evidencia_tipo: clean(data.evidencia_tipo),
        evidencia_link: clean(data.evidencia_link),
        pfs_esperado_estudio: toFloatOrNull(data.pfs_esperado_estudio),
        os_esperado_estudio:  toFloatOrNull(data.os_esperado_estudio),

        pregunta_comite: preguntaTexto,
        tratamiento_propuesto: tratamientoTexto,
        justificacion_clinica: justificacionTexto,

        adjuntos: data.adjuntos,
      }

      // Presentar = escribir columnas estructuradas + presentado=true.
      // Si venía agendado (editId), se actualiza la fila; si no, se inserta.
      let casoId
      if (editId) {
        const { error: casoErr } = await supabase
          .from('casos_comite')
          .update({ ...payload, presentado: true, borrador_data: null })
          .eq('id', editId)
        if (casoErr) throw casoErr
        casoId = editId
      } else {
        const { data: caso, error: casoErr } = await supabase
          .from('casos_comite')
          .insert({ ...payload, presentado: true })
          .select('id').single()
        if (casoErr) throw casoErr
        casoId = caso.id
      }

      localStorage.removeItem(DRAFT_KEY)
      toast.success('Caso inscrito al comité', { icon: '🎉' })
      navigate(`/casos/${casoId}`)
    } catch (e) {
      console.error('Error al presentar:', e)
      toast.error(`Error al presentar: ${e.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  const progress = useMemo(() => Math.round((step / (STEPS.length - 1)) * 100), [step])

  return (
    <div className="max-w-5xl mx-auto p-4 lg:p-6">
      <div className="mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-white">
          Inscripción de caso al Comité de Tumores
        </h1>
        <p className="text-slate-300 text-sm mt-1">
          Complete la información clínica y administrativa para inscribir el caso
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-300 p-4 lg:p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-semibold text-slate-700">
            Paso {step + 1} de {STEPS.length}
          </span>
          <span className="text-xs font-bold text-blue-700">{progress}% completado</span>
        </div>
        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden mb-6">
          <div className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500"
            style={{ width: `${progress}%` }} />
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-10 gap-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            const done = i < step
            const active = i === step
            return (
              <button key={s.id} onClick={() => goTo(i)}
                className={`flex flex-col items-center gap-1 p-2 rounded-lg text-xs transition-all ${
                  active ? 'bg-blue-50 text-blue-700 ring-2 ring-blue-500'
                    : done ? 'text-emerald-600 hover:bg-emerald-50'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  active ? 'bg-blue-600 text-white' :
                  done ? 'bg-emerald-500 text-white' : 'bg-slate-200'
                }`}>
                  {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </div>
                <span className="text-[10px] leading-tight text-center font-semibold">{s.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-300 p-4 lg:p-8 mb-6">
        {step === 0 && <StepAdmin {...{ data, update, errors, sedes, eps, medicos, gestores, adj }} />}
        {step === 1 && <StepDemograficos {...{ data, update, errors }} />}
        {step === 2 && <StepDiagnostico {...{ data, update, errors, toggleNA, adj }} />}
        {step === 3 && <StepAntecedentes {...{ data, update, errors, toggleNA }} />}
        {step === 4 && <StepCapacidad {...{ data, update, errors, toggleNA }} />}
        {step === 5 && <StepEstudios {...{ data, update, errors, toggleNA, adj }} />}
        {step === 6 && <StepTratamientos {...{ data, update, updateContextoActual, errors, toggleNA }} />}
        {step === 7 && <StepValoraciones {...{ data, update, errors }} />}
        {step === 8 && <StepEvidencia {...{ data, update, errors, toggleNA, protocolos, setProtocolos }} />}
        {step === 9 && <StepPregunta {...{ data, update, errors, toggleNA, protocolos }} />}
        {step === 10 && <StepCostos {...{ data, update, errors, toggleNA, proyeccion }} />}
        {step === 11 && <StepAdjuntos {...{ adj }} />}
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
        <button onClick={back} disabled={step === 0}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-white border border-slate-400 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
          <ChevronLeft className="w-4 h-4" /> Anterior
        </button>
        <div className="flex gap-2 w-full sm:w-auto">
          <button onClick={abrirAgendar}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-slate-200 text-slate-800 hover:bg-slate-300">
            <CalendarPlus className="w-4 h-4" /> {editId ? 'Actualizar agenda' : 'Agendar para comité'}
          </button>
          {step < STEPS.length - 1 ? (
            <button onClick={next}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
              Siguiente <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={presentar} disabled={submitting}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 text-white hover:from-emerald-700 hover:to-emerald-800 disabled:opacity-50">
              <Send className="w-4 h-4" />
              {submitting ? 'Inscribiendo…' : 'Inscribir caso'}
            </button>
          )}
        </div>
      </div>

      {/* Modal: Agendar para comité */}
      {showAgendar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
             onClick={() => !agendando && setShowAgendar(false)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-300 w-full max-w-md p-6"
               onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Agendar para comité</h3>
              <button onClick={() => setShowAgendar(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <label className="block text-sm font-semibold text-slate-800 mb-1.5">Sesión de comité</label>
            <select value={sesionSel} onChange={e => setSesionSel(e.target.value)}
              className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg text-sm text-slate-900 mb-3">
              {sesiones.map(s => (
                <option key={s.id} value={String(s.id)}>
                  {new Date(s.fecha).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}
                  {' · '}{TIPO_COMITE_OPTS.find(t => t.value === s.tipo_comite)?.label || s.tipo_comite}
                </option>
              ))}
              <option value="nueva">➕ Crear nueva sesión…</option>
            </select>

            {sesionSel === 'nueva' && (
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Fecha del comité</label>
                  <input type="date" value={nuevaFecha} onChange={e => setNuevaFecha(e.target.value)}
                    min={new Date().toISOString().slice(0, 10)}
                    className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg text-sm text-slate-900" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo</label>
                  <select value={nuevoTipo} onChange={e => setNuevoTipo(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg text-sm text-slate-900">
                    {TIPO_COMITE_OPTS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>
            )}

            <p className="text-xs text-slate-500 mb-4">
              El caso queda en la agenda del comité y puedes seguir editándolo hasta el día de la sesión.
            </p>

            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAgendar(false)} disabled={agendando}
                className="px-4 py-2 rounded-lg bg-white border border-slate-400 text-slate-700 hover:bg-slate-50 text-sm">
                Cancelar
              </button>
              <button onClick={confirmarAgendar} disabled={agendando}
                className="px-5 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">
                {agendando ? 'Agendando…' : 'Agendar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────
   Cálculo de proyección — SOLO PFS
   ────────────────────────────────────────────────────────────── */
function calcularProyeccion(d) {
  const ca = parseFloat(d.costo_ciclo_actual)
  const da = parseInt(d.dias_ciclo_actual, 10)
  const cp = parseFloat(d.costo_ciclo_propuesto)
  const dp = parseInt(d.dias_ciclo_propuesto, 10)
  const pfsP = parseFloat(d.pfs_esperado_estudio)
  const osP  = parseFloat(d.os_esperado_estudio)
  const modoP = d.duracion_propuesto || 'hasta_progresion'
  const modoA = d.duracion_actual || 'hasta_progresion'

  // PFS y OS actuales pueden ser "No aplica" (paciente naive / duración fija)
  const pfsA = d.pfs_actual_meses === NA ? null : parseFloat(d.pfs_actual_meses)
  const osA  = d.os_actual_meses === NA  ? null : parseFloat(d.os_actual_meses)
  const valido = (v) => v != null && !isNaN(v) && v > 0

  // Ciclos a costear del propuesto: por PFS, los del esquema (fija) o PFS con tope.
  // Al progresar se cambia de línea; la SG nunca entra en el costo.
  if (!valido(cp) || !valido(dp)) return null
  const ciclosP = ciclosSegunDuracion(modoP, pfsP, dp, d.ciclos_propuesto)
  if (ciclosP == null) return null
  const totalP = ciclosP * cp

  const sinTx = esPacienteNaive(d.contexto_actual)
  const ciclosA = !sinTx && valido(ca) && valido(da)
    ? ciclosSegunDuracion(modoA, pfsA, da, d.ciclos_actual) : null

  let actual = { costo_ciclo: sinTx ? 0 : ca, duracion_dias: sinTx ? 0 : da, pfs_meses: null, os_meses: null }
  let diferencial

  if (ciclosA != null) {
    const totalA = ciclosA * ca
    actual = {
      ...actual,
      duracion: modoA,
      ciclos_esquema: modoA !== 'hasta_progresion' ? parseFloat(d.ciclos_actual) : null,
      pfs_meses: valido(pfsA) ? pfsA : null,
      os_meses: valido(osA) ? osA : null,
      ciclos_pfs: redondear(ciclosA, 2),
      total_pfs: redondear(totalA),
    }
    // Ganancia de PFS solo si ambos tratamientos se miden por PFS (no en duración fija)
    const gan = modoP !== 'fija' && modoA !== 'fija' && valido(pfsP) && valido(pfsA) ? pfsP - pfsA : null
    const diff = totalP - totalA
    diferencial = {
      diferencia_pfs: redondear(diff),
      ganancia_pfs_meses: gan != null ? redondear(gan, 2) : null,
      costo_por_mes_pfs_ganado: gan > 0 ? redondear(diff / gan) : null,
      es_naive: false,
    }
  } else {
    // Sin tratamiento actual costeable no hay con qué comparar: paciente sin
    // tratamiento (naive / neoadyuvancia) o faltan datos del actual.
    diferencial = {
      diferencia_pfs: null,
      ganancia_pfs_meses: null,
      costo_por_mes_pfs_ganado: null,
      es_naive: true,
      motivo_sin_diferencial: sinTx ? d.contexto_actual : 'falta_pfs_actual',
    }
  }

  return {
    actual,
    propuesto: {
      costo_ciclo: cp,
      duracion_dias: dp,
      duracion: modoP,
      ciclos_esquema: modoP !== 'hasta_progresion' ? parseFloat(d.ciclos_propuesto) : null,
      pfs_meses: valido(pfsP) ? pfsP : null,
      os_meses: valido(osP) ? osP : null,
      ciclos_pfs: redondear(ciclosP, 2),
      total_pfs:  redondear(totalP),
    },
    diferencial,
    nota: 'Costo del tratamiento: hasta la progresión (PFS), cuando se cambia de línea, o los ciclos del esquema en tratamientos de duración fija. La SG es solo referencia clínica y no entra en el costo.',
  }
}

const redondear = (n, dec = 0) => {
  const f = Math.pow(10, dec)
  return Math.round(n * f) / f
}

const fmtCOP = (n) => n == null ? '—' : '$ ' + Number(n).toLocaleString('es-CO') + ' COP'

const clean = (v) => (v === NA ? 'No aplica' : (v?.toString().trim() || null))
const cleanDate = (v) => (v === NA || !v ? null : v)
// En antecedentes, la marca registra que se indagó y fue negativo
const cleanAntecedente = (v) => (v === NA ? ANTECEDENTE_NEGATIVO : clean(v))
// Modalidades oncoespecíficas: la marca registra que no las ha recibido
const cleanNoRecibido = (v) => (v === NA ? NO_HA_RECIBIDO : clean(v))

// El tratamiento propuesto es el protocolo elegido; el texto libre solo
// aplica cuando no hay protocolo propuesto.
const protocoloElegido = (d, protocolos) =>
  d.protocolo_id && d.protocolo_id !== NA
    ? protocolos.find(p => String(p.id) === String(d.protocolo_id)) : null
const tratamientoPropuestoTexto = (d, protocolos) => {
  const p = protocoloElegido(d, protocolos)
  if (p) return p.nombre
  if (d.tratamiento_propuesto === NA) return SIN_PROPUESTA
  return d.tratamiento_propuesto?.trim() || null
}
// TNM genérico (AJCC). Categorías transversales; el afinamiento por tumor es posterior.
const T_OPTS = ['Tis', 'T0', 'T1', 'T1a', 'T1b', 'T1c', 'T2', 'T2a', 'T2b', 'T3', 'T4', 'T4a', 'T4b', 'Tx'].map(v => ({ value: v, label: v }))
const N_OPTS = ['N0', 'N1', 'N1a', 'N1b', 'N1c', 'N2', 'N2a', 'N2b', 'N3', 'N3a', 'N3b', 'Nx'].map(v => ({ value: v, label: v }))
const M_OPTS = ['M0', 'M1', 'M1a', 'M1b', 'M1c', 'Mx'].map(v => ({ value: v, label: v }))

const armarTNM = (d) => {
  const t = d.tnm_t === NA ? null : d.tnm_t
  const n = d.tnm_n === NA ? null : d.tnm_n
  const m = d.tnm_m === NA ? null : d.tnm_m
  if (!t && !n && !m) return null
  return `${t || '-'}${n || '-'}${m || '-'}`
}

/* ──────────────────────────────────────────────────────────────
   UI primitives
   ────────────────────────────────────────────────────────────── */
function Section({ title, description, icon: Icon, children }) {
  return (
    <div>
      <div className="flex items-start gap-3 mb-6 pb-4 border-b border-slate-200">
        {Icon && (
          <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5" />
          </div>
        )}
        <div>
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          {description && <p className="text-sm text-slate-600 mt-0.5">{description}</p>}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </div>
  )
}

function Field({ label, required, error, naValue, onToggleNA, naLabel = 'No aplica', children, full, hint }) {
  return (
    <div className={full ? 'md:col-span-2' : ''}>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-semibold text-slate-800">
          {label} {required && <span className="text-red-600">*</span>}
        </label>
        {onToggleNA && (
          <button type="button" onClick={onToggleNA}
            className={`text-[11px] px-2 py-0.5 rounded-full font-semibold transition-colors ${
              naValue ? 'bg-amber-200 text-amber-900 ring-1 ring-amber-400'
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}>
            {naValue ? `✓ ${naLabel}` : naLabel}
          </button>
        )}
      </div>
      <div className={naValue ? 'opacity-40 pointer-events-none' : ''}>{children}</div>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
      {error && <p className="text-xs text-red-600 mt-1 font-medium">{error}</p>}
    </div>
  )
}

const inputBase = 'w-full px-3 py-2 border-2 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed'

function Input({ value, onChange, error, ...rest }) {
  return (
    <input value={value === NA ? '' : (value || '')}
      onChange={e => onChange(e.target.value)}
      className={`${inputBase} ${error ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white'}`}
      {...rest} />
  )
}

function TextArea({ value, onChange, error, rows = 3, ...rest }) {
  return (
    <textarea value={value === NA ? '' : (value || '')}
      onChange={e => onChange(e.target.value)} rows={rows}
      className={`${inputBase} resize-none ${error ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white'}`}
      {...rest} />
  )
}

function Select({ value, onChange, options, error, placeholder = 'Seleccione...' }) {
  return (
    <select value={value === NA ? '' : (value || '')}
      onChange={e => onChange(e.target.value)}
      className={`${inputBase} ${error ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white'}`}>
      <option value="">{placeholder}</option>
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

// Sub-formulario repetible de biomarcadores, con campos adaptativos por tipo.
function BiomarcadoresEditor({ value, onChange }) {
  const rows = Array.isArray(value) ? value : []
  const today = new Date().toISOString().split('T')[0]
  const add = () => onChange([...rows, { biomarcador: '', resultado: '', fecha: '' }])
  const upd = (i, patch) => onChange(rows.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  const rm = (i) => onChange(rows.filter((_, idx) => idx !== i))
  const lbl = 'block text-[11px] font-medium text-slate-500 mb-1'
  return (
    <div className="md:col-span-2">
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-semibold text-slate-800">Biomarcadores y mutaciones</label>
        <button type="button" onClick={add}
          className="text-xs px-2.5 py-1 rounded-full font-semibold bg-blue-600 text-white hover:bg-blue-700">
          + Agregar biomarcador
        </button>
      </div>
      {rows.length === 0 && (
        <p className="text-xs text-slate-500">Sin biomarcadores registrados. Agrega los que apliquen (opcional).</p>
      )}
      <div className="space-y-2">
        {rows.map((r, i) => {
          const tipo = BIOMARCADOR_TIPO[r.biomarcador] || 'binario'
          return (
            <div key={i} className="bg-slate-50 border border-slate-200 rounded-lg p-2">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 items-end">
                <div>
                  <label className={lbl}>Biomarcador</label>
                  <Select value={r.biomarcador} onChange={v => upd(i, { biomarcador: v })} options={BIOMARCADOR_OPTS} />
                </div>
                <div>
                  <label className={lbl}>Fecha</label>
                  <Input type="date" value={r.fecha} max={today} onChange={v => upd(i, { fecha: v })} />
                </div>
                <button type="button" onClick={() => rm(i)} title="Quitar"
                  className="h-[42px] w-10 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {r.biomarcador && (
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(tipo === 'hormonal' || tipo === 'pdl1') && (
                    <>
                      <div>
                        <label className={lbl}>Resultado</label>
                        <Select value={r.resultado} onChange={v => upd(i, { resultado: v })} options={RES_POS_NEG} />
                      </div>
                      <div>
                        <label className={lbl}>{tipo === 'pdl1' ? 'Expresión % (TPS/CPS)' : 'Porcentaje (%)'}</label>
                        <Input type="number" min="0" max="100" value={r.porcentaje || ''}
                          onChange={v => upd(i, { porcentaje: v })} placeholder="Ej. 90" />
                      </div>
                    </>
                  )}
                  {tipo === 'indice' && (
                    <div>
                      <label className={lbl}>Índice de proliferación (%)</label>
                      <Input type="number" min="0" max="100" value={r.porcentaje || ''}
                        onChange={v => upd(i, { porcentaje: v })} placeholder="Ej. 30" />
                    </div>
                  )}
                  {tipo === 'her2' && (
                    <>
                      <div>
                        <label className={lbl}>IHQ (cruces)</label>
                        <Select value={r.cruces} onChange={v => upd(i, { cruces: v })} options={HER2_CRUCES} placeholder="0 / 1+ / 2+ / 3+" />
                      </div>
                      {r.cruces === '2+' && (
                        <div>
                          <label className={lbl}>FISH (requerido en 2+)</label>
                          <Select value={r.fish} onChange={v => upd(i, { fish: v })} options={FISH_OPTS} />
                        </div>
                      )}
                      {her2Interp(r.cruces, r.fish) && (
                        <p className="sm:col-span-2 text-[11px] text-slate-600">
                          Interpretación: <b>{her2Interp(r.cruces, r.fish)}</b>
                        </p>
                      )}
                    </>
                  )}
                  {tipo === 'msi' && (
                    <div>
                      <label className={lbl}>Estado</label>
                      <Select value={r.resultado} onChange={v => upd(i, { resultado: v })} options={MSI_OPTS} />
                    </div>
                  )}
                  {tipo === 'mutacion' && (
                    <>
                      <div>
                        <label className={lbl}>Resultado</label>
                        <Select value={r.resultado} onChange={v => upd(i, { resultado: v })} options={RES_POS_NEG} />
                      </div>
                      <div>
                        <label className={lbl}>Observaciones</label>
                        <Input value={r.observaciones || ''} onChange={v => upd(i, { observaciones: v })} placeholder="Ej. exón 19 del, L858R, amplificado" />
                      </div>
                    </>
                  )}
                  {tipo === 'binario' && (
                    <div>
                      <label className={lbl}>Resultado</label>
                      <Select value={r.resultado} onChange={v => upd(i, { resultado: v })} options={RES_POS_NEG} />
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Búsqueda CIE-10 por texto (evita digitar el código). Devuelve (codigo, descripcion).
function Cie10Search({ value, onSelect, error }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const selected = CIE10_INDEX[value]
  const matches = query.trim().length >= 2 ? buscarCIE10(query, { limite: 15 }) : []

  if (value) {
    return (
      <div className={`px-3 py-2 border-2 rounded-lg text-sm bg-white ${error ? 'border-red-400' : 'border-slate-300'}`}>
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-blue-700">{value}</span>
          <span className="text-slate-700 flex-1 truncate">{selected?.descripcion || '(código manual)'}</span>
          <button type="button" onClick={() => { onSelect(''); setQuery('') }}
            className="text-xs text-slate-500 hover:text-blue-700 font-medium">Cambiar</button>
        </div>
        {selected?.alerta && <p className="text-[11px] text-amber-700 mt-1">⚠ {selected.alerta}</p>}
      </div>
    )
  }

  return (
    <div className="relative">
      <input value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Escribe el diagnóstico… (ej. colon, linfoma del manto, C50)"
        className={`${inputBase} ${error ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white'}`} />
      {open && query.trim().length >= 2 && (
        <div className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto bg-white border border-slate-300 rounded-lg shadow-lg">
          {matches.map(c => (
            <button type="button" key={c.codigo}
              onClick={() => { onSelect(c.codigo, c.descripcion); setOpen(false); setQuery('') }}
              className="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-start gap-2 border-b border-slate-100 last:border-0">
              <span className="font-mono text-xs font-bold text-blue-700 mt-0.5 shrink-0 w-14">{c.codigo}</span>
              <span className="text-sm text-slate-700">{c.descripcion}</span>
            </button>
          ))}
          {query.trim().length >= 3 && (
            <button type="button"
              onClick={() => { onSelect(query.toUpperCase().trim()); setOpen(false); setQuery('') }}
              className="w-full text-left px-3 py-2 hover:bg-amber-50 text-sm text-slate-600 border-t border-slate-200">
              Usar <span className="font-mono font-semibold">{query.toUpperCase().trim()}</span> como código manual
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Búsqueda de histología (CAP), filtrada por el grupo del CIE-10 del diagnóstico.
function HistologiaSearch({ value, onSelect, grupo, error }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const matches = open ? buscarHistologia(query, { grupo, limite: 20 }) : []

  if (value) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 border-2 rounded-lg text-sm bg-white ${error ? 'border-red-400' : 'border-slate-300'}`}>
        <span className="text-slate-800 flex-1">{value}</span>
        <button type="button" onClick={() => { onSelect(''); setQuery('') }}
          className="text-xs text-slate-500 hover:text-blue-700 font-medium shrink-0">Cambiar</button>
      </div>
    )
  }

  return (
    <div className="relative">
      <input value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={grupo ? `Histologías de: ${grupo} (o busca otra)` : 'Selecciona el diagnóstico primero, o busca la histología'}
        className={`${inputBase} ${error ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white'}`} />
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto bg-white border border-slate-300 rounded-lg shadow-lg">
          {matches.map(h => (
            <button type="button" key={h.nombre}
              onClick={() => { onSelect(h.nombre); setOpen(false); setQuery('') }}
              className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm text-slate-700 border-b border-slate-100 last:border-0">
              {h.nombre}
            </button>
          ))}
          {query.trim().length >= 3 && (
            <button type="button"
              onClick={() => { onSelect(query.trim()); setOpen(false); setQuery('') }}
              className="w-full text-left px-3 py-2 hover:bg-amber-50 text-sm text-slate-600 border-t border-slate-200">
              Usar “{query.trim()}” (histología no listada)
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Sub-formulario repetible de patologías: { fecha, histologia, descripcion }
function PatologiasEditor({ value, onChange, grupo, error }) {
  const rows = Array.isArray(value) ? value : []
  const today = new Date().toISOString().split('T')[0]
  const add = () => onChange([...rows, { fecha: '', histologia: '', descripcion: '' }])
  const upd = (i, k, v) => onChange(rows.map((r, idx) => idx === i ? { ...r, [k]: v } : r))
  const rm = (i) => onChange(rows.filter((_, idx) => idx !== i))
  return (
    <div className="md:col-span-2">
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-semibold text-slate-800">
          Patologías <span className="text-red-600">*</span>
        </label>
        <button type="button" onClick={add}
          className="text-xs px-2.5 py-1 rounded-full font-semibold bg-blue-600 text-white hover:bg-blue-700">
          + Agregar patología
        </button>
      </div>
      <p className="text-xs text-slate-500 mb-2">
        Registra cada estudio de patología (biopsia, pieza quirúrgica, recaída…). Histología tipo CAP, filtrada por el diagnóstico.
      </p>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="bg-slate-50 border border-slate-200 rounded-lg p-2 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-2 items-end">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Fecha</label>
                <Input type="date" value={r.fecha} max={today} onChange={v => upd(i, 'fecha', v)} />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Histología</label>
                <HistologiaSearch value={r.histologia} grupo={grupo}
                  error={error && !r.histologia} onSelect={v => upd(i, 'histologia', v)} />
              </div>
              <button type="button" onClick={() => rm(i)} title="Quitar" disabled={rows.length === 1}
                className="h-[42px] w-10 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Descripción</label>
              <TextArea value={r.descripcion} onChange={v => upd(i, 'descripcion', v)} rows={2}
                error={error && !r.descripcion?.trim()}
                placeholder="Ej. Biopsia: adenocarcinoma pulmonar moderadamente diferenciado" />
            </div>
          </div>
        ))}
      </div>
      {error && <p className="text-xs text-red-600 mt-1 font-medium">{error}</p>}
    </div>
  )
}

// Sub-formulario repetible de imágenes diagnósticas: { estudio, fecha, hallazgo }
function ImagenesEditor({ value, onChange }) {
  const rows = Array.isArray(value) ? value : []
  const today = new Date().toISOString().split('T')[0]
  const add = () => onChange([...rows, { estudio: '', fecha: '', hallazgo: '' }])
  const upd = (i, k, v) => onChange(rows.map((r, idx) => idx === i ? { ...r, [k]: v } : r))
  const rm = (i) => onChange(rows.filter((_, idx) => idx !== i))
  return (
    <div className="md:col-span-2">
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-semibold text-slate-800">Imágenes diagnósticas</label>
        <button type="button" onClick={add}
          className="text-xs px-2.5 py-1 rounded-full font-semibold bg-blue-600 text-white hover:bg-blue-700">
          + Agregar imagen
        </button>
      </div>
      {rows.length === 0 && (
        <p className="text-xs text-slate-500">Sin imágenes registradas. Agrega los estudios realizados (opcional).</p>
      )}
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="bg-slate-50 border border-slate-200 rounded-lg p-2 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 items-end">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Estudio</label>
                <Select value={r.estudio} onChange={v => upd(i, 'estudio', v)} options={IMAGEN_OPTS} />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Fecha</label>
                <Input type="date" value={r.fecha} max={today} onChange={v => upd(i, 'fecha', v)} />
              </div>
              <button type="button" onClick={() => rm(i)} title="Quitar"
                className="h-[42px] w-10 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Hallazgo / observación</label>
              <Input value={r.hallazgo} onChange={v => upd(i, 'hallazgo', v)}
                placeholder="Ej. lesión pulmonar LSI 22 mm; sin adenopatías" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────
   STEPS
   ────────────────────────────────────────────────────────────── */
function StepAdmin({ data, update, errors, sedes, eps, medicos, gestores, adj }) {
  return (
    <Section title="Datos administrativos" description="Información de ruta del paciente y solicitante" icon={Building2}>
      <Field label="Sede" required error={errors.sede_id}>
        <Select value={data.sede_id} onChange={v => update('sede_id', v)}
          options={sedes.map(s => ({ value: s.id, label: s.nombre }))} error={errors.sede_id} />
      </Field>
      <Field label="EPS" required error={errors.eps_id}>
        <Select value={data.eps_id} onChange={v => update('eps_id', v)}
          options={eps.map(e => ({ value: e.id, label: e.nombre }))} error={errors.eps_id} />
      </Field>
      <Field label="Médico solicitante" required error={errors.medico_id}>
        <Select value={data.medico_id} onChange={v => update('medico_id', v)}
          options={medicos.map(m => ({
            value: m.id,
            label: `${m.nombre}${m.especialidad ? ` — ${m.especialidad}` : ''}`,
          }))} error={errors.medico_id} />
      </Field>
      <Field label="Gestor de caso">
        <Select value={data.gestor_id} onChange={v => update('gestor_id', v)}
          options={gestores.map(g => ({ value: g.id, label: g.nombre }))} />
      </Field>
      <Field label="Tipo de comité" required error={errors.tipo_comite}>
        <Select value={data.tipo_comite} onChange={v => update('tipo_comite', v)}
          options={[
            { value: 'tumor_solido',       label: 'Tumor sólido' },
            { value: 'hematologico',       label: 'Hematológico' },
            { value: 'multidisciplinario', label: 'Multidisciplinario' },
          ]} error={errors.tipo_comite} />
      </Field>
      <Field label="Prioridad" required
        hint={PRIORIDAD_OPTS.find(o => o.value === data.prioridad)?.def}>
        <Select value={data.prioridad} onChange={v => update('prioridad', v)}
          options={PRIORIDAD_OPTS} />
      </Field>
      <Field label="Fecha de solicitud" required error={errors.fecha_solicitud}>
        <Input type="date" value={data.fecha_solicitud}
          max={new Date().toISOString().split('T')[0]}
          onChange={v => update('fecha_solicitud', v)} error={errors.fecha_solicitud} />
      </Field>
      <SeccionAdjuntos adj={adj} categorias={['historia_clinica']}
        texto="Si ya tienes la historia clínica, adjúntala aquí." />
    </Section>
  )
}

function StepDemograficos({ data, update, errors }) {
  return (
    <Section title="Datos del paciente" description="Identificación y datos de contacto" icon={User}>
      <Field label="Tipo de documento" required error={errors.tipo_documento}>
        <Select value={data.tipo_documento} onChange={v => update('tipo_documento', v)}
          options={[
            { value: 'CC', label: 'Cédula de Ciudadanía' },
            { value: 'TI', label: 'Tarjeta de Identidad' },
            { value: 'CE', label: 'Cédula de Extranjería' },
            { value: 'PA', label: 'Pasaporte' },
            { value: 'RC', label: 'Registro Civil' },
            { value: 'PT', label: 'Permiso de Tránsito' },
          ]} />
      </Field>
      <Field label="Número de documento" required error={errors.documento}>
        <Input value={data.documento} onChange={v => update('documento', v.replace(/\D/g, ''))}
          placeholder="Solo números" error={errors.documento} />
      </Field>
      <Field label="Nombre completo" required error={errors.nombre} full>
        <Input value={data.nombre} onChange={v => update('nombre', v.toUpperCase())}
          placeholder="APELLIDOS NOMBRES" error={errors.nombre} />
      </Field>
      <Field label="Fecha de nacimiento" required error={errors.fecha_nacimiento}>
        <Input type="date" value={data.fecha_nacimiento}
          max={new Date().toISOString().split('T')[0]}
          onChange={v => update('fecha_nacimiento', v)} error={errors.fecha_nacimiento} />
      </Field>
      <Field label="Género" required error={errors.genero}>
        <Select value={data.genero} onChange={v => update('genero', v)}
          options={[
            { value: 'M', label: 'Masculino' },
            { value: 'F', label: 'Femenino' },
            { value: 'I', label: 'Indeterminado' },
          ]} error={errors.genero} />
      </Field>
      <Field label="Teléfono">
        <Input value={data.telefono1} onChange={v => update('telefono1', v)} placeholder="3001234567" />
      </Field>
    </Section>
  )
}

const SI_NO_OPTS = [{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }]
// Todo paciente con CA tiene patología: no existe "No", solo "Sin dato"
const PATOLOGIA_OPTS = [{ value: 'si', label: 'Sí' }, { value: 'sin_dato', label: 'Sin dato' }]

function StepDiagnostico({ data, update, errors, toggleNA, adj }) {
  const conPatologia = data.patologia_realizada === 'si'
  const sinEstadio = data.estadio_clinico === NA
  const conIHQ = data.inmunohistoquimica_realizada === 'si'
  return (
    <Section title="Diagnóstico oncológico" description="CIE-10, patología, inmunohistoquímica, TNM y molecular" icon={Stethoscope}>
      <Field label="Diagnóstico (CIE-10)" required full error={errors.cie10}
        hint="Busca por el diagnóstico (ej. «colon», «mama») y selecciona el código. No hace falta digitarlo.">
        <Cie10Search value={data.cie10} error={errors.cie10}
          onSelect={(codigo, desc) => {
            update('cie10', codigo)
            if (desc && !data.diagnostico_descripcion) update('diagnostico_descripcion', desc)
          }} />
      </Field>
      <Field label="Fecha del diagnóstico" required error={errors.fecha_diagnostico}
        naLabel="Sin dato" naValue={data.fecha_diagnostico === NA} onToggleNA={() => toggleNA('fecha_diagnostico')}
        hint={data.fecha_diagnostico === NA
          ? 'Fecha desconocida: se registra con el comodín de la CAC (1800-01-01).' : undefined}>
        <Input type="date" value={data.fecha_diagnostico}
          max={new Date().toISOString().split('T')[0]}
          onChange={v => update('fecha_diagnostico', v)} error={errors.fecha_diagnostico} />
      </Field>
      <Field label="Descripción del diagnóstico" required full
        error={errors.diagnostico_descripcion}
        naValue={data.diagnostico_descripcion === NA}
        onToggleNA={() => toggleNA('diagnostico_descripcion')}>
        <TextArea value={data.diagnostico_descripcion}
          onChange={v => update('diagnostico_descripcion', v)}
          placeholder="Ej. Adenocarcinoma de mama derecha, RH+/HER2-, estadio IV con metástasis hepáticas"
          error={errors.diagnostico_descripcion} />
      </Field>

      {/* Patología */}
      <Field label="¿Se realizó patología?" required error={errors.patologia_realizada}>
        <Select value={data.patologia_realizada} error={errors.patologia_realizada} options={PATOLOGIA_OPTS}
          onChange={v => {
            update('patologia_realizada', v)
            if (v === 'si' && !data.patologias_list?.length)
              update('patologias_list', [{ fecha: '', histologia: '', descripcion: '' }])
          }} />
      </Field>
      <div />
      {data.patologia_realizada === 'sin_dato' && (
        <Field label="Observaciones — ¿por qué no hay dato de patología?" required full
          error={errors.patologia_observaciones}>
          <TextArea value={data.patologia_observaciones} onChange={v => update('patologia_observaciones', v)}
            placeholder="Ej. Biopsia tomada en otra institución, reporte pendiente de llegar"
            rows={2} error={errors.patologia_observaciones} />
        </Field>
      )}
      {conPatologia && (
        <PatologiasEditor value={data.patologias_list} error={errors.patologias_list}
          grupo={CIE10_INDEX[data.cie10]?.subgrupo}
          onChange={v => update('patologias_list', v)} />
      )}

      {/* Inmunohistoquímica */}
      <Field label="¿Se realizó inmunohistoquímica?" required error={errors.inmunohistoquimica_realizada}>
        <Select value={data.inmunohistoquimica_realizada} onChange={v => update('inmunohistoquimica_realizada', v)}
          options={SI_NO_OPTS} error={errors.inmunohistoquimica_realizada} />
      </Field>
      <div />
      {conIHQ && (
        <Field label="Descripción de inmunohistoquímica" required full error={errors.inmunohistoquimica}
          naValue={data.inmunohistoquimica === NA} onToggleNA={() => toggleNA('inmunohistoquimica')}>
          <TextArea value={data.inmunohistoquimica} onChange={v => update('inmunohistoquimica', v)}
            placeholder="Ej. TTF-1+, Napsina A+, CK7+, p40−"
            error={errors.inmunohistoquimica} />
        </Field>
      )}

      <Field label="Estadio clínico" required error={errors.estadio_clinico}
        naLabel={SIN_ESTADIO} naValue={sinEstadio} onToggleNA={() => toggleNA('estadio_clinico')}>
        <Select value={data.estadio_clinico} onChange={v => update('estadio_clinico', v)}
          options={[
            { value: '0', label: 'Estadio 0' },
            { value: 'I', label: 'Estadio I' }, { value: 'IA', label: 'Estadio IA' }, { value: 'IB', label: 'Estadio IB' },
            { value: 'II', label: 'Estadio II' }, { value: 'IIA', label: 'Estadio IIA' }, { value: 'IIB', label: 'Estadio IIB' },
            { value: 'III', label: 'Estadio III' }, { value: 'IIIA', label: 'Estadio IIIA' },
            { value: 'IIIB', label: 'Estadio IIIB' }, { value: 'IIIC', label: 'Estadio IIIC' },
            { value: 'IV', label: 'Estadio IV' },
          ]} error={errors.estadio_clinico} />
      </Field>
      <div />
      {sinEstadio && (
        <Field label="Observaciones — ¿por qué se presenta sin estadificación?" required full
          error={errors.estadio_observaciones}>
          <TextArea value={data.estadio_observaciones} onChange={v => update('estadio_observaciones', v)}
            placeholder="Ej. Estudios de extensión en curso; se presenta para definir conducta inicial"
            rows={2} error={errors.estadio_observaciones} />
        </Field>
      )}
      <Field label="T (Tumor)" required={!sinEstadio} error={errors.tnm_t}>
        <Select value={data.tnm_t} onChange={v => update('tnm_t', v)} options={T_OPTS} error={errors.tnm_t} />
      </Field>
      <Field label="N (Nodos)" required={!sinEstadio} error={errors.tnm_n}>
        <Select value={data.tnm_n} onChange={v => update('tnm_n', v)} options={N_OPTS} error={errors.tnm_n} />
      </Field>
      <Field label="M (Metástasis)" required={!sinEstadio} error={errors.tnm_m}>
        <Select value={data.tnm_m} onChange={v => update('tnm_m', v)} options={M_OPTS} error={errors.tnm_m} />
      </Field>
      <BiomarcadoresEditor value={data.biomarcadores_list}
        onChange={v => update('biomarcadores_list', v)} />
      <Field label="Estudios moleculares / NGS" required full error={errors.estudios_moleculares}
        naValue={data.estudios_moleculares === NA} onToggleNA={() => toggleNA('estudios_moleculares')}>
        <div className="mb-2 max-w-[240px]">
          <label className="block text-xs font-medium text-slate-500 mb-1">Fecha del estudio molecular / NGS</label>
          <Input type="date" value={data.fecha_moleculares}
            max={new Date().toISOString().split('T')[0]}
            onChange={v => update('fecha_moleculares', v)} error={errors.fecha_moleculares} />
        </div>
        <TextArea value={data.estudios_moleculares} onChange={v => update('estudios_moleculares', v)}
          placeholder="Ej. EGFR exón 19 deletion positivo, ALK negativo, ROS1 negativo, PD-L1 TPS 5%"
          error={errors.estudios_moleculares} />
      </Field>
      <SeccionAdjuntos adj={adj} categorias={['patologia', 'molecular']}
        texto="Adjunta los reportes de patología, inmunohistoquímica y estudios moleculares." />
    </Section>
  )
}

function StepCapacidad({ data, update, errors, toggleNA }) {
  return (
    <Section title="Capacidad funcional" description="Estado funcional y físico actual del paciente" icon={Activity}>
      <Field label="ECOG Performance Status" required error={errors.ecog}>
        <Select value={data.ecog} onChange={v => update('ecog', v)}
          options={[
            { value: '0', label: '0 — Asintomático, totalmente activo' },
            { value: '1', label: '1 — Síntomas leves, ambulatorio' },
            { value: '2', label: '2 — Encamado <50% del día' },
            { value: '3', label: '3 — Encamado >50% del día' },
            { value: '4', label: '4 — Postrado, no se autocuida' },
          ]} error={errors.ecog} />
      </Field>
      <Field label="EVA — Escala visual analógica del dolor" required error={errors.eva}
        hint="0 = sin dolor · 10 = máximo dolor imaginable">
        <Select value={data.eva} onChange={v => update('eva', v)}
          options={Array.from({ length: 11 }, (_, i) => ({
            value: String(i),
            label: `${i}${i === 0 ? ' — sin dolor' : i === 10 ? ' — máximo dolor' : ''}`,
          }))} error={errors.eva} />
      </Field>
      <Field label="Peso (kg)" required error={errors.peso_kg}>
        <Input type="number" inputMode="decimal" step="0.1" min={RANGO_PESO.min} max={RANGO_PESO.max}
          value={data.peso_kg} onChange={v => update('peso_kg', v)} placeholder="Ej. 68,5" error={errors.peso_kg} />
      </Field>
      <Field label="Talla (cm)" required error={errors.talla_cm}>
        <Input type="number" inputMode="decimal" step="0.1" min={RANGO_TALLA.min} max={RANGO_TALLA.max}
          value={data.talla_cm} onChange={v => update('talla_cm', v)} placeholder="Ej. 165" error={errors.talla_cm} />
      </Field>
      <SuperficieCorporal peso={data.peso_kg} talla={data.talla_cm} />
      <Field label="Estado físico actual — datos relevantes" required full error={errors.estado_fisico}>
        <TextArea value={data.estado_fisico} onChange={v => update('estado_fisico', v)}
          placeholder="Ej. Buen estado general, deambula sin apoyo. Dolor óseo lumbar controlado con analgesia."
          error={errors.estado_fisico} />
      </Field>
    </Section>
  )
}

// Cálculo automático a partir del peso y la talla (Mosteller)
function SuperficieCorporal({ peso, talla }) {
  const sc = superficieCorporal(peso, talla)
  const i = imc(peso, talla)
  const fmt = (n, d) => n.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d })
  return (
    <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="rounded-lg border-2 border-blue-200 bg-blue-50 px-4 py-3">
        <div className="text-xs font-semibold text-slate-600">Superficie corporal (Mosteller)</div>
        <div className="text-2xl font-bold text-slate-900">
          {sc != null ? <>{fmt(sc, 2)} <span className="text-base font-semibold">m²</span></> : '—'}
        </div>
        <div className="text-[11px] text-slate-500">√(talla cm × peso kg ÷ 3600) · se calcula sola</div>
      </div>
      <div className="rounded-lg border-2 border-slate-200 bg-slate-50 px-4 py-3">
        <div className="text-xs font-semibold text-slate-600">Índice de masa corporal</div>
        <div className="text-2xl font-bold text-slate-900">
          {i != null ? <>{fmt(i, 1)} <span className="text-base font-semibold">kg/m²</span></> : '—'}
        </div>
        <div className="text-[11px] text-slate-500">{i != null ? categoriaImc(i) + ' (referencia OMS adultos)' : 'Ingresa peso y talla'}</div>
      </div>
    </div>
  )
}

function StepAntecedentes({ data, update, errors, toggleNA }) {
  return (
    <Section title="Antecedentes y comorbilidades" description="Enfermedades concomitantes, hábitos y medicación" icon={HeartPulse}>
      <Field label="Comorbilidades" required full error={errors.comorbilidades}
        naLabel={ANTECEDENTE_NEGATIVO} naValue={data.comorbilidades === NA} onToggleNA={() => toggleNA('comorbilidades')}>
        <TextArea value={data.comorbilidades} onChange={v => update('comorbilidades', v)}
          placeholder="Ej. HTA, DM2 controlada, hipotiroidismo en sustitución" error={errors.comorbilidades} />
      </Field>
      <Field label="Alergias" required full error={errors.alergias}
        naLabel={ANTECEDENTE_NEGATIVO} naValue={data.alergias === NA} onToggleNA={() => toggleNA('alergias')}>
        <TextArea value={data.alergias} onChange={v => update('alergias', v)}
          placeholder="Ej. Penicilina (rash), AINES (broncoespasmo)" rows={2} error={errors.alergias} />
      </Field>
      <Field label="Hábito tabáquico" required error={errors.habito_tabaquico}>
        <Select value={data.habito_tabaquico} onChange={v => update('habito_tabaquico', v)}
          options={[
            { value: 'nunca',     label: 'Nunca fumó' },
            { value: 'exfumador', label: 'Exfumador' },
            { value: 'activo',    label: 'Fumador activo' },
          ]} error={errors.habito_tabaquico} />
      </Field>
      <Field label="Hábito alcohólico" required error={errors.habito_alcohol}>
        <Select value={data.habito_alcohol} onChange={v => update('habito_alcohol', v)}
          options={[
            { value: 'nunca',     label: 'No consume' },
            { value: 'social',    label: 'Social ocasional' },
            { value: 'frecuente', label: 'Frecuente' },
            { value: 'abuso',     label: 'Abuso/dependencia' },
          ]} error={errors.habito_alcohol} />
      </Field>
      <Field label="Medicación actual" required full error={errors.medicacion_actual}
        naLabel={ANTECEDENTE_NEGATIVO} naValue={data.medicacion_actual === NA} onToggleNA={() => toggleNA('medicacion_actual')}>
        <TextArea value={data.medicacion_actual} onChange={v => update('medicacion_actual', v)}
          placeholder="Ej. Losartán 50 mg/día, metformina 850 mg c/12h" error={errors.medicacion_actual} />
      </Field>
    </Section>
  )
}

function StepEstudios({ data, update, errors, toggleNA, adj }) {
  return (
    <Section title="Estudios paraclínicos" description="Imágenes y laboratorio (los estudios diagnósticos van en Diagnóstico)" icon={FlaskConical}>
      <ImagenesEditor value={data.imagenes_list}
        onChange={v => update('imagenes_list', v)} />
      <Field label="Laboratorio relevante" required full error={errors.estudios_laboratorio}>
        <TextArea value={data.estudios_laboratorio} onChange={v => update('estudios_laboratorio', v)}
          placeholder="Ej. Hb 12.4, Leu 6800, Plaq 220k, Cr 0.9, BT 0.7..."
          error={errors.estudios_laboratorio} />
      </Field>
      <SeccionAdjuntos adj={adj} categorias={['imagenes', 'laboratorio']}
        texto="Adjunta los reportes de imágenes y laboratorios." />
    </Section>
  )
}

/* ──────────────────────────────────────────────────────────────
   STEP 6 — Tratamientos (REESTRUCTURADO)
   ────────────────────────────────────────────────────────────── */
function StepTratamientos({ data, update, updateContextoActual, errors, toggleNA }) {
  const naive = esPacienteNaive(data.contexto_actual)
  return (
    <Section title="Tratamientos previos y actual" description="Contexto terapéutico, tratamientos previos y modalidades" icon={Pill}>
      {/* TRATAMIENTO ACTUAL */}
      <div className="md:col-span-2">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-3 mt-2">
          📍 Situación actual del paciente
        </h3>
      </div>
      <Field label="Contexto terapéutico actual" required error={errors.contexto_actual}
        hint="Naive = sin tratamiento previo. En naive y neoadyuvancia no se diligencia tratamiento actual. Las líneas 1/2/3+ son de enfermedad metastásica.">
        <Select value={data.contexto_actual} onChange={updateContextoActual}
          options={CONTEXTO_OPTS} error={errors.contexto_actual} />
      </Field>
      <Field label="Tratamiento oncológico actual" required={!naive} error={errors.tratamiento_actual}
        hint={naive
          ? `Paciente ${etiquetaSinTx(data.contexto_actual)}: sin tratamiento oncológico actual.`
          : 'Oncológico que recibe ahora (incluye terapia dirigida / hormonoterapia / inmunoterapia si aplica). No es la medicación general.'}>
        <Input value={naive ? '' : data.tratamiento_actual} disabled={naive}
          onChange={v => update('tratamiento_actual', v)}
          placeholder={naive ? `No aplica (${etiquetaSinTx(data.contexto_actual)})` : 'Ej. Carboplatino + Pemetrexed'}
          error={errors.tratamiento_actual} />
      </Field>

      {/* QUIMIOTERAPIA Y LÍNEAS PREVIAS — campo único */}
      <div className="md:col-span-2 mt-4">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-3">
          📜 Tratamientos previos
        </h3>
      </div>
      <Field label="Quimioterapia y líneas previas" required full
        error={errors.quimioterapia_lineas_previas}
        naValue={data.quimioterapia_lineas_previas === NA}
        onToggleNA={() => toggleNA('quimioterapia_lineas_previas')}
        hint="Liste las líneas previas con sus tratamientos en orden cronológico.">
        <TextArea value={data.quimioterapia_lineas_previas}
          onChange={v => update('quimioterapia_lineas_previas', v)}
          rows={4}
          placeholder={`Ej.
Línea 1: Cisplatino + Etopósido x4 ciclos (2023)
Línea 2: Atezolizumab (2024-2025)
Línea 3: AC x4 ciclos + Paclitaxel x12 semanales (jul 2025-feb 2026)`}
          error={errors.quimioterapia_lineas_previas} />
      </Field>

      {/* OTRAS MODALIDADES */}
      <div className="md:col-span-2 mt-4">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-3">
          🔬 Otras modalidades terapéuticas oncoespecíficas
        </h3>
      </div>
      <Field label="Tratamiento quirúrgico" required full error={errors.tratamiento_quirurgico}
        naLabel={NO_HA_RECIBIDO} naValue={data.tratamiento_quirurgico === NA} onToggleNA={() => toggleNA('tratamiento_quirurgico')}>
        <TextArea value={data.tratamiento_quirurgico} onChange={v => update('tratamiento_quirurgico', v)}
          placeholder="Ej. Mastectomía radical modificada derecha + vaciamiento axilar (15/06/2025)"
          error={errors.tratamiento_quirurgico} />
      </Field>
      <Field label="Radioterapia" required full error={errors.tratamiento_rt}
        naLabel={NO_HA_RECIBIDO} naValue={data.tratamiento_rt === NA} onToggleNA={() => toggleNA('tratamiento_rt')}>
        <TextArea value={data.tratamiento_rt} onChange={v => update('tratamiento_rt', v)}
          placeholder="Ej. RT externa pared torácica 50 Gy en 25 fracciones"
          error={errors.tratamiento_rt} />
      </Field>
      <Field label="Terapias dirigidas / inmunoterapia / hormonoterapia"
        required full error={errors.tratamiento_dirigido}
        naLabel={NO_HA_RECIBIDO} naValue={data.tratamiento_dirigido === NA} onToggleNA={() => toggleNA('tratamiento_dirigido')}>
        <TextArea value={data.tratamiento_dirigido} onChange={v => update('tratamiento_dirigido', v)}
          placeholder="Ej. Tamoxifeno 20 mg/día desde abril 2026 (en curso)"
          error={errors.tratamiento_dirigido} />
      </Field>
      <Field label="Respuesta al tratamiento previo" required full error={errors.respuesta_previa}
        naValue={data.respuesta_previa === NA} onToggleNA={() => toggleNA('respuesta_previa')}>
        <TextArea value={data.respuesta_previa} onChange={v => update('respuesta_previa', v)}
          placeholder="Ej. Respuesta parcial inicial. Progresión hepática documentada en TAC del 20/04/2026 (RECIST 1.1)"
          error={errors.respuesta_previa} />
      </Field>
    </Section>
  )
}

/* ──────────────────────────────────────────────────────────────
   STEP 7 — Valoraciones interdisciplinarias (opcional)
   ────────────────────────────────────────────────────────────── */
function ValoracionField({ label, valorado, concepto, onValoradoChange, onConceptoChange, error }) {
  const opciones = [
    { label: 'Sí', value: true },
    { label: 'No', value: false },
  ]
  return (
    <div className="md:col-span-2 bg-slate-50 border border-slate-200 rounded-xl p-4">
      <h3 className="text-sm font-bold text-slate-800 mb-3">Valoración por {label}</h3>
      <div className="flex flex-wrap gap-2">
        {opciones.map(o => {
          const activo = valorado === o.value
          return (
            <button key={String(o.value)} type="button"
              onClick={() => onValoradoChange(o.value)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${
                activo
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-700 border-slate-300 hover:border-blue-400'
              }`}>
              {o.label}
            </button>
          )
        })}
      </div>
      {valorado === true && (
        <div className="mt-3">
          <label className="text-sm font-semibold text-slate-800 block mb-1.5">
            Concepto/observaciones de {label}
          </label>
          <TextArea value={concepto} onChange={onConceptoChange} rows={3}
            placeholder={`Resumen del concepto de ${label}...`} />
        </div>
      )}
      {error && <p className="text-xs text-red-600 mt-2 font-medium">{error}</p>}
    </div>
  )
}

function StepValoraciones({ data, update, errors }) {
  return (
    <Section title="Valoraciones interdisciplinarias"
      description="¿El paciente fue valorado por las disciplinas de apoyo?" icon={Users}>
      <ValoracionField label="Psicología"
        valorado={data.valorado_psicologia} concepto={data.concepto_psicologia}
        onValoradoChange={v => update('valorado_psicologia', v)} error={errors.valorado_psicologia}
        onConceptoChange={v => update('concepto_psicologia', v)} />
      <ValoracionField label="Trabajo social"
        valorado={data.valorado_trabajo_social} concepto={data.concepto_trabajo_social}
        onValoradoChange={v => update('valorado_trabajo_social', v)} error={errors.valorado_trabajo_social}
        onConceptoChange={v => update('concepto_trabajo_social', v)} />
      <ValoracionField label="Cuidados paliativos"
        valorado={data.valorado_paliativos} concepto={data.concepto_paliativos}
        onValoradoChange={v => update('valorado_paliativos', v)} error={errors.valorado_paliativos}
        onConceptoChange={v => update('concepto_paliativos', v)} />
    </Section>
  )
}

function StepEvidencia({ data, update, errors, toggleNA, protocolos, setProtocolos }) {
  const sinPropuesta = data.protocolo_id === NA
  const [nuevoProtocolo, setNuevoProtocolo] = useState(false)
  const onProtocoloChange = (id) => {
    update('protocolo_id', id)
    aplicarProtocolo(protocolos.find(x => String(x.id) === String(id)))
  }
  const aplicarProtocolo = (p) => {
    if (p) {
      if (p.estudio_pivotal) update('evidencia_referencia', p.estudio_pivotal)
      if (p.tipo_evidencia)  update('evidencia_tipo', p.tipo_evidencia)
      if (p.evidencia_link)  update('evidencia_link', p.evidencia_link)
      if (p.pfs_esperado_meses != null) update('pfs_esperado_estudio', p.pfs_esperado_meses)
      if (p.os_esperado_meses != null)  update('os_esperado_estudio', p.os_esperado_meses)
      if (p.tipo_duracion) {
        update('duracion_propuesto', p.tipo_duracion)
        update('ciclos_propuesto', p.ciclos_esquema != null ? String(p.ciclos_esquema) : '')
      }
      if (p.dias_ciclo) update('dias_ciclo_propuesto', String(p.dias_ciclo))
    }
  }

  return (
    <Section title="Estudio que avala la solicitud" description="Evidencia pivotal del tratamiento PROPUESTO" icon={BookOpen}>
      <Field label="Protocolo / régimen propuesto" required full error={errors.protocolo_id}
        naLabel={SIN_PROPUESTA} naValue={sinPropuesta} onToggleNA={() => toggleNA('protocolo_id')}
        hint={sinPropuesta
          ? 'Sin propuesta: el estudio, PFS y OS esperados dejan de ser obligatorios.'
          : 'Al seleccionar un protocolo se autocompletan el estudio, el tipo de estudio, el enlace y el PFS/OS esperados.'}>
        <Select value={data.protocolo_id} onChange={onProtocoloChange}
          options={protocolos.map(p => ({
            value: p.id,
            label: `${p.nombre}${p.estudio_pivotal ? ` — ${p.estudio_pivotal}` : ''}`,
          }))} placeholder="Seleccione un protocolo del catálogo..." error={errors.protocolo_id} />
        <button type="button" onClick={() => setNuevoProtocolo(true)}
          className="mt-1.5 text-xs font-semibold text-blue-700 hover:underline">
          ¿No está en el catálogo? + Agregar protocolo
        </button>
      </Field>
      {nuevoProtocolo && (
        <NuevoProtocoloModal
          inicial={{ cie10: data.cie10 && data.cie10 !== NA ? data.cie10 : '',
                     diagnostico: data.diagnostico_descripcion && data.diagnostico_descripcion !== NA ? data.diagnostico_descripcion : '' }}
          onClose={() => setNuevoProtocolo(false)}
          onCreado={(p) => {
            setNuevoProtocolo(false)
            setProtocolos(prev => [...prev, p].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
            update('protocolo_id', String(p.id))
            aplicarProtocolo(p)
          }} />
      )}
      <Field label="Estudio o referencia bibliográfica" required={!sinPropuesta} full error={errors.evidencia_referencia}>
        <Input value={data.evidencia_referencia} onChange={v => update('evidencia_referencia', v)}
          placeholder="Ej. KEYNOTE-189, FLAURA, CLEOPATRA" error={errors.evidencia_referencia} />
      </Field>
      <Field label="Tipo de evidencia">
        <Select value={data.evidencia_tipo} onChange={v => update('evidencia_tipo', v)}
          options={TIPOS_EVIDENCIA} />
      </Field>
      <Field label="Enlace al estudio (DOI / PubMed)">
        <Input value={data.evidencia_link} onChange={v => update('evidencia_link', v)}
          placeholder="https://doi.org/..." />
      </Field>
      <Field label="PFS esperado del PROPUESTO (meses)" required={!sinPropuesta} error={errors.pfs_esperado_estudio}
        hint="Progression-Free Survival reportado en el estudio pivotal.">
        <Input type="number" step="0.1" min="0" value={data.pfs_esperado_estudio}
          onChange={v => update('pfs_esperado_estudio', v)} placeholder="Ej. 8.8"
          error={errors.pfs_esperado_estudio} />
      </Field>
      <Field label="OS esperado del PROPUESTO (meses)" required={!sinPropuesta} error={errors.os_esperado_estudio}
        hint="Overall Survival reportado en el estudio pivotal (referencia clínica).">
        <Input type="number" step="0.1" min="0" value={data.os_esperado_estudio}
          onChange={v => update('os_esperado_estudio', v)} placeholder="Ej. 22.0"
          error={errors.os_esperado_estudio} />
      </Field>
      {!sinPropuesta && (
        <DuracionEditor
          titulo="Duración del tratamiento propuesto"
          modo={data.duracion_propuesto} ciclos={data.ciclos_propuesto} error={errors.ciclos_propuesto}
          onModo={v => update('duracion_propuesto', v)} onCiclos={v => update('ciclos_propuesto', v)}
          etiquetaCiclos={{ fija: 'Ciclos del esquema', tope: 'Máximo de ciclos' }} />
      )}
    </Section>
  )
}

function StepPregunta({ data, update, errors, toggleNA, protocolos }) {
  const protocolo = protocoloElegido(data, protocolos)
  return (
    <Section title="Pregunta al comité" description="Motivo concreto de presentación y propuesta clínica" icon={MessageSquareQuote}>
      <Field label="¿Cuál es la pregunta específica para el comité?"
        required full error={errors.pregunta_comite}>
        <TextArea value={data.pregunta_comite} onChange={v => update('pregunta_comite', v)}
          rows={4}
          placeholder="Ej. ¿Está justificado iniciar segunda línea con osimertinib o se debe rebiopsiar para identificar T790M antes?"
          error={errors.pregunta_comite} />
      </Field>
      <Field label="Contexto terapéutico propuesto">
        <Select value={data.contexto_propuesto} onChange={v => update('contexto_propuesto', v)}
          options={CONTEXTO_OPTS} />
      </Field>
      <Field label="¿Fuera de protocolo?"
        hint="El tratamiento propuesto ya se definió en Evidencia; aquí indica si es fuera de protocolo.">
        <Select value={data.fuera_protocolo} onChange={v => update('fuera_protocolo', v)}
          options={[{ value: 'no', label: 'No — dentro de protocolo' }, { value: 'si', label: 'Sí — fuera de protocolo' }]} />
      </Field>
      {protocolo ? (
        <Field label="Tratamiento propuesto" required full
          hint="Tomado del protocolo elegido en Evidencia. Para cambiarlo, cambia el protocolo propuesto.">
          <Input value={protocolo.nombre} disabled onChange={() => {}} />
        </Field>
      ) : (
        <Field label="Tratamiento propuesto" required full error={errors.tratamiento_propuesto}
          naLabel={SIN_PROPUESTA} naValue={data.tratamiento_propuesto === NA}
          onToggleNA={() => toggleNA('tratamiento_propuesto')}
          hint="No se eligió protocolo en Evidencia: describe el tratamiento o marca «Sin propuesta»">
          <TextArea value={data.tratamiento_propuesto} onChange={v => update('tratamiento_propuesto', v)}
            rows={3}
            placeholder="Ej. Osimertinib 80 mg/día VO continuo hasta progresión o toxicidad inaceptable"
            error={errors.tratamiento_propuesto} />
        </Field>
      )}
      <Field label="Justificación clínica" required full error={errors.justificacion_clinica}>
        <TextArea value={data.justificacion_clinica} onChange={v => update('justificacion_clinica', v)}
          rows={4}
          placeholder="Argumente por qué este paciente se beneficiaría del tratamiento propuesto..."
          error={errors.justificacion_clinica} />
      </Field>
    </Section>
  )
}

/* ──────────────────────────────────────────────────────────────
   STEP 9 — Costos por ciclo + Proyección PFS (cálculo)
              + OS atenuado como referencia
   ────────────────────────────────────────────────────────────── */
function StepCostos({ data, update, errors, toggleNA, proyeccion }) {
  const pfsActualNA = data.pfs_actual_meses === NA
  const osActualNA  = data.os_actual_meses === NA
  const naive = esPacienteNaive(data.contexto_actual)

  return (
    <Section
      title="Costos del tratamiento por ciclo"
      description="El costo se calcula hasta la progresión (PFS), cuando se cambia de línea, o por los ciclos del esquema en tratamientos de duración fija. La SG es solo referencia clínica."
      icon={DollarSign}
    >
      {/* TRATAMIENTO ACTUAL */}
      <div className="md:col-span-2">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-3 mt-2">
          🩺 Tratamiento actual del paciente
        </h3>
      </div>
      {naive && (
        <div className="md:col-span-2 -mt-2 mb-1 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-800">
          Paciente {etiquetaSinTx(data.contexto_actual)} — sin tratamiento oncológico actual. No aplica costo ni supervivencia
          del tratamiento actual.
        </div>
      )}
      <Field label="Costo por ciclo (COP)" required={!naive} error={errors.costo_ciclo_actual}>
        <Input type="number" min="0" value={data.costo_ciclo_actual} disabled={naive}
          onChange={v => update('costo_ciclo_actual', v)} placeholder="Ej. 2500000"
          error={errors.costo_ciclo_actual} />
      </Field>
      <Field label="Duración del ciclo (días)" required={!naive} error={errors.dias_ciclo_actual}>
        <Input type="number" min="1" value={data.dias_ciclo_actual} disabled={naive}
          onChange={v => update('dias_ciclo_actual', v)} placeholder="21"
          error={errors.dias_ciclo_actual} />
      </Field>
      {!naive && (
        <DuracionEditor
          titulo="Duración del tratamiento actual"
          modo={data.duracion_actual} ciclos={data.ciclos_actual} error={errors.ciclos_actual}
          onModo={v => update('duracion_actual', v)} onCiclos={v => update('ciclos_actual', v)}
          etiquetaCiclos={{ fija: 'Ciclos que le faltan', tope: 'Máximo de ciclos que le faltan' }} />
      )}
      <Field label="PFS estimado actual (meses)" required={!naive && data.duracion_actual !== 'fija'} error={errors.pfs_actual_meses}
        naValue={pfsActualNA} onToggleNA={naive ? undefined : () => toggleNA('pfs_actual_meses')}
        hint={naive ? undefined : "Si el paciente es naive (línea 0), marque 'No aplica'."}>
        <Input type="number" step="0.1" min="0" value={data.pfs_actual_meses} disabled={naive}
          onChange={v => update('pfs_actual_meses', v)} placeholder="Ej. 4.5"
          error={errors.pfs_actual_meses} />
      </Field>
      <Field label="OS estimado actual (meses)" required={!naive && data.duracion_actual !== 'fija'} error={errors.os_actual_meses}
        naValue={osActualNA} onToggleNA={naive ? undefined : () => toggleNA('os_actual_meses')}
        hint={naive ? undefined : 'Referencia clínica. No entra en el costo: al progresar se cambia de línea.'}>
        <Input type="number" step="0.1" min="0" value={data.os_actual_meses} disabled={naive}
          onChange={v => update('os_actual_meses', v)} placeholder="Ej. 13.5"
          error={errors.os_actual_meses} />
      </Field>

      {/* TRATAMIENTO PROPUESTO */}
      <div className="md:col-span-2 mt-4">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-3">
          💊 Tratamiento propuesto
        </h3>
      </div>
      <Field label="Costo por ciclo (COP)" required={data.protocolo_id !== NA} error={errors.costo_ciclo_propuesto}>
        <Input type="number" min="0" value={data.costo_ciclo_propuesto}
          onChange={v => update('costo_ciclo_propuesto', v)} placeholder="Ej. 8000000"
          error={errors.costo_ciclo_propuesto} />
      </Field>
      <Field label="Duración del ciclo (días)" required={data.protocolo_id !== NA} error={errors.dias_ciclo_propuesto}>
        <Input type="number" min="1" value={data.dias_ciclo_propuesto}
          onChange={v => update('dias_ciclo_propuesto', v)} placeholder="28"
          error={errors.dias_ciclo_propuesto} />
      </Field>
      <Field label="Duración del propuesto" hint="Se define en el paso Evidencia">
        <Input disabled value={
          data.duracion_propuesto === 'fija' ? `Duración fija · ${data.ciclos_propuesto || '—'} ciclos`
          : data.duracion_propuesto === 'tope' ? `Hasta progresión (PFS ${data.pfs_esperado_estudio || '—'} m), máx. ${data.ciclos_propuesto || '—'} ciclos`
          : data.pfs_esperado_estudio ? `Hasta progresión · PFS ${data.pfs_esperado_estudio} meses` : ''}
          placeholder="Llene primero el paso Evidencia" />
      </Field>
      <Field label="OS esperado propuesto" hint="Solo referencia clínica, no se calcula">
        <Input value={data.os_esperado_estudio ? `${data.os_esperado_estudio} meses` : ''} disabled
          placeholder="Llene primero el paso Evidencia" />
      </Field>

      {/* COMPLIANCE REGULATORIO */}
      <div className="md:col-span-2 mt-4">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-3">
          📋 Estatus regulatorio
        </h3>
      </div>
      <Field label="¿Tiene INVIMA?">
        <Select value={data.tiene_invima} onChange={v => update('tiene_invima', v)}
          options={[
            { value: 'si', label: 'Sí, registro INVIMA vigente' },
            { value: 'no', label: 'No tiene INVIMA' },
          ]} />
      </Field>
      <Field label="¿Está en base UNIRS?">
        <Select value={data.en_unirse} onChange={v => update('en_unirse', v)}
          options={[
            { value: 'si', label: 'Sí, en UNIRS' },
            { value: 'no', label: 'No está en UNIRS' },
          ]} />
      </Field>

      {/* PROYECCIÓN AUTOMÁTICA */}
      {proyeccion ? (
        <div className="md:col-span-2 mt-6 bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-5">
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="text-sm font-bold text-blue-900 uppercase tracking-wide">
              📊 Proyección de impacto económico
            </h3>
            <span className="text-[10px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
              Costo del tratamiento
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <CardActual proy={proyeccion} />
            <CardPropuesto proy={proyeccion} />
          </div>

          <div className="bg-white rounded-lg p-4 border-2 border-blue-300">
            <div className="text-[11px] font-bold text-blue-900 uppercase mb-3">
              ⚖️ Diferencial (propuesto − actual)
            </div>
            {proyeccion.diferencial.es_naive ? (
              <div className="text-sm text-slate-700 italic">
                {mensajeSinDiferencial(proyeccion.diferencial.motivo_sin_diferencial)}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <DiffRow
                  label="Diferencia en el costo del tratamiento"
                  value={proyeccion.diferencial.diferencia_pfs} />
                {proyeccion.diferencial.ganancia_pfs_meses != null ? (
                  <DiffRow
                    label={`Costo por mes ganado de PFS (${proyeccion.diferencial.ganancia_pfs_meses > 0 ? '+' : ''}${proyeccion.diferencial.ganancia_pfs_meses}m)`}
                    value={proyeccion.diferencial.costo_por_mes_pfs_ganado} />
                ) : (
                  <div className="text-xs text-slate-500 self-center">
                    Costo por mes de PFS ganado: no aplica en tratamientos de duración fija.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="md:col-span-2 mt-4 bg-amber-50 border-2 border-amber-200 rounded-xl p-4 text-sm text-amber-900">
          ⚠️ Llene el costo y la duración del ciclo, y en el paso Evidencia el PFS o los ciclos del esquema, para ver la proyección automática.
        </div>
      )}
    </Section>
  )
}

// La SG (OS) solo se muestra como dato clínico: el costo va hasta la progresión
function OsReferencia({ meses }) {
  return (
    <div className="mt-1 pt-1 border-t border-slate-200 text-xs text-slate-500">
      SG (OS) de referencia: {meses} meses · no entra en el costo
    </div>
  )
}

function CardActual({ proy }) {
  const a = proy.actual
  const sinCalculo = a.total_pfs == null
  return (
    <div className="bg-white rounded-lg p-3 border border-blue-100">
      <div className="text-[11px] font-bold text-slate-700 uppercase mb-2">Tratamiento actual</div>
      {sinCalculo ? (
        <div className="text-xs text-slate-500 italic py-3">
          {mensajeCostoPrevio(proy.diferencial?.motivo_sin_diferencial)}
        </div>
      ) : (
        <div className="space-y-1 text-sm">
          <Row label={etiquetaCiclos(a)}
            value={`${a.ciclos_pfs} × ${fmtCOP(a.costo_ciclo)}`} />
          <Row label="= Costo total del tratamiento" value={fmtCOP(a.total_pfs)} bold />
          {a.os_meses != null && <OsReferencia meses={a.os_meses} />}
        </div>
      )}
    </div>
  )
}

function CardPropuesto({ proy }) {
  const p = proy.propuesto
  return (
    <div className="bg-white rounded-lg p-3 border border-blue-100">
      <div className="text-[11px] font-bold text-blue-800 uppercase mb-2">Tratamiento propuesto</div>
      <div className="space-y-1 text-sm">
        <Row label={etiquetaCiclos(p)}
          value={`${p.ciclos_pfs} × ${fmtCOP(p.costo_ciclo)}`} />
        <Row label="= Costo total del tratamiento" value={fmtCOP(p.total_pfs)} bold />
        {p.os_meses != null && <OsReferencia meses={p.os_meses} />}
      </div>
    </div>
  )
}

function Row({ label, value, bold, small }) {
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className={`text-slate-600 ${small ? 'text-[11px]' : 'text-xs'}`}>{label}</span>
      <span className={`text-slate-900 ${bold ? 'font-bold' : ''} ${small ? 'text-xs' : ''}`}>{value}</span>
    </div>
  )
}

// Selector de duración del tratamiento + número de ciclos (fija / tope)
function DuracionEditor({ titulo, modo, ciclos, error, onModo, onCiclos, etiquetaCiclos: etq }) {
  const conCiclos = modo === 'fija' || modo === 'tope'
  return (
    <>
      <Field label={titulo} required
        hint={modo === 'fija'
          ? 'Se costean los ciclos del esquema (adyuvancia, neoadyuvancia, consolidación). No depende del PFS.'
          : modo === 'tope'
            ? 'Se costea hasta la progresión, sin pasar del máximo de ciclos (p. ej. pembrolizumab 35 ciclos).'
            : 'Se costea hasta la progresión: ciclos = PFS × 30 ÷ días del ciclo.'}>
        <Select value={modo || 'hasta_progresion'} onChange={v => onModo(v || 'hasta_progresion')} options={TIPOS_DURACION} />
      </Field>
      {conCiclos ? (
        <Field label={etq[modo]} required error={error}>
          <Input type="number" min="1" step="1" value={ciclos} onChange={onCiclos} placeholder="Ej. 17" error={error} />
        </Field>
      ) : <div />}
    </>
  )
}

function DiffRow({ label, value }) {
  if (value == null) return (
    <div>
      <div className="text-[11px] text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-slate-400 italic text-sm">No calculable</div>
    </div>
  )
  const positive = value > 0
  return (
    <div>
      <div className="text-[11px] text-slate-500 uppercase tracking-wide">{label}</div>
      <div className={`font-bold text-base ${positive ? 'text-rose-700' : 'text-emerald-700'}`}>
        {positive ? '+ ' : '− '}{fmtCOP(Math.abs(value))}
      </div>
    </div>
  )
}

// Bloque de adjuntos dentro de una sección del formulario (solo las categorías de esa sección)
function SeccionAdjuntos({ adj, categorias, texto }) {
  return (
    <div className="md:col-span-2 mt-2 pt-4 border-t border-slate-200">
      <div className="flex items-center gap-2 mb-1">
        <Paperclip className="w-4 h-4 text-slate-600" />
        <span className="text-sm font-bold text-slate-800">Documentos de soporte</span>
        <span className="text-xs text-slate-500">(opcional)</span>
      </div>
      <p className="text-xs text-slate-600 mb-2">{texto} También puedes hacerlo en el paso final de Adjuntos.</p>
      <AdjuntosPorCategoria adjuntos={adj.lista} categorias={categorias}
        onAgregar={adj.agregar} onEliminar={adj.eliminar} />
    </div>
  )
}

function StepAdjuntos({ adj }) {
  return (
    <Section title="Adjuntos" description="Historia clínica, patologías, imágenes y demás soportes para presentar en el comité" icon={Paperclip}>
      <div className="md:col-span-2">
        <p className="text-sm text-slate-600 mb-3">
          Aquí están todos los documentos del caso, incluidos los que adjuntaste en los pasos anteriores.
          Usa «Adjuntar» en el tipo de documento que corresponda. Se verán en la pantalla del comité y se pueden agregar más después desde el caso.
        </p>
        <AdjuntosPorCategoria adjuntos={adj.lista} onAgregar={adj.agregar} onEliminar={adj.eliminar} />
      </div>
    </Section>
  )
}
