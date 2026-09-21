import { DEFAULT_GUIDE_COLOR, MAX_PAGE_PT, type Guide } from '../document'
import type { Unit } from '../units'
import { GuideColors } from './GuideColors'
import { NumberField } from './NumberField'
import { Group, Labeled } from './PropertiesPanel'

interface Props {
  guide: Guide
  /** the number shown for the guide's page (respects "start page number") */
  pageNumber: number
  unit: Unit
  onPos: (pos: number) => void
  onColor: (color: string) => void
  onDelete: () => void
}

/** The properties panel of a selected guide. */
export function GuideProperties({ guide, pageNumber, unit, onPos, onColor, onDelete }: Props) {
  const horizontal = guide.axis === 'h'
  return (
    <aside className="props-panel" aria-label="מאפייני קו עזר">
      <h2 className="props-title">קו עזר</h2>
      <p className="muted">
        {horizontal ? 'קו אופקי' : 'קו אנכי'} · עמוד {pageNumber}
      </p>

      <Group title="מיקום">
        <Labeled label={horizontal ? 'מרחק מראש העמוד' : 'מרחק מהקצה השמאלי של העמוד'}>
          <NumberField value={guide.pos} unit={unit} min={-MAX_PAGE_PT} max={MAX_PAGE_PT} onChange={onPos} />
        </Labeled>
        <p className="muted">אפשר גם לגרור את הקו, או לגרור אותו חזרה אל הסרגל כדי למחוק אותו.</p>
      </Group>

      <Group title="צבע">
        <GuideColors value={guide.color ?? DEFAULT_GUIDE_COLOR} onChange={onColor} />
      </Group>

      <div className="props-buttons" style={{ marginTop: 10 }}>
        <button className="btn small danger" onClick={onDelete}>
          מחק קו עזר
        </button>
      </div>
    </aside>
  )
}
