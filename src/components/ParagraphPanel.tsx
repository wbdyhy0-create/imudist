import { DEFAULT_SPACE_AFTER, MAX_PAGE_PT, type TextFrame, type TextStyle } from '../document'
import type { Unit } from '../units'
import { Group, Labeled } from './PropertiesPanel'
import { NumberField } from './NumberField'

type ParagraphPatch = Partial<Pick<TextStyle, 'spaceBefore' | 'spaceAfter' | 'indentLeft' | 'indentRight' | 'firstLineIndent' | 'secondLineIndent'>>

interface Props {
  frame: TextFrame | null
  /** the selected frame's story-wide style (never selection-scoped: these settings always belong to the whole story) */
  style: TextStyle | null
  unit: Unit
  onChange: (patch: ParagraphPatch) => void
}

/** Window > פסקה (Ctrl+Alt+M): paragraph spacing, indents and the second-line special effect, all story-wide. */
export function ParagraphPanel({ frame, style, unit, onChange }: Props) {
  return (
    <aside className="props-panel" aria-label="פסקה">
      <h2 className="props-title">פסקה</h2>
      {!frame || !style ? (
        <p className="muted">בחר תיבת טקסט כדי לערוך את מרווחי הפסקה שלה.</p>
      ) : (
        <>
          <Group title="מרווחי פסקאות">
            <div className="grid2">
              <Labeled label="רווח לפני">
                <NumberField value={style.spaceBefore ?? 0} unit={unit} min={0} max={MAX_PAGE_PT} onChange={(v) => onChange({ spaceBefore: v })} />
              </Labeled>
              <Labeled label="רווח אחרי">
                <NumberField value={style.spaceAfter ?? DEFAULT_SPACE_AFTER} unit={unit} min={0} max={MAX_PAGE_PT} onChange={(v) => onChange({ spaceAfter: v })} />
              </Labeled>
            </div>
            <p className="muted">שייכים לכל התיבה: רווח לפני מעל השורה הראשונה שלה, רווח אחרי מתחת לשורה האחרונה שלה.</p>
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
          </Group>

          <Group title="אפקטים מיוחדים">
            <Labeled label="הזחת שורה שנייה בלבד (אפקט חלון)">
              <NumberField value={style.secondLineIndent ?? 0} unit={unit} min={0} max={MAX_PAGE_PT} onChange={(v) => onChange({ secondLineIndent: v })} />
            </Labeled>
            <p className="muted">השורה הראשונה נשארת בשוליים הרגילים, השורה השנייה בלבד מוזחת פנימה מימין, ומהשורה השלישית ואילך חוזרים לשוליים הרגילים.</p>
          </Group>
        </>
      )}
    </aside>
  )
}
