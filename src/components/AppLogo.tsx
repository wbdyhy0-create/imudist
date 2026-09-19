/**
 * Imudist mark: two thin page-corner brackets (the layout grid / margins) around "Im".
 * Drawn as strokes, so it doesn't depend on any installed font. Meant for the dark UI (white letters).
 */
export function AppLogo({ size = 24 }: { size?: number }) {
  return (
    <svg className="app-logo" width={(size * 36) / 32} height={size} viewBox="0 0 36 32" aria-hidden="true">
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 4H3v24h5M28 4h5v24h-5" stroke="#0066ff" strokeWidth="2.400" />
        <path d="M11.500 10v12M16 22v-8.500M16 16.300a2.250 2.250 0 0 1 4.500 0V22M20.500 16.300a2.250 2.250 0 0 1 4.500 0V22" stroke="#fff" strokeWidth="2.400" />
      </g>
    </svg>
  )
}
