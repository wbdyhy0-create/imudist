import { useEffect, useMemo, useRef, useState } from 'react'
import { t, useLanguage } from '../i18n'
import { macKeys } from '../platform'
import {
  DEFAULT_SET_ID,
  activeSet,
  changeActiveKeys,
  commandsWithCombo,
  comboFromEvent,
  createShortcutSet,
  keysIn,
  removeShortcutSet,
  renameShortcutSet,
  reservedReason,
  resetActiveSet,
  restoreSetKeys,
  sameCombo,
  selectShortcutSet,
  useShortcutState,
  withCommandKeys,
  type ShortcutCommand,
} from '../shortcuts'
import { allShortcutCommands } from '../shortcutCommands'
import type { MenuDef } from './MenuBar'

/** where a new key is being recorded: a command, and the key it replaces (`'add'` for one more) */
interface Capture {
  id: string
  index: number | 'add'
}

/** a key the user pressed that another command already has */
interface Clash {
  capture: Capture
  combo: string
  owners: ShortcutCommand[]
}

/**
 * Edit > קיצורי מקשים…: every command and tool by category, the keys each one has, and a way to give it others by pressing them.
 * The program's own set is never written to: a change goes into a set of the user's own (made on the first change), and a set
 * holds only what it changes. `menus` are the menus with the program's own keys on them.
 */
