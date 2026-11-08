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
export const ACCEPT_ADJUNTOS = '.pdf,.jpg,.jpeg,.png'

export const esImagen = (f) => /^image\//.test(f?.type || '') || /\.(jpe?g|png)$/i.test(f?.name || '')
export const esPdf = (f) => f?.type === 'application/pdf' || /\.pdf$/i.test(f?.name || '')

const sanitize = (name) => name.replace(/[^\w.\-]/g, '_').replace(/_+/g, '_')

// Sube los archivos al bucket privado "adjuntos" y devuelve las entradas para casos_comite.adjuntos
export async function subirAdjuntos(files, categoria = 'otro') {
  const grandes = files.filter(f => f.size > MAX_MB * 1024 * 1024)
  if (grandes.length) throw new Error(`${grandes.map(f => f.name).join(', ')} supera ${MAX_MB} MB`)
  const nuevos = []
  for (const file of files) {
    const path = `casos/${Date.now()}_${sanitize(file.name)}`
    const { error } = await supabase.storage.from('adjuntos').upload(path, file, { upsert: false })
    if (error) throw error
    nuevos.push({ name: file.name, path, size: file.size, type: file.type, categoria })
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
