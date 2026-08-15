// NODOVIA — símbolo "El Circuito" (geometría canónica del manual v1.0).
// NO redibujar: rombo 88×72 en viewBox 120×120, ciclo cerrado, sin líneas internas.
// Variante 'oscuro' = sobre fondo oscuro; 'claro' = sobre fondo claro (vías #8AA1A7 y #0E4C57).
export default function ElCircuito({ size = 34, variante = 'oscuro' }) {
  const viaConocimiento = variante === 'claro' ? '#8AA1A7' : '#6E8A90'
  const viaIA = '#156573'
  const nodoConocimiento = variante === 'claro' ? '#0E4C57' : '#9DB4B8'
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g fill="none" strokeWidth="6" strokeLinecap="round">
        <path d="M16 60 L60 24" stroke={viaConocimiento} />
        <path d="M60 24 L104 60" stroke={viaConocimiento} />
        <path d="M16 60 L60 96" stroke={viaIA} />
        <path d="M60 96 L104 60" stroke={viaIA} />
      </g>
      <circle cx="16" cy="60" r="9" fill="#B9832F" />
      <circle cx="60" cy="24" r="6" fill="none" stroke={nodoConocimiento} strokeWidth="4.5" />
      <circle cx="60" cy="96" r="6" fill="none" stroke="#156573" strokeWidth="4.5" />
      <circle cx="104" cy="60" r="8" fill="#35C9B6" />
    </svg>
  )
}
