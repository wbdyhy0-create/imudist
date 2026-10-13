import { DEFAULT_SPACE_AFTER, MAX_PAGE_PT, type CharStyle, type ColorSample, type TextFrame, type TextStyle } from '../document'
import type { Unit } from '../units'
import { CharControls, Group, Labeled, ParagraphTextControls, TextShadowGroup } from './PropertiesPanel'
import { NumberField } from './NumberField'
import { t } from '../i18n'

type SpacingPatch = Partial<Pick<TextStyle, 'spaceBefore' | 'spaceAfter'>>
type ParagraphPatch = Partial<Pick<TextStyle, 'align' | 'direction' | 'leading' | 'wordSpacingMin' | 'wordSpacingMax' | 'wordSpacing' | 'indentLeft' | 'indentRight' | 'firstLineIndent' | 'secondLineIndent'>>
type KeepLinesPatch = Partial<{ first: number; last: number }>

interface Props {
  frame: TextFrame | null
  /** indents/etc. read the story's own style; spaceBefore/spaceAfter read the selected paragraph's own (see scope) */
  style: TextStyle | null
  textStyle: CharStyle | null
  colorSamples: ColorSample[]
  onCharStyle: (patch: Partial<CharStyle>) => void
  sizeMixed?: boolean
  onSizeStep?: (delta: number) => void
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
  /** every selected paragraph keeps with the one after it (a verse, a heading: never alone at the bottom of a frame) */
  keepWithNext?: boolean
  keepWithNextMixed?: boolean
  onKeepWithNextChange?: (on: boolean) => void
}

/** Window > פסקה (Ctrl+Alt+L): paragraph layout, spacing, indents and line-break controls. */
export function ParagraphPanel({ frame, style, textStyle, colorSamples, onCharStyle, sizeMixed, onSizeStep, scope, unit, onChange, onSpacingChange, keepFirstLines, keepLastLines, keepFirstMixed, keepLastMixed, onKeepLinesChange, keepWithNext = false, keepWithNextMixed = false, onKeepWithNextChange }: Props) {
  return (
    <aside className="props-panel" aria-label={t('פסקה')}>
      <h2 className="props-title">{t('פסקה')}</h2>
      {!frame || !style ? (
        <p className="muted">{t('בחר תיבת טקסט כדי לערוך את מרווחי הפסקה שלה.')}</p>
      ) : (
        <>
          {textStyle && (
            <Group title={t('טקסט')}>
              <p className={'scope-hint' + (scope === 'selection' ? ' on' : '')}>
                {scope === 'selection' ? t('השינויים חלים על הטקסט המסומן') : t('השינויים חלים על כל הטקסט בתיבה. סמן טקסט כדי לשנות רק חלק ממנו.')}
              </p>
              <CharControls
                style={textStyle}
                onCharStyle={onCharStyle}
                sizeMixed={sizeMixed}
                onSizeStep={onSizeStep}
                onLeading={(leading) => onChange({ leading })}
                samples={colorSamples}
                afterTracking={<ParagraphTextControls style={style} onChange={onChange} />}
                showShadow={false}
              />
            </Group>
          )}

          <Group title={t('מרווחי פסקאות')}>
            <p className={'scope-hint' + (scope === 'selection' ? ' on' : '')}>
              {scope === 'selection' ? t('השינויים חלים על הפסקה המסומנת') : t('השינויים חלים על כל הפסקאות בתיבה. סמן טקסט בפסקה כדי לשנות רק אותה.')}
            </p>
            <div className="grid2">
              <Labeled label={t('רווח לפני')}>
                <NumberField value={style.spaceBefore ?? 0} unit={unit} min={0} max={MAX_PAGE_PT} onChange={(v) => onSpacingChange({ spaceBefore: v })} />
              </Labeled>
              <Labeled label={t('רווח אחרי')}>
                <NumberField value={style.spaceAfter ?? DEFAULT_SPACE_AFTER} unit={unit} min={0} max={MAX_PAGE_PT} onChange={(v) => onSpacingChange({ spaceAfter: v })} />
              </Labeled>
            </div>
            <p className="muted">
              {t('רווח לפני דוחק את הפסקה מהפסקה שלפניה; רווח אחרי דוחק את הפסקה שאחריה. ללא בחירת טקסט בפסקה מסוימת, הערכים חלים על כל התיבה.')}
            </p>
          </Group>

          <Group title={t('הזחות')}>
            <p className="muted">{t('הזחה מימין או משמאל קובעת את מרחק הפסקה מהשוליים המתאימים.')}</p>
            <div className="grid2">
              <Labeled label={t('הזחה מימין')}>
                <NumberField value={style.indentRight ?? 0} unit={unit} min={0} max={MAX_PAGE_PT} onChange={(v) => onChange({ indentRight: v })} />
              </Labeled>
              <Labeled label={t('הזחה משמאל')}>
                <NumberField value={style.indentLeft ?? 0} unit={unit} min={0} max={MAX_PAGE_PT} onChange={(v) => onChange({ indentLeft: v })} />
              </Labeled>
            </div>
            <Labeled label={t('הזחת שורה ראשונה בלבד')}>
              <NumberField value={style.firstLineIndent ?? 0} unit={unit} min={0} max={MAX_PAGE_PT} onChange={(v) => onChange({ firstLineIndent: v })} />
            </Labeled>
            <Labeled label={t('הזחת שורה שנייה ואילך')}>
              <NumberField value={style.secondLineIndent ?? 0} unit={unit} min={0} max={MAX_PAGE_PT} onChange={(v) => onChange({ secondLineIndent: v })} />
            </Labeled>
            <p className="muted">{t('ההזחות חלות על הפסקאות שבבחירה.')}</p>
          </Group>

          <Group title={t('מניעת שורות בודדות')}>
            <div className="grid2">
              <Labeled label={t('מינימום שורות בתחילת פסקה')}>
                <NumberField value={keepFirstLines} mixed={keepFirstMixed} min={0} max={10} onChange={(first) => onKeepLinesChange({ first })} />
              </Labeled>
              <Labeled label={t('מינימום שורות בסוף פסקה')}>
                <NumberField value={keepLastLines} mixed={keepLastMixed} min={0} max={10} onChange={(last) => onKeepLinesChange({ last })} />
              </Labeled>
            </div>
            <p className="muted">{t('0 מבטל את ההגבלה. הכללים חלים על כל הפסקאות שבבחירה.')}</p>
          </Group>

          {onKeepWithNextChange && (
            <Group title={t('שמירה על רצף')}>
              <label className="page-bar-check" title={t('הפסקאות שבבחירה לא יישארו לבד בתחתית עמוד: הן עוברות לעמוד הבא יחד עם תחילת הפסקה שאחריהן')}>
                <input
                  type="checkbox"
                  checked={keepWithNext && !keepWithNextMixed}
                  ref={(el) => { if (el) el.indeterminate = keepWithNextMixed }}
                  onChange={(event) => onKeepWithNextChange(event.target.checked)}
                />
                {t('שמור עם הפסקה הבאה')}
              </label>
              <p className="muted">{t('חל רק על הפסקאות שבבחירה (או על הפסקה שבה הסמן), בלי לשנות את הסגנון שלהן. אם כמה פסקאות רצופות מסומנות, הן עוברות יחד.')}</p>
            </Group>
          )}
          {textStyle && <TextShadowGroup style={textStyle} onChange={onCharStyle} />}

        </>
      )}
    </aside>
  )
}
