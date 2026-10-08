import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TOOL_HINTS, TOOL_TOUR_IDS, TOOLS } from './Toolbox'

interface TourStep {
  target: string
  title: string
  description: string
}

const PANEL_STEPS: TourStep[] = [
  { target: 'panel:properties', title: 'מאפיינים', description: 'כאן משנים את המיקום, המידות, המראה והאפשרויות של האובייקט או הטקסט שנבחרו.' },
  { target: 'panel:paragraph', title: 'פסקה', description: 'כאן מעצבים את הפסקה: יישור, כניסות, רווחים, רשימות ואופן חלוקת הטקסט.' },
  { target: 'panel:paragraph-styles', title: 'סגנונות פסקה', description: 'יוצרים ומחילים סגנונות פסקה כדי לשמור עיצוב עקבי ולעדכן אותו במקום אחד.' },
  { target: 'panel:character-styles', title: 'סגנונות תו', description: 'יוצרים ומחילים עיצוב תווים, כגון גופן, צבע, גודל וקו מתאר.' },
  { target: 'panel:style-manager', title: 'ניהול סגנונות', description: 'מחפשים, מחליפים ומנהלים סגנונות פסקה במסמך.' },
  { target: 'panel:pages', title: 'עמודים', description: 'מנהלים עמודים ועמודי אב, משנים את סדר העמודים ומגדירים אילו עמודי אב יחולו.' },
  { target: 'panel:links', title: 'קישורים', description: 'בודקים תמונות מקושרות, מאתרים קבצים חסרים ומעדכנים או מטמיעים קישורים.' },
  { target: 'panel:color', title: 'צבע', description: 'בוחרים צבע מילוי וקו לאובייקטים ולכיתוב, או דוגמים צבע מהמסמך.' },
  { target: 'panel:gradient', title: 'מעבר צבע', description: 'יוצרים ומכווננים מעבר צבע למילוי או לקו של אובייקטים.' },
  { target: 'panel:swatches', title: 'דוגמיות', description: 'שומרים צבעים לשימוש חוזר ומחילים אותם על אובייקטים וטקסט.' },
  { target: 'panel:layers', title: 'שכבות', description: 'מסדרים אובייקטים בשכבות, משנים את סדרם ומסתירים או נועלים אותם.' },
]

const toolById = new Map(TOOLS.map((tool) => [tool.id, tool]))
const TOUR_STEPS: TourStep[] = [
  ...TOOL_TOUR_IDS.flatMap((id) => {
    const tool = toolById.get(id)
    return tool ? [{ target: `tool:${id}`, title: tool.label, description: TOOL_HINTS[id] ?? `הכלי ${tool.label} מאפשר ליצור ולערוך במסמך.` }] : []
  }),
  { target: 'view:normal', title: 'מצב רגיל', description: 'מציג את המסמך יחד עם מסגרות, קווי עזר וכלי העבודה.' },
  { target: 'view:preview', title: 'תצוגה מקדימה', description: 'מציגה את העמוד כפי שייראה ללא מסגרות עזר וכלי עריכה.' },
  ...PANEL_STEPS,
]

interface Props {
  enabled: boolean
  onComplete: () => void
}

export function GuidedToolTour({ enabled, onComplete }: Props) {
  const [stepIndex, setStepIndex] = useState(0)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const highlightedRef = useRef<HTMLElement | null>(null)
  const step = TOUR_STEPS[stepIndex]

  useEffect(() => {
    if (!enabled) {
      window.dispatchEvent(new CustomEvent('imudist:tool-tour-target', { detail: null }))
      return
    }
    if (!step) {
      window.dispatchEvent(new CustomEvent('imudist:tool-tour-target', { detail: null }))
      onComplete()
      return
    }

    window.dispatchEvent(new CustomEvent('imudist:tool-tour-target', { detail: step.target }))
    let cancelled = false
    let timer: number | undefined
    let animation = 0
    let target: HTMLElement | null = null

    const updatePosition = () => {
      if (!target || !cardRef.current) return
      const anchor = target.getBoundingClientRect()
      const card = cardRef.current.getBoundingClientRect()
      const gap = 14
      const left = anchor.left + anchor.width / 2 < window.innerWidth / 2
        ? anchor.right + gap
        : anchor.left - card.width - gap
      setPosition({
        left: Math.max(12, Math.min(window.innerWidth - card.width - 12, left)),
        top: Math.max(12, Math.min(window.innerHeight - card.height - 12, anchor.top + anchor.height / 2 - card.height / 2)),
      })
    }

    const findTarget = () => {
      if (cancelled) return
      target = Array.from(document.querySelectorAll<HTMLElement>('[data-tour-id]'))
        .find((element) => element.dataset.tourId === step.target) ?? null
      if (!target) {
        timer = window.setTimeout(findTarget, 50)
        return
      }
      target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      highlightedRef.current?.classList.remove('guided-tour-target')
      target.classList.add('guided-tour-target')
      highlightedRef.current = target
      animation = window.requestAnimationFrame(updatePosition)
      window.addEventListener('resize', updatePosition)
      document.addEventListener('scroll', updatePosition, true)
    }

    findTarget()
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
      window.cancelAnimationFrame(animation)
      window.removeEventListener('resize', updatePosition)
      document.removeEventListener('scroll', updatePosition, true)
      target?.classList.remove('guided-tour-target')
      if (highlightedRef.current === target) highlightedRef.current = null
    }
  }, [enabled, onComplete, step, stepIndex])

  if (!enabled || !step) return null

  const finish = () => {
    highlightedRef.current?.classList.remove('guided-tour-target')
    highlightedRef.current = null
    window.dispatchEvent(new CustomEvent('imudist:tool-tour-target', { detail: null }))
    onComplete()
  }

  const advance = () => {
    if (stepIndex + 1 < TOUR_STEPS.length) {
      setPosition(null)
      setStepIndex((index) => index + 1)
      return
    }
    finish()
  }

  return createPortal(
    <div className="guided-tour-card" role="dialog" aria-label={`סיור בכלים: ${step.title}`} aria-live="polite" ref={cardRef} style={position ? { left: position.left, top: position.top } : undefined}>
      <div className="guided-tour-heading">
        <strong>{step.title}</strong>
      </div>
      <p>{step.description}</p>
      <div className="guided-tour-footer">
        <span className="guided-tour-count">כלי {stepIndex + 1} מתוך {TOUR_STEPS.length}</span>
        <div className="guided-tour-actions">
          <button type="button" className="btn primary" onClick={advance}>
            {stepIndex + 1 === TOUR_STEPS.length ? 'סיום' : 'המשך'}
          </button>
          <button type="button" className="btn" onClick={finish}>סגור</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export const TOOL_TOUR_COMPLETE_KEY = 'imudist.tool-tour.v1.complete'
