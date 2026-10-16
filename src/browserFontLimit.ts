import { useEffect, useState } from 'react'

/**
 * A browser can be set to a minimum font size (Chrome and Edge: Settings > Appearance > Customize fonts): text set smaller than that is
 * drawn at the minimum, whatever size the page asks for. In a layout program that looks like a size field that stops working at some
 * size - decreasing the size of a text, or of the footnote reference numbers, changes nothing once it is under the limit.
 */

/** The size a text set at `probeSize` is really drawn at, from how wide it came out next to the same text at `referenceSize` (drawn at the size asked for). */
export function effectiveFontSize(probeSize: number, probeWidth: number, referenceSize: number, referenceWidth: number): number | null {
  if (!(probeWidth > 0) || !(referenceWidth > 0) || !(probeSize > 0) || !(referenceSize > 0)) return null
  return (probeWidth / referenceWidth) * referenceSize
}

/** A text asked for at `probeSize` that comes out at more than this much bigger means the browser holds a minimum. */
const TOLERANCE = 1.5

/**
 * The minimum font size (px) the browser holds, or null when it holds none (the usual case). Measured, as there is no way to ask:
 * a text set at 4px is as wide as it should be when nothing holds it, and as wide as the minimum asks when something does.
 */
export function detectMinimumFontSize(): number | null {
  if (typeof document === 'undefined' || !document.body) return null
  const probe = document.createElement('span')
  probe.textContent = 'mmmmmmmmmmmmmmmmmmmm'
  probe.setAttribute('aria-hidden', 'true')
  probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:nowrap;font-family:Arial,sans-serif;font-style:normal;font-weight:400;letter-spacing:0;'
  document.body.appendChild(probe)
  try {
    const widthAt = (size: number) => {
      probe.style.fontSize = `${size}px`
      return probe.getBoundingClientRect().width
    }
    const small = 4
    const reference = 48
    const drawn = effectiveFontSize(small, widthAt(small), reference, widthAt(reference))
    return drawn !== null && drawn > small * TOLERANCE ? Math.round(drawn) : null
  } finally {
    probe.remove()
  }
}

let known: number | null | undefined

/**
 * The minimum font size the browser holds (null for none), measured once the fonts are in; undefined until then.
 * Cached: it only changes when the person changes the browser's settings, which takes a restart of the page.
 */
export function useMinimumFontSize(): number | null {
  const [size, setSize] = useState<number | null>(known ?? null)
  useEffect(() => {
    if (known !== undefined) return
    let alive = true
    const measure = () => {
      known = detectMinimumFontSize()
      if (alive) setSize(known)
    }
    const ready = typeof document !== 'undefined' ? document.fonts?.ready : undefined
    if (ready) ready.then(measure, measure)
    else measure()
    return () => {
      alive = false
    }
  }, [])
  return size
}