export function ShortcutsDialog({ menus, onClose }: { menus: MenuDef[]; onClose: () => void }) {
  const language = useLanguage()
  const state = useShortcutState()
  const active = activeSet(state)
  const keys = active?.keys ?? {}
  const commands = useMemo(() => allShortcutCommands(menus), [menus, language])
  const byId = useMemo(() => new Map(commands.map((command) => [command.id, command])), [commands])

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [capture, setCapture] = useState<Capture | null>(null)
  const [clash, setClash] = useState<Clash | null>(null)
  const [notice, setNotice] = useState<{ text: string; error?: boolean; undo?: () => void } | null>(null)
  const [naming, setNaming] = useState<{ kind: 'new' | 'rename'; value: string } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    rootRef.current?.focus()
  }, [])

  /** the new keys of a command, written into the active set (a new set when the built-in one is active) */
  const writeKeys = (changes: { command: ShortcutCommand; list: string[] }[]) => {
    const written = changeActiveKeys((current) => changes.reduce((acc, { command, list }) => withCommandKeys(acc, command, list), current), t('הסט שלי'))
    if (!active) setNotice({ text: t('נוצר סט חדש ״{name}״ ובו השינוי. ברירת המחדל של התוכנה לא השתנתה.', { name: written.name }) })
    else setNotice(null)
  }

  const keysOfCommand = (command: ShortcutCommand) => keysIn(keys, command)

  /** put `combo` in a command's keys, replacing the one at `index` (or adding it), and taking it from `from` */
  const assign = (target: Capture, combo: string, from: ShortcutCommand[]) => {
    const command = byId.get(target.id)
    if (!command) return
    const list = [...keysOfCommand(command)]
    if (target.index === 'add' || target.index >= list.length) list.push(combo)
    else list[target.index] = combo
    writeKeys([
      ...from.map((other) => ({ command: other, list: keysOfCommand(other).filter((k) => !sameCombo(k, combo)) })),
      { command, list },
    ])
  }

  /** a key was pressed for a command: kept at once, unless it cannot be given or another command has it */
  const propose = (target: Capture, combo: string) => {
    const command = byId.get(target.id)
    if (!command) return
    const reason = reservedReason(combo)
    if (reason) {
      setNotice({ text: t('הצירוף {keys} שמור לפעולה קבועה ({reason}) ולא ניתן להקצות אותו.', { keys: macKeys(combo), reason: t(reason) }), error: true })
      return
    }
    const current = keysOfCommand(command)
    if (current.some((k, i) => sameCombo(k, combo) && i !== target.index)) {
      setNotice({ text: t('לפקודה הזו כבר יש את הצירוף {keys}.', { keys: macKeys(combo) }), error: true })
      return
    }
    const owners = commandsWithCombo(commands, keys, combo, command.id)
    if (owners.length > 0) {
      setNotice(null)
      setClash({ capture: target, combo, owners })
      return
    }
    assign(target, combo, [])
  }

  const proposeRef = useRef(propose)
  proposeRef.current = propose
  const captureRef = useRef(capture)
  captureRef.current = capture

  // while a key is being recorded every key press is the answer: nothing else in the program hears it
  useEffect(() => {
    if (!capture) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      if (e.key === 'Escape' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        setCapture(null)
        return
      }
      const combo = comboFromEvent(e)
      if (!combo) return // only a modifier so far
      setCapture(null)
      proposeRef.current(capture, combo)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [capture])

  const startCapture = (next: Capture) => {
    setClash(null)
    setNotice(null)
    setNaming(null)
    setCapture(capture && capture.id === next.id && capture.index === next.index ? null : next)
  }

  const removeKey = (command: ShortcutCommand, index: number) => {
    setCapture(null)
    setClash(null)
    writeKeys([{ command, list: keysOfCommand(command).filter((_, i) => i !== index) }])
  }

  const revertCommand = (command: ShortcutCommand) => {
    setCapture(null)
    setClash(null)
    writeKeys([{ command, list: command.defaults }])
  }

  const resetAll = () => {
    if (!active) return
    const id = active.id
    const before = resetActiveSet()
    setCapture(null)
    setClash(null)
    setNotice({ text: t('כל הקיצורים בסט ״{name}״ חזרו לברירת המחדל.', { name: active.name }), undo: () => { restoreSetKeys(id, before); setNotice(null) } })
  }

  const submitName = () => {
    if (!naming) return
    if (naming.kind === 'new') createShortcutSet(naming.value)
    else if (active) renameShortcutSet(active.id, naming.value)
    setNaming(null)
  }

  const categories = useMemo(() => [...new Set(commands.map((command) => command.category))], [commands])
  const needle = query.trim().toLowerCase()
  const shown = commands.filter((command) => {
    if (category && command.category !== category) return false
    if (!needle) return true
    const own = keysIn(keys, command)
    return [t(command.label), command.label, ...command.path.map((part) => t(part)), ...own, ...own.map((k) => macKeys(k))].some((text) => text.toLowerCase().includes(needle))
  })
  const groups = categories.map((name) => [name, shown.filter((command) => command.category === name)] as const).filter(([, list]) => list.length > 0)

  const changedCount = active ? Object.keys(active.keys).length : 0
  const none = <span className="shortcuts-none">{t('ללא קיצור')}</span>

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        ref={rootRef}
        tabIndex={-1}
        className="modal shortcuts-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('קיצורי מקשים')}
        // the keys typed here are the dialog's own: the program under it does not hear them
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Escape') {
            if (naming) setNaming(null)
            else if (clash) setClash(null)
            else onClose()
          }
        }}
      >
        <h2>{t('קיצורי מקשים')}</h2>

        <div className="shortcuts-sets">
          <label>
            <span>{t('סט קיצורים')}</span>
            <select value={state.activeId} onChange={(e) => { setCapture(null); setClash(null); setNotice(null); selectShortcutSet(e.target.value) }}>
              <option value={DEFAULT_SET_ID}>{t('ברירת מחדל (מובנה)')}</option>
              {state.sets.map((set) => (
                <option key={set.id} value={set.id}>
                  {set.name}
                </option>
              ))}
            </select>
          </label>
          <button className="btn small" onClick={() => { setCapture(null); setNaming({ kind: 'new', value: t('הסט שלי') }) }}>
            {t('סט חדש…')}
          </button>
          <button className="btn small" disabled={!active} onClick={() => { setCapture(null); setNaming({ kind: 'rename', value: active?.name ?? '' }) }}>
            {t('שינוי שם')}
          </button>
          <button className="btn small" disabled={!active} onClick={() => active && removeShortcutSet(active.id)}>
            {t('מחיקת הסט')}
          </button>
        </div>
        {naming && (
          <form className="shortcuts-naming" onSubmit={(e) => { e.preventDefault(); submitName() }}>
            <input autoFocus value={naming.value} aria-label={t('שם הסט')} onChange={(e) => setNaming({ ...naming, value: e.target.value })} />
            <button className="btn small primary" type="submit">
              {naming.kind === 'new' ? t('יצירה') : t('שמירה')}
            </button>
            <button className="btn small" type="button" onClick={() => setNaming(null)}>
              {t('ביטול')}
            </button>
          </form>
        )}
        <p className="muted shortcuts-hint">
          {active
            ? t('השינויים נשמרים בסט ״{name}״ בלבד. ברירת המחדל של התוכנה נשארת כמות שהיא.', { name: active.name })
            : t('זה סט ברירת המחדל של התוכנה והוא לא משתנה. שינוי של קיצור יוצר סט אישי חדש.')}
        </p>

        <div className="shortcuts-filter">
          <input type="search" value={query} placeholder={t('חיפוש פקודה או קיצור')} aria-label={t('חיפוש פקודה או קיצור')} onChange={(e) => setQuery(e.target.value)} />
          <select value={category} aria-label={t('קטגוריה')} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{t('כל הקטגוריות')}</option>
            {categories.map((name) => (
              <option key={name} value={name}>
                {t(name)}
              </option>
            ))}
          </select>
        </div>

        <div className="shortcuts-list" role="list">
          {groups.length === 0 && <p className="muted shortcuts-empty">{t('לא נמצאו פקודות')}</p>}
          {groups.map(([name, list]) => (
            <section key={name} role="group" aria-label={t(name)}>
              <h3>{t(name)}</h3>
              {list.map((command) => {
                const own = keysOfCommand(command)
                const changed = !!active?.keys[command.id]
                const where = command.path.map((part) => t(part)).join(' › ')
                const capturing = capture?.id === command.id ? capture : null
                return (
                  <div key={command.id} className={'shortcuts-row' + (changed ? ' changed' : '')} role="listitem">
                    <div className="shortcuts-name">
                      <span>{t(command.label)}</span>
                      {where && <small className="muted">{where}</small>}
                    </div>
                    <div className="shortcuts-keys">
                      {own.length === 0 && !capturing && none}
                      {own.map((combo, index) =>
                        capturing?.index === index ? (
                          <span key={combo} className="shortcuts-capture" role="status">
                            {t('לחצו על צירוף מקשים… (Esc לביטול)')}
                          </span>
                        ) : (
                          <span key={combo} className="shortcuts-chip">
                            <button className="shortcuts-key" title={t('לחצו כדי להחליף את הקיצור')} onClick={() => startCapture({ id: command.id, index })}>
                              <kbd dir="ltr">{macKeys(combo)}</kbd>
                            </button>
                            <button className="shortcuts-remove" aria-label={t('הסרת הקיצור')} title={t('הסרת הקיצור')} onClick={() => removeKey(command, index)}>
                              ×
                            </button>
                          </span>
                        ),
                      )}
                      {capturing?.index === 'add' ? (
                        <span className="shortcuts-capture" role="status">
                          {t('לחצו על צירוף מקשים… (Esc לביטול)')}
                        </span>
                      ) : (
                        <button className="shortcuts-add" title={t('הוספת קיצור')} aria-label={t('הוספת קיצור')} onClick={() => startCapture({ id: command.id, index: 'add' })}>
                          +
                        </button>
                      )}
                      {changed && (
                        <button
                          className="shortcuts-revert"
                          aria-label={t('החזרת ברירת המחדל של הפקודה')}
                          title={t('החזרה לברירת המחדל: {keys}', { keys: command.defaults.length ? command.defaults.map((k) => macKeys(k)).join(', ') : t('ללא קיצור') })}
                          onClick={() => revertCommand(command)}
                        >
                          ↺
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </section>
          ))}
        </div>

        {clash && (
          <div className="shortcuts-warning" role="alert">
            <span>
              {t('הצירוף {keys} כבר משמש את {commands}.', {
                keys: macKeys(clash.combo),
                commands: clash.owners.map((owner) => `״${t(owner.label)}״`).join(', '),
              })}
            </span>
            <button
              className="btn small primary"
              onClick={() => {
                assign(clash.capture, clash.combo, clash.owners)
                setClash(null)
              }}
            >
              {t('הקצה לכאן והסר מהפקודה השנייה')}
            </button>
            <button className="btn small" onClick={() => setClash(null)}>
              {t('ביטול')}
            </button>
          </div>
        )}
        {notice && (
          <div className={'shortcuts-notice' + (notice.error ? ' error' : '')} role={notice.error ? 'alert' : 'status'}>
            <span>{notice.text}</span>
            {notice.undo && (
              <button className="btn small" onClick={notice.undo}>
                {t('ביטול')}
              </button>
            )}
          </div>
        )}

        <div className="shortcuts-footer">
          <button
            className="btn small"
            disabled={changedCount === 0}
            title={changedCount === 0 ? t('הסט הפעיל כבר זהה לברירת המחדל') : t('מחזיר את כל הקיצורים בסט הפעיל לרשימה המקורית של התוכנה')}
            onClick={resetAll}
          >
            {t('אפס לברירת מחדל')}
          </button>
          <button className="btn primary" onClick={onClose}>
            {t('סגירה')}
          </button>
        </div>
      </div>
    </div>
  )
}
