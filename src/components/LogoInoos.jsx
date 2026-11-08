import svgRaw from '../assets/logo-inoos.svg?raw'

// Logo de INOOS (cliente). Toma el color de --marca para verse bien en tema claro y oscuro.
// isotipo = solo la figura, sin el texto (recorta el viewBox).
const pathD = svgRaw.match(/ d="([^"]+)"/)[1]

export default function LogoInoos({ className = '', isotipo = false, color = 'var(--marca)', titulo = 'INOOS – Instituto Oncológico Ospedale', ...rest }) {
  const decorativo = rest['aria-hidden'] === 'true' || rest['aria-hidden'] === true
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={isotipo ? '-6 -2 290 280' : '0 0 809.182 276.197'}
      role={decorativo ? undefined : 'img'} aria-label={decorativo ? undefined : titulo}
      {...rest} className={className} style={{ color, ...rest.style }}>
      {!decorativo && <title>{titulo}</title>}
      <path fill="currentColor" fillRule="evenodd" d={pathD} />
    </svg>
  )
}
