import { DEFAULT_GUIDE_COLOR, MAX_PAGE_PT, type Guide } from '../document'
import type { Unit } from '../units'
import { GuideColors } from './GuideColors'
import { NumberField } from './NumberField'
import { Group, Labeled } from './PropertiesPanel'
import { t } from '../i18n'

interface Props {
  /** the selected guides (at least one) */
  guides: Guide[]
  /** the number shown for the page of the first guide (respects "start page number") */
  pageNumber: number
  unit: Unit
  /** the position of a single selected guide */
  onPos: (pos: number) => void
  /** the color of all the selected guides */
  onColor: (color: string) => void
  /** delete all the selected guides */
  onDelete: () => void
}

/** The properties panel of the selected guide(s). */
export function GuideProperties({ guides, pageNumber, unit, onPos, onColor, onDelete }: Props) {
  const one = guides.length === 1 ? guides[0] : null
  const colors = new Set(guides.map((g) => (g.color ?? DEFAULT_GUIDE_COLOR).toLowerCase()))
  const common = colors.size === 1 ? (guides[0].color ?? DEFAULT_GUIDE_COLOR) : null

  return (
    <aside className="props-panel" aria-label={t('מאפייני קווי עזר')}>
      <h2 className="props-title">{one ? t('קו עזר') : t('{n1} קווי עזר', { n1: guides.length })}</h2>
      <p className="muted">
        {one ? `${one.axis === 'h' ? t('קו אופקי') : t('קו אנכי')} · ${t('עמוד {number}', { number: pageNumber })}` : t('נבחרו כמה קווים. Delete מוחק את כולם, וגרירה מזיזה אותם יחד.')}
      </p>

      {one && (
        <Group title={t('מיקום')}>
          <Labeled label={one.axis === 'h' ? t('מרחק מראש העמוד') : t('מרחק מהקצה השמאלי של העמוד')}>
            <NumberField value={one.pos} unit={unit} min={-MAX_PAGE_PT} max={MAX_PAGE_PT} onChange={onPos} />
          </Labeled>
          <p className="muted">{t('אפשר גם לגרור את הקו, או לגרור אותו חזרה אל הסרגל כדי למחוק אותו.')}</p>
        </Group>
      )}

      <Group title={t('צבע')}>
        <GuideColors value={common} onChange={onColor} />
      </Group>

      <div className="props-buttons" style={{ marginTop: 10 }}>
        <button className="btn small danger" onClick={onDelete}>
          {one ? t('מחק קו עזר') : t('מחק את הקווים שנבחרו')}
        </button>
      </div>
    </aside>
  )
}
