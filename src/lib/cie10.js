// Catálogo de arranque CIE-10 oncológico (subconjunto C00–D48, común en Colombia).
// Curado a mano para búsqueda por texto; NO exhaustivo. Reemplazable/ampliable
// por el catálogo oficial (idealmente migrando a una tabla `cie10` con búsqueda
// server-side) sin tocar la UI: solo cambia esta lista.
export const CIE10 = [
  // Cabeza y cuello
  { codigo: 'C01', descripcion: 'Neoplasia maligna de la base de la lengua' },
  { codigo: 'C02', descripcion: 'Neoplasia maligna de otras partes de la lengua' },
  { codigo: 'C04', descripcion: 'Neoplasia maligna del piso de la boca' },
  { codigo: 'C06', descripcion: 'Neoplasia maligna de otras partes de la boca' },
  { codigo: 'C09', descripcion: 'Neoplasia maligna de la amígdala' },
  { codigo: 'C10', descripcion: 'Neoplasia maligna de la orofaringe' },
  { codigo: 'C11', descripcion: 'Neoplasia maligna de la nasofaringe' },
  { codigo: 'C13', descripcion: 'Neoplasia maligna de la hipofaringe' },
  { codigo: 'C32', descripcion: 'Neoplasia maligna de la laringe' },
  // Digestivo
  { codigo: 'C15', descripcion: 'Neoplasia maligna del esófago' },
  { codigo: 'C16', descripcion: 'Neoplasia maligna del estómago' },
  { codigo: 'C17', descripcion: 'Neoplasia maligna del intestino delgado' },
  { codigo: 'C18', descripcion: 'Neoplasia maligna del colon' },
  { codigo: 'C19', descripcion: 'Neoplasia maligna de la unión rectosigmoidea' },
  { codigo: 'C20', descripcion: 'Neoplasia maligna del recto' },
  { codigo: 'C21', descripcion: 'Neoplasia maligna del ano y conducto anal' },
  { codigo: 'C22', descripcion: 'Neoplasia maligna del hígado y vías biliares intrahepáticas' },
  { codigo: 'C23', descripcion: 'Neoplasia maligna de la vesícula biliar' },
  { codigo: 'C24', descripcion: 'Neoplasia maligna de las vías biliares' },
  { codigo: 'C25', descripcion: 'Neoplasia maligna del páncreas' },
  // Respiratorio / tórax
  { codigo: 'C34', descripcion: 'Neoplasia maligna de los bronquios y del pulmón' },
  { codigo: 'C37', descripcion: 'Neoplasia maligna del timo' },
  { codigo: 'C38', descripcion: 'Neoplasia maligna del mediastino / pleura' },
  { codigo: 'C45', descripcion: 'Mesotelioma' },
  // Hueso y partes blandas
  { codigo: 'C40', descripcion: 'Neoplasia maligna del hueso y cartílago de extremidades' },
  { codigo: 'C41', descripcion: 'Neoplasia maligna del hueso y cartílago, otros sitios' },
  { codigo: 'C49', descripcion: 'Neoplasia maligna del tejido conjuntivo y blando (sarcoma)' },
  // Piel
  { codigo: 'C43', descripcion: 'Melanoma maligno de la piel' },
  { codigo: 'C44', descripcion: 'Otras neoplasias malignas de la piel' },
  { codigo: 'C46', descripcion: 'Sarcoma de Kaposi' },
  // Mama y ginecológico
  { codigo: 'C50', descripcion: 'Neoplasia maligna de la mama' },
  { codigo: 'C51', descripcion: 'Neoplasia maligna de la vulva' },
  { codigo: 'C52', descripcion: 'Neoplasia maligna de la vagina' },
  { codigo: 'C53', descripcion: 'Neoplasia maligna del cuello del útero (cérvix)' },
  { codigo: 'C54', descripcion: 'Neoplasia maligna del cuerpo del útero (endometrio)' },
  { codigo: 'C56', descripcion: 'Neoplasia maligna del ovario' },
  // Urológico masculino
  { codigo: 'C60', descripcion: 'Neoplasia maligna del pene' },
  { codigo: 'C61', descripcion: 'Neoplasia maligna de la próstata' },
  { codigo: 'C62', descripcion: 'Neoplasia maligna del testículo' },
  // Urológico / renal
  { codigo: 'C64', descripcion: 'Neoplasia maligna del riñón, excepto pelvis renal' },
  { codigo: 'C65', descripcion: 'Neoplasia maligna de la pelvis renal' },
  { codigo: 'C66', descripcion: 'Neoplasia maligna del uréter' },
  { codigo: 'C67', descripcion: 'Neoplasia maligna de la vejiga urinaria' },
  // SNC / endocrino
  { codigo: 'C71', descripcion: 'Neoplasia maligna del encéfalo' },
  { codigo: 'C72', descripcion: 'Neoplasia maligna de la médula espinal / SNC' },
  { codigo: 'C73', descripcion: 'Neoplasia maligna de la glándula tiroides' },
  { codigo: 'C74', descripcion: 'Neoplasia maligna de la glándula suprarrenal' },
  // Sitios secundarios / primario desconocido
  { codigo: 'C76', descripcion: 'Neoplasia maligna de sitios mal definidos' },
  { codigo: 'C77', descripcion: 'Neoplasia maligna de ganglios linfáticos (secundaria)' },
  { codigo: 'C78', descripcion: 'Neoplasia maligna secundaria respiratoria/digestiva (metástasis)' },
  { codigo: 'C79', descripcion: 'Neoplasia maligna secundaria de otros sitios (metástasis)' },
  { codigo: 'C80', descripcion: 'Neoplasia maligna de sitio primario desconocido' },
  // Hematológico
  { codigo: 'C81', descripcion: 'Linfoma de Hodgkin' },
  { codigo: 'C82', descripcion: 'Linfoma no Hodgkin folicular' },
  { codigo: 'C83', descripcion: 'Linfoma no Hodgkin difuso' },
  { codigo: 'C84', descripcion: 'Linfoma de células T periférico y cutáneo' },
  { codigo: 'C85', descripcion: 'Linfoma no Hodgkin, otros tipos y no especificado' },
  { codigo: 'C88', descripcion: 'Enfermedades inmunoproliferativas malignas' },
  { codigo: 'C90', descripcion: 'Mieloma múltiple y neoplasias de células plasmáticas' },
  { codigo: 'C91', descripcion: 'Leucemia linfoide' },
  { codigo: 'C91.0', descripcion: 'Leucemia linfoblástica aguda' },
  { codigo: 'C91.1', descripcion: 'Leucemia linfocítica crónica' },
  { codigo: 'C92', descripcion: 'Leucemia mieloide' },
  { codigo: 'C92.0', descripcion: 'Leucemia mieloide aguda' },
  { codigo: 'C92.1', descripcion: 'Leucemia mieloide crónica' },
  { codigo: 'C95', descripcion: 'Leucemia de tipo celular no especificado' },
  // In situ frecuentes
  { codigo: 'D05', descripcion: 'Carcinoma in situ de la mama' },
  { codigo: 'D06', descripcion: 'Carcinoma in situ del cuello del útero' },
  // Comportamiento incierto
  { codigo: 'D37', descripcion: 'Tumor de comportamiento incierto: cavidad oral y digestivo' },
  { codigo: 'D43', descripcion: 'Tumor de comportamiento incierto: SNC' },
  { codigo: 'D47', descripcion: 'Tumor de comportamiento incierto: tejido linfático/hematopoyético' },
]
