import { DEFAULT_SPACE_AFTER, defaultLeading, MAX_PAGE_PT, type TextAlign, type TextFrame, type TextStyle } from '../document'
import type { Unit } from '../units'
import { ALIGNS, Group, Labeled } from './PropertiesPanel'
import { NumberField } from './NumberField'

type SpacingPatch = Partial<Pick<TextStyle, 'spaceBefore' | 'spaceAfter'>>
type ParagraphPatch = Partial<Pick<TextStyle, 'align' | 'leading' | 'wordSpacingMin' | 'wordSpacingMax' | 'indentLeft' | 'indentRight' | 'firstLineIndent' | 'secondLineIndent'>>
type KeepLinesPatch = Partial<{ first: number; last: number }>

interface Props {
  frame: TextFrame | null
  /** indents/etc. read the story's own style; spaceBefore/spaceAfter read the selected paragraph's own (see scope) */
  style: TextStyle | null
  /** does a spacing change apply to the selected paragraph(s), or to the whole story? (indents are always the story) */
  scope: 'selection' | 'all'
  unit: Unit
  /** indents, first/second-line indent: always the whole story */
  onChange: (patch: ParagraphPatch) => void
  /** spaceBefore/spaceAfter: the selected paragraph(s) if any text is selected, otherwise the whole story */
  onSpacingChange: (patch: SpacingPatch) => void
  keepFirstLines: number
  keepLastLines: number
  keepFirstMixed?: boolean
  keepLastMixed?: boolean
  onKeepLinesChange: (patch: KeepLinesPatch) => void
}

/** Window > פסקה (Ctrl+Alt+L): paragraph layout, spacing, indents and line-break controls. */
export function ParagraphPanel({ frame, style, scope, unit, onChange, onSpacingChange, keepFirstLines, keepLastLines, keepFirstMixed, keepLastMixed, onKeepLinesChange }: Props) {
  return (
    <aside className="props-panel" aria-label="פסקה">
      <h2 className="props-title">פסקה</h2>
      {!frame || !style ? (
        <p className="muted">בחר תיבת טקסט כדי לערוך את מרווחי הפסקה שלה.</p>
      ) : (
        <>
          <Group title="יישור ומרווח שורות">
            <div className="toggle-group paragraph-align" role="group" aria-label="יישור הפסקה">
              {ALIGNS.map((align) => (
                <button key={align.id} type="button" className={style.align === align.id ? 'on' : ''} title={align.label} aria-label={align.label} aria-pressed={style.align === align.id} onClick={() => onChange({ align: align.id as TextAlign })}>
                  <svg viewBox="0 0 24 24"><path d={align.icon} /></svg>
                </button>
              ))}
            </div>
            <Labeled label="מרווח שורות">
              <NumberField value={style.leading ?? defaultLeading(style)} unit="px" unitLabel="pt" min={1} max={MAX_PAGE_PT} onChange={(leading) => onChange({ leading })} />
            </Labeled>
            <p className="muted">ריווח מילים חל רק ביישור מלא.</p>
            <div className="grid2">
              <Labeled label="ריווח מילים מינימלי (%)">
                <NumberField value={style.wordSpacingMin ?? 90} min={10} max={100} onChange={(wordSpacingMin) => onChange({ wordSpacingMin })} />
              </Labeled>
              <Labeled label="ריווח מילים מרבי (%)">
                <NumberField value={style.wordSpacingMax ?? 120} min={100} max={500} onChange={(wordSpacingMax) => onChange({ wordSpacingMax })} />
              </Labeled>
            </div>
          </Group>

          <Group title="מרווחי פסקאות">
            <p className={'scope-hint' + (scope === 'selection' ? ' on' : '')}>
              {scope === 'selection' ? 'השינויים חלים על הפסקה המסומנת' : 'השינויים חלים על כל הפסקאות בתיבה. סמן טקסט בפסקה כדי לשנות רק אותה.'}
            </p>
            <div className="grid2">
              <Labeled label="רווח לפני">
                <NumberField value={style.spaceBefore ?? 0} unit={unit} min={0} max={MAX_PAGE_PT} onChange={(v) => onSpacingChange({ spaceBefore: v })} />
              </Labeled>
              <Labeled label="רווח אחרי">
                <NumberField value={style.spaceAfter ?? DEFAULT_SPACE_AFTER} unit={unit} min={0} max={MAX_PAGE_PT} onChange={(v) => onSpacingChange({ spaceAfter: v })} />
              </Labeled>
            </div>
            <p className="muted">
              רווח לפני דוחק את הפסקה מהפסקה שלפניה; רווח אחרי דוחק את הפסקה שאחריה. ללא בחירת טקסט בפסקה מסוימת, הערכים חלים על כל התיבה.
            </p>
          </Group>

          <Group title="הזחות">
            <div className="grid2">
              <Labeled label="הזחה מימין">
                <NumberField value={style.indentRight ?? 0} unit={unit} min={0} max={MAX_PAGE_PT} onChange={(v) => onChange({ indentRight: v })} />
              </Labeled>
              <Labeled label="הזחה משמאל">
                <NumberField value={style.indentLeft ?? 0} unit={unit} min={0} max={MAX_PAGE_PT} onChange={(v) => onChange({ indentLeft: v })} />
              </Labeled>
            </div>
            <Labeled label="הזחת שורה ראשונה בלבד">
              <NumberField value={style.firstLineIndent ?? 0} unit={unit} min={0} max={MAX_PAGE_PT} onChange={(v) => onChange({ firstLineIndent: v })} />
            </Labeled>
            <Labeled label="הזחת שורה שנייה ואילך">
              <NumberField value={style.secondLineIndent ?? 0} unit={unit} min={0} max={MAX_PAGE_PT} onChange={(v) => onChange({ secondLineIndent: v })} />
            </Labeled>
            <p className="muted">ההזחות חלות על הפסקאות שבבחירה.</p>
          </Group>

          <Group title="מניעת שורות בודדות">
            <div className="grid2">
              <Labeled label="מינימום שורות בתחילת פסקה">
                <NumberField value={keepFirstLines} mixed={keepFirstMixed} min={0} max={10} onChange={(first) => onKeepLinesChange({ first })} />
              </Labeled>
              <Labeled label="מינימום שורות בסוף פסקה">
                <NumberField value={keepLastLines} mixed={keepLastMixed} min={0} max={10} onChange={(last) => onKeepLinesChange({ last })} />
              </Labeled>
            </div>
            <p className="muted">0 מבטל את ההגבלה. הכללים חלים על כל הפסקאות שבבחירה.</p>
          </Group>

        </>
      )}
    </aside>
  )
}
