import { useEffect, useState } from 'react'
import type { ExtrudeSettings } from '../document'
import { autoSideColor, DEFAULT_VIEW, frameWalls, ISO_DEPTH_ANGLE, MAX_PITCH, MAX_YAW, type IsoPlane } from '../extrude'
import { NumberField } from './NumberField'
import { t } from '../i18n'

interface Props {
  /** the settings the dialog starts with (the ones the shape has, or the usual ones) */
  initial: ExtrudeSettings
  /** the colour of the front, from which the sides are made darker when no colour is chosen */
  frontColor: string | null
  /** the shape has depth already: it can be taken away */
  hasDepth: boolean
  /** the corner radius of a rectangle (points), or null for a shape that is not a rectangle */
  corner: number | null
  /** `view`: what the shape is changed to first ('side' is the flat outline, with the depth leaning to a side); null when it stays as it is */
  onApply: (settings: ExtrudeSettings, view: 'side' | IsoPlane | 'turn' | null, corner: number | null) => void
  onRemove: () => void
  onClose: () => void
}

/** The depth of a shape: how far back it goes, in which direction, and the colour of its sides. */
export function ExtrudeDialog({ initial, frontColor, hasDepth, corner: initialCorner, onApply, onRemove, onClose }: Props) {
  const [depth, setDepth] = useState(initial.depth)
  const [angle, setAngle] = useState(Math.round(initial.angle))
  const wasIso = !!initial.iso
  const [mode, setMode] = useState<'side' | IsoPlane | 'turn'>(initial.view ? 'turn' : initial.iso ?? 'side')
  const [yaw, setYaw] = useState(Math.round(initial.view?.yaw ?? DEFAULT_VIEW.yaw))
  const [pitch, setPitch] = useState(Math.round(initial.view?.pitch ?? DEFAULT_VIEW.pitch))
  const startMode = initial.view ? 'turn' : initial.iso ?? 'side'
  const [auto, setAuto] = useState(!initial.sideColor)
  const [color, setColor] = useState(initial.sideColor ?? autoSideColor(frontColor))
  const [shade, setShade] = useState(Math.round(initial.shade * 100))
  const [lean, setLean] = useState(Math.round(initial.lean ?? 0))
  const [wall, setWall] = useState(initial.frame?.wall ?? 0)
  const [sides, setSides] = useState(() => (initial.frame ? frameWalls(initial.frame) : { top: 0, right: 0, bottom: 0, left: 0 }))
  const [outer, setOuter] = useState(initial.frame?.outer ?? 0)
  const [inner, setInner] = useState(initial.frame?.inner ?? 0)
  const [corner, setCorner] = useState(initialCorner ?? 0)
  const hasFrame = !!initial.frame && initial.iso !== 'top'

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const apply = () => onApply({ depth, angle: mode === 'side' ? ((angle % 360) + 360) % 360 : mode === 'turn' ? initial.angle : ISO_DEPTH_ANGLE[mode], shade: shade / 100, ...(auto ? {} : { sideColor: color }), ...(hasFrame ? { frame: { wall, outer, inner, ...(Object.fromEntries((['top', 'right', 'bottom', 'left'] as const).filter((side) => Math.abs(sides[side] - wall) > 0.01).map((side) => [side, sides[side]]))) } } : {}), ...(mode === 'side' && lean !== 0 ? { lean } : {}), ...(mode === 'turn' ? { view: { yaw, pitch } } : {}) }, mode !== startMode ? mode : null, initialCorner === null || hasFrame ? null : corner)

  return (
    <div className="modal-backdrop">
      <form
        className="modal extrude-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('עומק תלת־ממדי')}
       
        onSubmit={(event) => {
          event.preventDefault()
          apply()
        }}
        // a number field takes Enter for itself (it commits and leaves the field): confirm once its value has landed
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || !(event.target instanceof HTMLElement) || !event.target.closest('.num-field')) return
          event.preventDefault()
          const form = event.currentTarget
          window.setTimeout(() => form.requestSubmit(), 0)
        }}
      >
        <h2>{t('עומק תלת־ממדי')}</h2>
        <p className="muted">{t('הצורה נמשכת אחורה בכיוון שבוחרים, והצדדים הנראים הופכים לצורות עצמאיות שאפשר לצבוע, להזיז ולערוך כל אחת לחוד.')}</p>
        <label className="footnote-dialog-field"><span>{t('עומק (pt)')}</span><NumberField ariaLabel={t('עומק')} value={depth} unit="px" unitLabel="pt" step={2} min={0} max={2000} onChange={setDepth} /></label>
        <label className="footnote-dialog-field">
          <span>{t('סוג התצוגה')}</span>
          <select aria-label={t('סוג התצוגה')} value={mode} onChange={(event) => setMode(event.target.value as 'side' | IsoPlane | 'turn')}>
            <option value="side">{t('הטיה לצד (כמו בלוגו)')}</option>
            <option value="turn">{t('גוף שמסתובב (סיבוב וזווית מבט)')}</option>
            <option value="left">{t('איזומטרי זקוף, פונה שמאלה (העומק לאחור וימינה)')}</option>
            <option value="right">{t('איזומטרי זקוף, פונה ימינה (העומק לאחור ושמאלה)')}</option>
            <option value="top">{t('איזומטרי שוכב (הצורה כראש הגוף, העומק למטה)')}</option>
          </select>
          {mode !== startMode && <small>{mode === 'turn' ? t('הצורה תוחזר לצורתה השטוחה ותוצג כגוף שמסתובב: ברוחב שמצטמצם, בעומק שנמשך לפי הסיבוב ובזווית המבט.') : wasIso ? t('הצורה תוחזר לצורתה השטוחה ותונח על המשטח שנבחר.') : mode === 'side' ? '' : t('הצורה מונחת על משטח איזומטרי: הקו שלה משתנה (נוטה או מסתובב) והופך לנתיב.')} אפשר לבטל.</small>}
        </label>
        {mode === 'turn' && (
          <>
            <label className="footnote-dialog-field"><span>{t('סיבוב הגוף סביב הציר האנכי (מעלות, חיובי: הצד הימני נסוג)')}</span><NumberField ariaLabel={t('סיבוב הגוף')} value={yaw} step={5} min={-MAX_YAW} max={MAX_YAW} onChange={setYaw} /></label>
            <label className="footnote-dialog-field"><span>{t('זווית המבט מלמעלה (מעלות, 0 ישר מהצד)')}</span><NumberField ariaLabel={t('זווית המבט')} value={pitch} step={5} min={0} max={MAX_PITCH} onChange={setPitch} /></label>
          </>
        )}
        {mode === 'side' && (
          <>
            <label className="footnote-dialog-field"><span>{t('כיוון העומק (מעלות: 0 ימינה, 90 למעלה, 180 שמאלה, 270 למטה)')}</span><NumberField ariaLabel={t('כיוון העומק')} value={angle} step={5} min={0} max={359} onChange={setAngle} /></label>
            <label className="footnote-dialog-field"><span>{t('הטיית החזית (מעלות, 0 = חזית ישרה עם תחתית שטוחה)')}</span><NumberField ariaLabel={t('הטיית החזית')} value={lean} step={5} min={-60} max={60} onChange={setLean} /></label>
          </>
        )}
        <label className="footnote-dialog-field"><span>{t('הצללת הצדדים לפי כיוון האור (%)')}</span><NumberField ariaLabel={t('הצללת הצדדים')} value={shade} step={5} min={0} max={100} onChange={setShade} /></label>
        {hasFrame && (
          <>
            <label className="footnote-dialog-field"><span>{t('עובי הדופן של המסגרת, בכל הצדדים (pt)')}</span><NumberField ariaLabel={t('עובי הדופן')} value={wall} unit="px" unitLabel="pt" step={1} min={1} max={500} onChange={(value) => { setWall(value); setSides({ top: value, right: value, bottom: value, left: value }) }} /></label>
            <div className="grid2">
              <label className="footnote-dialog-field"><span>{t('עובי עליון (pt)')}</span><NumberField ariaLabel={t('עובי הדופן העליונה')} value={sides.top} unit="px" unitLabel="pt" step={1} min={1} max={500} onChange={(value) => setSides((current) => ({ ...current, top: value }))} /></label>
              <label className="footnote-dialog-field"><span>{t('עובי תחתון (pt)')}</span><NumberField ariaLabel={t('עובי הדופן התחתונה')} value={sides.bottom} unit="px" unitLabel="pt" step={1} min={1} max={500} onChange={(value) => setSides((current) => ({ ...current, bottom: value }))} /></label>
              <label className="footnote-dialog-field"><span>{t('עובי ימני (pt)')}</span><NumberField ariaLabel={t('עובי הדופן הימנית')} value={sides.right} unit="px" unitLabel="pt" step={1} min={1} max={500} onChange={(value) => setSides((current) => ({ ...current, right: value }))} /></label>
              <label className="footnote-dialog-field"><span>{t('עובי שמאלי (pt)')}</span><NumberField ariaLabel={t('עובי הדופן השמאלית')} value={sides.left} unit="px" unitLabel="pt" step={1} min={1} max={500} onChange={(value) => setSides((current) => ({ ...current, left: value }))} /></label>
            </div>
            <label className="footnote-dialog-field"><span>{t('עיגול הפינות החיצוניות (pt)')}</span><NumberField ariaLabel={t('עיגול הפינות החיצוניות')} value={outer} unit="px" unitLabel="pt" step={1} min={0} max={500} onChange={setOuter} /></label>
            <label className="footnote-dialog-field"><span>{t('עיגול פינות החור (pt)')}</span><NumberField ariaLabel={t('עיגול פינות החור')} value={inner} unit="px" unitLabel="pt" step={1} min={0} max={500} onChange={setInner} /></label>
          </>
        )}
        {!hasFrame && initialCorner !== null && (
          <label className="footnote-dialog-field"><span>{t('עיגול הפינות (pt)')}</span><NumberField ariaLabel={t('עיגול הפינות')} value={corner} unit="px" unitLabel="pt" step={1} min={0} max={500} onChange={setCorner} /></label>
        )}
        <label className="footnote-dialog-checkbox"><input type="checkbox" checked={auto} onChange={(event) => setAuto(event.target.checked)} /><span>{t('צבע הצדדים אוטומטי (כהה מצבע החזית)')}</span></label>
        {!auto && (
          <label className="footnote-dialog-field"><span>{t('צבע הצדדים')}</span><input type="color" aria-label={t('צבע הצדדים')} value={color} onChange={(event) => setColor(event.target.value)} /></label>
        )}
        <div className="modal-buttons">
          <button type="submit" className="btn primary">{hasDepth ? t('עדכן') : t('הוסף עומק')}</button>
          {hasDepth && <button type="button" className="btn danger" onClick={onRemove}>{t('הסר עומק')}</button>}
          <button type="button" className="btn" onClick={onClose}>{t('ביטול')}</button>
        </div>
      </form>
    </div>
  )
}
