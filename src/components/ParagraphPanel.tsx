import { DEFAULT_SPACE_AFTER, MAX_PAGE_PT, type TextFrame, type TextStyle } from '../document'
import type { Unit } from '../units'
import { Group, Labeled } from './PropertiesPanel'
import { NumberField } from './NumberField'

type SpacingPatch = Partial<Pick<TextStyle, 'spaceBefore' | 'spaceAfter'>>
type ParagraphPatch = Partial<Pick<TextStyle, 'indentLeft' | 'indentRight' | 'firstLineIndent' | 'secondLineIndent'>>

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
}

/** Window > פסקה (Ctrl+Alt+L): paragraph spacing (per-paragraph or story-wide), indents and the second-line effect. */
export function ParagraphPanel({ frame, style, scope, unit, onChange, onSpacingChange }: Props) {
  return (
    <aside className="props-panel" aria-label="פסקה">
      <h2 className="props-title">פסקה</h2>
      {!frame || !style ? (
        <p className="muted">בחר תיבת טקסט כדי לערוך את מרווחי הפסקה שלה.</p>
      ) : (
        <>
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
            <p className="muted">שייכות לכל התיבה.</p>
          </Group>

        </>
      )}
    </aside>
  )
}
