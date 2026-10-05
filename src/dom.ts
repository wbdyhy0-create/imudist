/** True while the user is typing into a form control (single-key shortcuts must stay out of the way). */
export const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)

/** A cell of a table being typed into (its Ctrl+Z / Ctrl+Y are the document's, like in the text editor). */
export const isTableCellEditor = (t: EventTarget | null) => t instanceof HTMLElement && t.classList.contains('table-cell-editor')

/** The rich text editor inside a text frame. */
export const isTextEditor = (t: EventTarget | null) => t instanceof HTMLElement && t.classList.contains('rich-editor')
