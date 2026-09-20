/** True while the user is typing into a form control (single-key shortcuts must stay out of the way). */
export const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)

/** The rich text editor inside a text frame. */
export const isTextEditor = (t: EventTarget | null) => t instanceof HTMLElement && t.classList.contains('rich-editor')
