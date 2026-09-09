// Catálogo de arranque de tipos histológicos oncológicos.
// Basado en los protocolos de cáncer del College of American Pathologists (CAP)
// y la clasificación WHO; pensado para acoplar con las variables histológicas
// de la Cuenta de Alto Costo (CAC).
//
// `grupos` referencia los subgrupos del catálogo CIE-10 (src/lib/cie10.js) para
// poder filtrar las histologías por el diagnóstico seleccionado. Un ítem con
// grupo 'General' aplica a cualquier sitio.
// `sinonimos` alimenta el buscador (no se reporta).
//
// NO exhaustivo. Validar/ampliar contra el protocolo CAP del sitio y el
// diccionario de datos de la CAC antes de uso en producción.

export const HISTOLOGIAS = [
  // ── General / transversal ──
  { nombre: 'Adenocarcinoma, NOS', grupos: ['General'], sinonimos: ['adenocarcinoma no especificado'] },
  { nombre: 'Carcinoma escamocelular (epidermoide), NOS', grupos: ['General'], sinonimos: ['carcinoma escamoso', 'espinocelular', 'SCC'] },
  { nombre: 'Carcinoma indiferenciado, NOS', grupos: ['General'], sinonimos: ['carcinoma pobremente diferenciado'] },
  { nombre: 'Carcinoma adenoescamoso', grupos: ['General'], sinonimos: [] },
  { nombre: 'Tumor neuroendocrino (TNE) G1', grupos: ['General', 'Aparato digestivo'], sinonimos: ['carcinoide', 'NET G1'] },
  { nombre: 'Tumor neuroendocrino (TNE) G2', grupos: ['General', 'Aparato digestivo'], sinonimos: ['NET G2'] },
  { nombre: 'Tumor neuroendocrino (TNE) G3', grupos: ['General', 'Aparato digestivo'], sinonimos: ['NET G3'] },
  { nombre: 'Carcinoma neuroendocrino de células pequeñas', grupos: ['General', 'Aparato respiratorio e intratorácico'], sinonimos: ['small cell', 'oat cell', 'células pequeñas'] },
  { nombre: 'Carcinoma neuroendocrino de células grandes', grupos: ['General'], sinonimos: ['LCNEC'] },

  // ── Mama ──
  { nombre: 'Carcinoma invasivo de tipo no especial (NST / ductal)', grupos: ['Mama'], sinonimos: ['ductal infiltrante', 'ductal invasivo', 'IDC', 'NST'] },
  { nombre: 'Carcinoma lobulillar invasivo', grupos: ['Mama'], sinonimos: ['lobular infiltrante', 'ILC'] },
  { nombre: 'Carcinoma ductal in situ (CDIS)', grupos: ['Mama'], sinonimos: ['DCIS', 'intraductal in situ'] },
  { nombre: 'Carcinoma lobulillar in situ (CLIS)', grupos: ['Mama'], sinonimos: ['LCIS'] },
  { nombre: 'Carcinoma tubular de mama', grupos: ['Mama'], sinonimos: [] },
  { nombre: 'Carcinoma mucinoso de mama', grupos: ['Mama'], sinonimos: ['coloide'] },
  { nombre: 'Carcinoma metaplásico de mama', grupos: ['Mama'], sinonimos: [] },
  { nombre: 'Carcinoma micropapilar invasivo de mama', grupos: ['Mama'], sinonimos: [] },
  { nombre: 'Enfermedad de Paget del pezón', grupos: ['Mama'], sinonimos: [] },

  // ── Pulmón / tórax ──
  { nombre: 'Adenocarcinoma de pulmón', grupos: ['Aparato respiratorio e intratorácico'], sinonimos: ['adenocarcinoma pulmonar', 'CPCNP adenocarcinoma'] },
  { nombre: 'Carcinoma escamocelular de pulmón', grupos: ['Aparato respiratorio e intratorácico'], sinonimos: ['escamoso pulmonar', 'CPCNP escamoso'] },
  { nombre: 'Carcinoma de células grandes de pulmón', grupos: ['Aparato respiratorio e intratorácico'], sinonimos: [] },
  { nombre: 'Carcinoma pulmonar de células pequeñas (CPCP)', grupos: ['Aparato respiratorio e intratorácico'], sinonimos: ['SCLC', 'oat cell', 'microcítico'] },
  { nombre: 'Carcinoma adenoescamoso de pulmón', grupos: ['Aparato respiratorio e intratorácico'], sinonimos: [] },
  { nombre: 'Mesotelioma epitelioide', grupos: ['Mesotelial y tejidos blandos', 'Aparato respiratorio e intratorácico'], sinonimos: ['mesotelioma pleural'] },
  { nombre: 'Mesotelioma sarcomatoide', grupos: ['Mesotelial y tejidos blandos'], sinonimos: [] },
  { nombre: 'Mesotelioma bifásico', grupos: ['Mesotelial y tejidos blandos'], sinonimos: ['mixto'] },
  { nombre: 'Timoma', grupos: ['Aparato respiratorio e intratorácico'], sinonimos: [] },
  { nombre: 'Carcinoma tímico', grupos: ['Aparato respiratorio e intratorácico'], sinonimos: [] },

  // ── Colorrecto / digestivo ──
  { nombre: 'Adenocarcinoma colorrectal', grupos: ['Aparato digestivo'], sinonimos: ['adenocarcinoma de colon', 'adenocarcinoma de recto', 'CCR'] },
  { nombre: 'Adenocarcinoma mucinoso colorrectal', grupos: ['Aparato digestivo'], sinonimos: ['coloide'] },
  { nombre: 'Carcinoma de células en anillo de sello', grupos: ['Aparato digestivo'], sinonimos: ['signet ring'] },
  { nombre: 'Adenocarcinoma gástrico tipo intestinal', grupos: ['Aparato digestivo'], sinonimos: ['gastrico intestinal'] },
  { nombre: 'Adenocarcinoma gástrico tipo difuso', grupos: ['Aparato digestivo'], sinonimos: ['linitis plastica', 'gastrico difuso'] },
  { nombre: 'Adenocarcinoma de esófago', grupos: ['Aparato digestivo'], sinonimos: [] },
  { nombre: 'Carcinoma escamocelular de esófago', grupos: ['Aparato digestivo'], sinonimos: [] },
  { nombre: 'Adenocarcinoma de páncreas (ductal)', grupos: ['Aparato digestivo'], sinonimos: ['PDAC', 'adenocarcinoma ductal pancreatico'] },
  { nombre: 'Carcinoma hepatocelular', grupos: ['Aparato digestivo'], sinonimos: ['hepatocarcinoma', 'CHC', 'HCC'] },
  { nombre: 'Colangiocarcinoma', grupos: ['Aparato digestivo'], sinonimos: ['carcinoma de vias biliares'] },
  { nombre: 'Tumor del estroma gastrointestinal (GIST)', grupos: ['Aparato digestivo', 'Mesotelial y tejidos blandos'], sinonimos: ['GIST', 'estromal gastrointestinal'] },

  // ── Próstata / genitourinario masculino ──
  { nombre: 'Adenocarcinoma acinar de próstata', grupos: ['Genitourinario masculino'], sinonimos: ['adenocarcinoma prostatico', 'acinar'] },
  { nombre: 'Adenocarcinoma ductal de próstata', grupos: ['Genitourinario masculino'], sinonimos: [] },
  { nombre: 'Seminoma', grupos: ['Genitourinario masculino'], sinonimos: ['tumor de celulas germinales seminomatoso'] },
  { nombre: 'Tumor de células germinales no seminomatoso', grupos: ['Genitourinario masculino'], sinonimos: ['NSGCT', 'carcinoma embrionario', 'teratoma', 'tumor del saco vitelino', 'coriocarcinoma'] },

  // ── Tracto urinario / riñón ──
  { nombre: 'Carcinoma urotelial (células transicionales)', grupos: ['Tracto urinario'], sinonimos: ['transicional', 'carcinoma vesical urotelial'] },
  { nombre: 'Carcinoma de células renales de células claras', grupos: ['Tracto urinario'], sinonimos: ['CCR células claras', 'clear cell', 'hipernefroma'] },
  { nombre: 'Carcinoma de células renales papilar', grupos: ['Tracto urinario'], sinonimos: ['papilar renal'] },
  { nombre: 'Carcinoma de células renales cromófobo', grupos: ['Tracto urinario'], sinonimos: ['chromophobe'] },

  // ── Ginecológico ──
  { nombre: 'Carcinoma escamocelular de cérvix', grupos: ['Ginecológico'], sinonimos: ['escamoso cervical'] },
  { nombre: 'Adenocarcinoma de cérvix', grupos: ['Ginecológico'], sinonimos: ['adenocarcinoma cervical'] },
  { nombre: 'Adenocarcinoma endometrioide', grupos: ['Ginecológico'], sinonimos: ['endometrio endometrioide'] },
  { nombre: 'Carcinoma seroso de endometrio', grupos: ['Ginecológico'], sinonimos: ['seroso uterino'] },
  { nombre: 'Carcinoma seroso de alto grado de ovario', grupos: ['Ginecológico'], sinonimos: ['HGSC', 'ovario seroso'] },
  { nombre: 'Carcinoma endometrioide de ovario', grupos: ['Ginecológico'], sinonimos: [] },
  { nombre: 'Carcinoma de células claras de ovario', grupos: ['Ginecológico'], sinonimos: [] },
  { nombre: 'Carcinoma mucinoso de ovario', grupos: ['Ginecológico'], sinonimos: [] },

  // ── Piel / melanoma ──
  { nombre: 'Melanoma de extensión superficial', grupos: ['Piel y melanoma'], sinonimos: ['melanoma superficial'] },
  { nombre: 'Melanoma nodular', grupos: ['Piel y melanoma'], sinonimos: [] },
  { nombre: 'Melanoma lentiginoso acral', grupos: ['Piel y melanoma'], sinonimos: ['acral'] },
  { nombre: 'Léntigo maligno melanoma', grupos: ['Piel y melanoma'], sinonimos: [] },
  { nombre: 'Carcinoma basocelular', grupos: ['Piel y melanoma'], sinonimos: ['basal cell', 'CBC'] },
  { nombre: 'Carcinoma escamocelular cutáneo', grupos: ['Piel y melanoma'], sinonimos: ['escamoso de piel'] },
  { nombre: 'Carcinoma de células de Merkel', grupos: ['Piel y melanoma'], sinonimos: ['Merkel'] },

  // ── Tiroides / endocrino ──
  { nombre: 'Carcinoma papilar de tiroides', grupos: ['Endocrino y neuroendocrino'], sinonimos: ['papilar tiroideo', 'PTC'] },
  { nombre: 'Carcinoma folicular de tiroides', grupos: ['Endocrino y neuroendocrino'], sinonimos: ['folicular tiroideo'] },
  { nombre: 'Carcinoma medular de tiroides', grupos: ['Endocrino y neuroendocrino'], sinonimos: ['medular', 'calcitonina'] },
  { nombre: 'Carcinoma anaplásico de tiroides', grupos: ['Endocrino y neuroendocrino'], sinonimos: ['anaplasico'] },
  { nombre: 'Feocromocitoma / paraganglioma', grupos: ['Endocrino y neuroendocrino'], sinonimos: ['feocromocitoma', 'paraganglioma'] },

  // ── SNC ──
  { nombre: 'Glioblastoma (IDH-wildtype)', grupos: ['Ojo, sistema nervioso central'], sinonimos: ['GBM', 'glioblastoma'] },
  { nombre: 'Astrocitoma (IDH-mutante)', grupos: ['Ojo, sistema nervioso central'], sinonimos: ['astrocitoma'] },
  { nombre: 'Oligodendroglioma (IDH-mutante, 1p/19q codeletado)', grupos: ['Ojo, sistema nervioso central'], sinonimos: ['oligodendroglioma'] },
  { nombre: 'Meningioma', grupos: ['Ojo, sistema nervioso central'], sinonimos: [] },
  { nombre: 'Meduloblastoma', grupos: ['Ojo, sistema nervioso central'], sinonimos: [] },

  // ── Hueso y partes blandas ──
  { nombre: 'Osteosarcoma', grupos: ['Hueso y cartílago articular'], sinonimos: ['sarcoma osteogenico'] },
  { nombre: 'Condrosarcoma', grupos: ['Hueso y cartílago articular'], sinonimos: [] },
  { nombre: 'Sarcoma de Ewing', grupos: ['Hueso y cartílago articular', 'Mesotelial y tejidos blandos'], sinonimos: ['Ewing'] },
  { nombre: 'Liposarcoma', grupos: ['Mesotelial y tejidos blandos'], sinonimos: [] },
  { nombre: 'Leiomiosarcoma', grupos: ['Mesotelial y tejidos blandos', 'Ginecológico'], sinonimos: [] },
  { nombre: 'Sarcoma sinovial', grupos: ['Mesotelial y tejidos blandos'], sinonimos: [] },
  { nombre: 'Sarcoma pleomórfico indiferenciado', grupos: ['Mesotelial y tejidos blandos'], sinonimos: ['UPS', 'histiocitoma fibroso maligno', 'MFH'] },
  { nombre: 'Rabdomiosarcoma', grupos: ['Mesotelial y tejidos blandos'], sinonimos: [] },

  // ── Cabeza y cuello ──
  { nombre: 'Carcinoma escamocelular de cabeza y cuello', grupos: ['Labio, cavidad oral y faringe'], sinonimos: ['escamoso de cabeza y cuello', 'HNSCC'] },
  { nombre: 'Carcinoma nasofaríngeo no queratinizante', grupos: ['Labio, cavidad oral y faringe'], sinonimos: ['nasofaringeo', 'VEB'] },
  { nombre: 'Carcinoma mucoepidermoide de glándula salival', grupos: ['Labio, cavidad oral y faringe'], sinonimos: ['salival mucoepidermoide'] },
  { nombre: 'Carcinoma adenoide quístico', grupos: ['Labio, cavidad oral y faringe'], sinonimos: ['cilindroma'] },

  // ── Linfoma (hematológico) ──
  { nombre: 'Linfoma difuso de células B grandes (LBDCG)', grupos: ['Linfoma no Hodgkin difuso'], sinonimos: ['DLBCL', 'linfoma B grande'] },
  { nombre: 'Linfoma folicular', grupos: ['Linfoma no Hodgkin folicular (nodular)'], sinonimos: ['LF'] },
  { nombre: 'Linfoma de células del manto', grupos: ['Linfoma no Hodgkin difuso'], sinonimos: ['LCM', 'mantle cell'] },
  { nombre: 'Linfoma de Burkitt', grupos: ['Linfoma no Hodgkin difuso'], sinonimos: ['Burkitt'] },
  { nombre: 'Linfoma de zona marginal / MALT', grupos: ['Enfermedades inmunoproliferativas malignas y células plasmáticas'], sinonimos: ['MALT', 'zona marginal'] },
  { nombre: 'Linfoma linfocítico de células pequeñas (LLC/SLL)', grupos: ['Leucemia linfoide', 'Linfoma no Hodgkin difuso'], sinonimos: ['SLL', 'LLC'] },
  { nombre: 'Linfoma T periférico, NOS', grupos: ['Linfoma de células T periféricas y cutáneas'], sinonimos: ['PTCL'] },
  { nombre: 'Linfoma de Hodgkin clásico', grupos: ['Enfermedad de Hodgkin'], sinonimos: ['Hodgkin clasico', 'Reed-Sternberg'] },

  // ── Leucemia / mieloide ──
  { nombre: 'Leucemia mieloide aguda (LMA)', grupos: ['Leucemia mieloide y monocítica'], sinonimos: ['AML', 'LMA'] },
  { nombre: 'Leucemia linfoblástica aguda (LLA)', grupos: ['Leucemia linfoide'], sinonimos: ['ALL', 'LLA'] },
  { nombre: 'Leucemia mieloide crónica (LMC)', grupos: ['Leucemia mieloide y monocítica'], sinonimos: ['CML', 'BCR-ABL'] },
  { nombre: 'Mieloma de células plasmáticas', grupos: ['Enfermedades inmunoproliferativas malignas y células plasmáticas'], sinonimos: ['mieloma multiple', 'MM'] },

  { nombre: 'Otra (especificar en la descripción)', grupos: ['General'], sinonimos: ['otra histologia', 'no listada'] },
]

