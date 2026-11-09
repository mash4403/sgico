import { supabase } from './supabase'

// Clasificación de los adjuntos del caso (casos_comite.adjuntos[].categoria)
export const CATEGORIAS_ADJUNTO = [
  { value: 'historia_clinica', label: 'Historia clínica' },
  { value: 'patologia',        label: 'Patología' },
  { value: 'imagenes',         label: 'Imágenes diagnósticas' },
  { value: 'laboratorio',      label: 'Laboratorio' },
  { value: 'molecular',        label: 'Molecular / NGS' },
  { value: 'consentimiento',   label: 'Consentimiento' },
  { value: 'otro',             label: 'Otro' },
]
export const categoriaLabel = (c) =>
  CATEGORIAS_ADJUNTO.find(x => x.value === c)?.label || 'Otro'

export const MAX_MB = 25
// PDF e imágenes se ven dentro del comité; Word/Excel/HEIC se abren en otra pestaña.
export const ACCEPT_ADJUNTOS = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.doc,.docx,.xls,.xlsx'
export const FORMATOS_ADJUNTOS = 'PDF, imágenes (JPG, PNG, HEIC) o Word/Excel'

export async function eliminarArchivoAdjunto(path) {
  try { await supabase.storage.from('adjuntos').remove([path]) } catch { /* el registro se quita igual */ }
}

// Solo formatos que el navegador muestra (HEIC no: se abre en otra pestaña)
export const esImagen = (f) => /^image\/(jpeg|png|webp|gif)$/.test(f?.type || '') || /\.(jpe?g|png|webp|gif)$/i.test(f?.name || '')
export const esPdf = (f) => f?.type === 'application/pdf' || /\.pdf$/i.test(f?.name || '')

// El bucket solo admite estos tipos (migración 023). Algunos navegadores no
// informan el tipo de HEIC o de Office: se deduce de la extensión.
const MIME_POR_EXTENSION = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  heic: 'image/heic', heif: 'image/heif', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}
const tipoArchivo = (file) => {
  const porExt = MIME_POR_EXTENSION[(file.name.split('.').pop() || '').toLowerCase()]
  return Object.values(MIME_POR_EXTENSION).includes(file.type) ? file.type : porExt
}

const sanitize = (name) => name.replace(/[^\w.\-]/g, '_').replace(/_+/g, '_')

// Sube los archivos al bucket privado "adjuntos" y devuelve las entradas para casos_comite.adjuntos
export async function subirAdjuntos(files, categoria = 'otro') {
  const grandes = files.filter(f => f.size > MAX_MB * 1024 * 1024)
  if (grandes.length) throw new Error(`${grandes.map(f => f.name).join(', ')} supera ${MAX_MB} MB`)
  const noPermitidos = files.filter(f => !tipoArchivo(f))
  if (noPermitidos.length) throw new Error(`${noPermitidos.map(f => f.name).join(', ')}: formato no permitido (${FORMATOS_ADJUNTOS})`)
  const nuevos = []
  for (const file of files) {
    const path = `casos/${Date.now()}_${sanitize(file.name)}`
    const contentType = tipoArchivo(file)
    const { error } = await supabase.storage.from('adjuntos').upload(path, file, { upsert: false, contentType })
    if (error) throw error
    nuevos.push({ name: file.name, path, size: file.size, type: contentType, categoria })
  }
  return nuevos
}

export async function urlAdjunto(path, segundos = 3600) {
  const { data, error } = await supabase.storage.from('adjuntos').createSignedUrl(path, segundos)
  if (error) throw error
  return data.signedUrl
}

// Agrega adjuntos a un caso ya creado
export async function agregarAdjuntosACaso(casoId, actuales, nuevos) {
  const adjuntos = [...(actuales || []), ...nuevos]
  const { data, error } = await supabase.from('casos_comite')
    .update({ adjuntos }).eq('id', casoId).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('el caso no se actualizó')
  return adjuntos
}
