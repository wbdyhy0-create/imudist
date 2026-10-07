import type { ReactNode } from 'react'
import { BOOL_OP_NAMES, type BoolOp } from '../shapeOps'
import { AlignButtons, type AlignOp } from './AlignButtons'
import { Group } from './PropertiesPanel'

interface Props {
  count: number
  /** how many of the selected objects are shapes */
  shapeCount: number
  onShapeOp: (op: BoolOp) => void
  onAlign: (op: AlignOp) => void
  /** exactly a picture and a shape are selected together */
  canInsertImage: boolean
  onInsertImage: () => void
  canMergeImages: boolean
  onMergeImages: () => void
  canCreateImage: boolean
  onCreateImage: () => void
  canExportPng: boolean
  onExportPng: () => void
  onDelete: () => void
}

const OPS: { op: BoolOp; hint: string; icon: ReactNode }[] = [
  {
    op: 'unite',
    hint: 'שתי הצורות (או יותר) הופכות לצורה אחת. הצבע הוא של הצורה התחתונה.',
    icon: <path d="M3 3h9v3h3v9H6v-3H3z" fill="currentColor" stroke="none" />,
  },
  {
    op: 'subtract',
    hint: 'הצורה התחתונה נחסרת בצורה שמעליה, והצורה שחיסרה נעלמת.',
    icon: (
      <>
        <path d="M3 3h9v3h-3v3H6v3H3z" fill="currentColor" stroke="none" />
        <path d="M9 6h6v9H6v-3M9 6V9H6" fill="none" strokeDasharray="1.500 1.500" />
      </>
    ),
  },
  {
    op: 'intersect',
    hint: 'נשאר רק האזור שבו הצורות חופפות.',
    icon: (
      <>
        <path d="M3 3h9v9H3zM6 6h9v9H6z" fill="none" />
        <path d="M6 6h6v6H6z" fill="currentColor" stroke="none" />
      </>
    ),
  },
  {
    op: 'exclude',
    hint: 'נשארים האזורים שרק אחת הצורות מכסה, והחפיפה נחתכת החוצה.',
    icon: <path d="M3 3h9v3H6v6H3zM9 9h6v6H6v-3h3z" fill="currentColor" stroke="none" />,
  },
]

/** The properties panel while several objects are selected: combining shapes, flattening objects, and deleting. */
export function MultiSelectionPanel({ count, shapeCount, onShapeOp, onAlign, canInsertImage, onInsertImage, canMergeImages, onMergeImages, canCreateImage, onCreateImage, canExportPng, onExportPng, onDelete }: Props) {
  return (
    <aside className="props-panel" aria-label="בחירה מרובה">
      <h2 className="props-title">{count} אובייקטים נבחרו</h2>
      <p className="muted">גרירה של אחד מהם מזיזה את כולם יחד, והחצים מזיזים אותם מעט. Delete מוחק את כולם בבת אחת. Shift וקליק מוסיף אובייקט לבחירה או מוריד אותו ממנה.</p>

      {canInsertImage && (
        <Group title="תמונה בתוך צורה">
          <p className="muted">התמונה תיכנס לתוך הצורה ותסתדר לפי גודלה — גם תמונה ענקית תוקטן בהתאם. מסגרת התמונה הנפרדת תיעלם.</p>
          <div className="props-buttons">
            <button className="btn small" onClick={onInsertImage}>
              הכנס את התמונה לתוך הצורה
            </button>
          </div>
        </Group>
      )}

      {canMergeImages && (
        <Group title="איחוד תמונות">
          <div className="props-buttons">
            <button className="btn small" onClick={onMergeImages}>
              מזג לשכבת תמונה אחת
            </button>
          </div>
        </Group>
      )}

      {canCreateImage && (
        <Group title="השטחה לתמונה">
          <p className="muted">האובייקטים הנבחרים יהפכו לתמונה אחת; המקוריים יוחלפו. אפשר לבטל ב־Undo.</p>
          <div className="props-buttons">
            <button className="btn small" onClick={onCreateImage}>
              צור תמונה אחת מהנבחרים
            </button>
          </div>
        </Group>
      )}

      {canExportPng && (
        <Group title="ייצוא PNG">
          <p className="muted">שמור את מראה האובייקטים הנבחרים כתמונה עם רקע שקוף. האובייקטים במסמך לא ישתנו.</p>
          <div className="props-buttons">
            <button className="btn small" onClick={onExportPng}>
              ייצא בחירה ל־PNG
            </button>
          </div>
        </Group>
      )}

      <Group title="בניית צורות">
        {shapeCount >= 2 ? (
          <div className="shape-ops" role="group" aria-label="בניית צורות">
            {OPS.map((o) => (
              <button key={o.op} className="shape-op" title={o.hint} onClick={() => onShapeOp(o.op)}>
                <svg viewBox="0 0 18 18" aria-hidden="true">
                  {o.icon}
                </svg>
                {BOOL_OP_NAMES[o.op]}
              </button>
            ))}
          </div>
        ) : (
          <p className="muted">בחר שתי צורות או יותר כדי לאחד אותן, לחסר אחת מהשנייה, לחתוך או להחריג.</p>
        )}
      </Group>

      <Group title="יישור אובייקטים">
        <AlignButtons onAlign={onAlign} />
      </Group>

      <div className="props-buttons" style={{ marginTop: 10 }}>
        <button className="btn small danger" onClick={onDelete}>
          מחק את הנבחרים
        </button>
      </div>
    </aside>
  )
}
