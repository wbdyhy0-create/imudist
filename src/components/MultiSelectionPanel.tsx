interface Props {
  count: number
  onDelete: () => void
}

/** The properties panel while several objects are selected. */
export function MultiSelectionPanel({ count, onDelete }: Props) {
  return (
    <aside className="props-panel" aria-label="בחירה מרובה">
      <h2 className="props-title">{count} אובייקטים נבחרו</h2>
      <p className="muted">גרירה של אחד מהם מזיזה את כולם יחד, והחצים מזיזים אותם מעט. Delete מוחק את כולם בבת אחת. Shift וקליק מוסיף אובייקט לבחירה או מוריד אותו ממנה.</p>
      <div className="props-buttons" style={{ marginTop: 10 }}>
        <button className="btn small danger" onClick={onDelete}>
          מחק את הנבחרים
        </button>
      </div>
    </aside>
  )
}
