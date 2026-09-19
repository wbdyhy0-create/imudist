/** Imudist mark: a page with a folded corner, an "I" and ruler ticks — flat teal, no letters-in-a-square. */
export function AppLogo({ size = 24 }: { size?: number }) {
  return (
    <svg className="app-logo" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path
        d="M7 3.500A1.500 1.500 0 0 1 8.500 2H20l7 7v20.500a1.500 1.500 0 0 1-1.500 1.500h-17A1.500 1.500 0 0 1 7 29.500z"
        fill="#0e8fa6"
      />
      <path d="M20 2v5.500A1.500 1.500 0 0 0 21.500 9H27z" fill="#fff" fillOpacity="0.4" />
      <path
        d="M13.500 11.500h7M17 11.500v11M13.500 22.500h7"
        fill="none"
        stroke="#fff"
        strokeWidth="2.400"
        strokeLinecap="round"
      />
      <path d="M10 13.500h1.800M10 16h1.100M10 18.500h1.800M10 21h1.100" stroke="#fff" strokeOpacity="0.7" strokeWidth="1" strokeLinecap="round" />
    </svg>
  )
}