// ---------- utilidades ----------

const _norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const _tokens = (s) => _norm(s).split(/[^a-z0-9]+/).filter(Boolean)
const _coincide = (campo, qt) => {
  const ct = _tokens(campo)
  return qt.every((q) => ct.some((c) => c.startsWith(q)))
}

/**
 * Busca histologías por texto (nombre o sinónimos). Si se pasa `grupo`
 * (subgrupo del CIE-10 del diagnóstico), prioriza las de ese grupo y las
 * generales; sin `grupo` busca en todo el catálogo.
 */
export function buscarHistologia(termino, { grupo, limite = 30 } = {}) {
  const t = _norm(termino).trim()
  const qt = _tokens(t)
  const enGrupo = (i) => !grupo || i.grupos.includes(grupo) || i.grupos.includes('General')

  const candidatos = t
    ? HISTOLOGIAS.filter((i) => _coincide(i.nombre, qt) || (i.sinonimos || []).some((s) => _coincide(s, qt)))
    : HISTOLOGIAS.filter(enGrupo)

  const rank = (i) => {
    if (grupo && i.grupos.includes(grupo)) return 0
    if (i.grupos.includes('General')) return 1
    return 2
  }
  return candidatos
    .map((i) => ({ i, r: rank(i) }))
    .sort((a, b) => a.r - b.r || a.i.nombre.localeCompare(b.i.nombre))
    .slice(0, limite)
    .map((x) => x.i)
}

export default HISTOLOGIAS
