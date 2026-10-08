import { describe, expect, it } from 'vitest'
import { getHelpTopicResults, normalizeHelpQuery } from './HelpSearch'
import { getHelpTopicCategory, HELP_TOPICS } from './HelpTopics'

const search = (query: string) => getHelpTopicResults(normalizeHelpQuery(query))

describe('help topic search', () => {
  it('labels help topics with their interface area', () => {
    const categoryFor = (id: string) => {
      const topic = HELP_TOPICS.find((item) => item.id === id)
      if (!topic) throw new Error(`Missing help topic: ${id}`)
      return getHelpTopicCategory(topic)
    }

    expect(categoryFor('pages-panel')).toBe('לוח עמודים')
    expect(categoryFor('pages-navigation')).toBe('לוח עמודים')
    expect(categoryFor('page-master-create-edit')).toBe('עמודי אב')
    expect(categoryFor('page-number-troubleshooting')).toBe('מספור עמודים')
    expect(categoryFor('page-running-first-last')).toBe('כותרות משתנות')
    expect(categoryFor('table-create')).toBe('טבלאות')
    expect(categoryFor('properties-table')).toBe('טבלאות')
    expect(categoryFor('properties-text-font')).toBe('חלונית מאפיינים')
    expect(categoryFor('book-create')).toBe('ספרים')
    expect(categoryFor('bleed-slug')).toBe('הגדרות הדפסה')
    expect(categoryFor('color-panel')).toBe('צבע')
    expect(categoryFor('gradient-panel')).toBe('מעבר צבע')
    expect(categoryFor('swatches-panel')).toBe('דוגמיות')
    expect(categoryFor('layers-panel')).toBe('לשונית שכבות')
    expect(categoryFor('file-export')).toBe('תפריט קובץ')
    expect(categoryFor('export-pdf')).toBe('קובץ · PDF')
    expect(categoryFor('pdf-page-range')).toBe('קובץ · PDF')
    expect(categoryFor('export-png')).toBe('קובץ · PNG')
    expect(categoryFor('png-current-page')).toBe('קובץ · PNG')
    expect(categoryFor('png-selection')).toBe('PNG · בחירת אובייקטים')
  })

  it('finds vector-related topics from a single Hebrew word', () => {
    expect(search('וקטורי')[0]?.id).toBe('pdf-vector')
    expect(search('וקטו')[0]?.id).toBe('pdf-vector')
    expect(search('וקטורי בלבד')[0]?.id).toBe('pdf-vector')
  })

  it('explains the distinct roles of PDF image quality, color mode, and vector export', () => {
    const topic = search('מה ההבדל בייצוא פידיאף באיכות התמונות ובמצב צבע התמונות ומה הוא ייצוא וקטורי')[0]
    expect(topic?.id).toBe('pdf-vector')
    expect(topic?.answer[0]).toContain('DPI אינו משפר פרטים שלא קיימים בקובץ תמונה המקורי')
    expect(topic?.answer[0]).toContain('ההמרה של Imudist ל-CMYK פשוטה וללא פרופיל צבע')
    expect(topic?.answer[0]).toContain('טקסט פשוט מתאים נכתב כטקסט אמיתי')
  })

  it('finds instructions for duplicating a shape with Ctrl+D', () => {
    const topic = search('שכפול צורה על ידי קוטרול D')[0]
    expect(topic?.id).toBe('duplicate-shape-repeat')
    expect(topic?.answer[0]).toContain('העותק הראשון ייווצר בדיוק מעל המקור')
    expect(topic?.answer[0]).toContain('גררו את העותק למיקום הרצוי')
    expect(topic?.answer[0]).toContain('Ctrl+F')
  })

  it('matches Hebrew spellings of PDF to PDF topics', () => {
    expect(normalizeHelpQuery('פידיאף')).toBe('pdf')
    expect(normalizeHelpQuery('פי די אף')).toBe('pdf')
    expect(search('פידיאף').map((topic) => topic.id)).toContain('export-pdf')
    expect(search('פי-די-אף').map((topic) => topic.id)).toContain('export-pdf')
  })

  it('guides questions about File-menu exports to PDF and page-image instructions', () => {
    const fileMenuQueries = ['ייצוא PDF מלשונית קובץ', 'ייצוא תמונה מתפריט קובץ', 'פידיאף מתוך קובץ']
    for (const query of fileMenuQueries) {
      expect(search(query)[0]?.id, query).toBe('file-export')
      expect(search(query).every((topic) => topic.id === 'file-export' || topic.id === 'export-pdf' || topic.id.startsWith('pdf-') || topic.id === 'export-png' || topic.id === 'png-current-page')).toBe(true)
    }

    const fileExport = HELP_TOPICS.find((topic) => topic.id === 'file-export')?.answer[0] ?? ''
    for (const step of ['„קובץ”', '„ייצוא ל-PDF…”', '„ייצוא ל-PNG…”', 'העמוד שמוצג כעת', '„ייצא בחירה ל־PNG”']) {
      expect(fileExport).toContain(step)
    }
  })

  it('guides users from the File menu to opening a book and adding chapters', () => {
    const topic = search('פתיחת ספר').find((result) => result.id === 'book-open')
    expect(topic).toBeDefined()

    const answer = topic?.answer[0] ?? ''
    const steps = [
      '„קובץ” > „פתח ספר…”',
      'קובצי ספר',
      'חלונית „ספר”',
      '„הוסף פרקים…”',
      'קובצי Imudist',
      '„פתח” (Open)',
    ]
    const positions = steps.map((step) => answer.indexOf(step))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    expect(search('יצירת ספר חדש')[0]?.id).toBe('book-create')
  })

  it('makes page and master-page guidance discoverable by task', () => {
    const facingPageReset = search('איך מבטלים דף כפול וחוזרים לעמודים רצים בלוח העמודים')[0]
    expect(facingPageReset?.id).toBe('facing-pages')
    expect(facingPageReset?.answer[0]).toContain('כבו את המתג „דף כפול”')
    expect(facingPageReset?.answer[0]).toContain('סמל „עמוד אחד בכל שורה”')
    expect(facingPageReset?.answer[0]).toContain('אינו מכבה את מתג „דף כפול”')

    const searchableTopics: [string, string][] = [
      ['לוח עמודים', 'pages-panel'],
      ['בחירת טווח עמודים', 'pages-select-reorder'],
      ['הוספת עמודים', 'pages-add-delete'],
      ['זוגות עמודים', 'pages-view-mode'],
      ['שינוי גודל עמוד', 'page-tool'],
      ['מהו עמוד אב', 'page-masters'],
      ['עמוד אב חדש', 'page-master-create-edit'],
      ['להחיל עמוד אב', 'page-master-assign'],
      ['מאסטר כברירת מחדל', 'page-master-default'],
      ['לשנות אובייקט מאסטר בעמוד אחד', 'page-master-exceptions'],
      ['למחוק עמוד אב', 'page-master-delete'],
      ['מספר עמוד אוטומטי', 'page-number-marker'],
      ['מקטע מספור', 'page-number-sections'],
      ['לעבור לעמוד הבא', 'pages-navigation'],
      ['Delete למחוק עמוד', 'pages-delete-shortcut'],
      ['להוסיף כמה עמודים', 'pages-add-methods'],
      ['שינוי סדר עמודים תוכן', 'pages-reorder-preservation'],
      ['רק עמוד אחד בגודל אחר', 'page-size-single'],
      ['לשנות גודל כל העמודים', 'page-size-all'],
      ['שוליים בעמוד מסוים', 'page-margins-single'],
      ['להגדיל מספר עמודים', 'page-settings-count'],
      ['מספור מתחיל מ', 'page-settings-start'],
      ['תיבות טקסט אוטומטיות בעמודים', 'page-text-frames'],
      ['מספר עמודים בשורה הגדרות', 'page-layout-settings'],
      ['עמוד אב ימין שמאל', 'page-master-spread'],
      ['איך יוצאים מעריכת עמוד אב', 'page-master-edit-return'],
      ['בחירת מאסטר בהוספת עמוד', 'page-master-add-with-choice'],
      ['לחיצה כפולה על עמוד אב', 'page-master-select-edit'],
      ['עמוד ללא אב', 'page-master-no-parent'],
      ['נתק מעמוד אב', 'page-master-detach'],
      ['לוגו בכל עמוד', 'page-master-items'],
      ['אובייקטי אב מעל תוכן העמוד', 'page-master-order'],
      ['להחזיר אובייקט לעמוד אב', 'page-master-exception-restore'],
      ['מספר פנימי', 'page-number-types'],
      ['כותרת משתנה', 'page-running-header'],
      ['לערוך מקטע מספור', 'page-section-edit-delete'],
      ['לבטל מחיקת עמוד', 'pages-undo'],
      ['מספר עמוד בצד החיצוני', 'page-number-facing-outer'],
      ['עמוד 5 מתוך 20', 'page-number-text-around'],
      ['מספור באותיות עבריות לפתיח', 'page-number-hebrew-roman'],
      ['בלי מספר בעמוד הראשון', 'page-number-skip-first'],
      ['כל העמודים מציגים 1', 'page-number-troubleshooting'],
      ['ראשון בעמוד אחרון בעמוד', 'page-running-first-last'],
      ['שתי כותרות משתנות', 'page-running-header-frames'],
      ['כותרת משתנה ריקה', 'page-running-troubleshooting'],
    ]
    for (const [query, id] of searchableTopics) {
      expect(search(query).some((topic) => topic.id === id), query).toBe(true)
    }

    const topicIds = new Set(HELP_TOPICS.map((topic) => topic.id))
    for (const id of searchableTopics.map(([, id]) => id)) {
      const topic = HELP_TOPICS.find((item) => item.id === id)
      expect(topic?.answer[0], id).toContain('„')
      for (const related of topic?.related ?? []) expect(topicIds.has(related), `${id} -> ${related}`).toBe(true)
    }

    const masterEdit = HELP_TOPICS.find((topic) => topic.id === 'page-master-create-edit')?.answer[0] ?? ''
    expect(masterEdit).toContain('„חלון” > „לוח עמודים”')
    expect(masterEdit).toContain('„עמוד אב חדש”')
    expect(masterEdit).toContain('„חזרה למסמך”')

    const autoNumber = HELP_TOPICS.find((topic) => topic.id === 'page-number-marker')?.answer[0] ?? ''
    expect(autoNumber).toContain('„טיפוגרפיה”')
    expect(autoNumber).toContain('„מספר מסמך”')

    const pageTopicIds = new Set(HELP_TOPICS.filter((topic) => topic.id.startsWith('page') || topic.id.startsWith('pages')).map((topic) => topic.id))
    for (const topic of HELP_TOPICS.filter((item) => pageTopicIds.has(item.id))) {
      for (const related of topic.related) expect(topicIds.has(related), `${topic.id} -> ${related}`).toBe(true)
    }

    const runningHeader = HELP_TOPICS.find((topic) => topic.id === 'page-running-header')?.answer[0] ?? ''
    for (const step of ['סגנון פסקה', '„חלון” > „לוח עמודים”', '„הוספת כותרת משתנה…”', '„הוסף כותרת”', '„חזרה למסמך”']) {
      expect(runningHeader).toContain(step)
    }
    // dozens of searches over every topic: well over the 5 s default on a loaded machine
  }, 30000)

  it('makes the complete book workflow discoverable by its main tasks', () => {
    const searchableTopics: [string, string][] = [
      ['מה זה ספר', 'book-purpose'],
      ['הכנת ספר', 'book-preparation'],
      ['שם הספר', 'book-name'],
      ['להוסיף פרק', 'book-add-chapters'],
      ['סדר פרקים', 'book-manage-chapters'],
      ['מספור בספר', 'book-pagination'],
      ['עדכן מספור', 'book-numbering'],
      ['סנכרון סגנונות', 'book-style-sync'],
      ['בדוק ספר', 'book-preflight'],
      ['ייצוא הספר ל-PDF', 'book-export'],
      ['תהליך עבודה ספר', 'book-workflow'],
      ['הקובץ לא נמצא ספר', 'book-troubleshooting'],
    ]
    for (const [query, id] of searchableTopics) {
      expect(search(query).some((topic) => topic.id === id), query).toBe(true)
    }

    const createAnswer = HELP_TOPICS.find((topic) => topic.id === 'book-create')?.answer[0] ?? ''
    for (const step of ['„קובץ” > „חדש” > „ספר…”', 'חלון שמירה', '„שמירה”', '„הוסף פרקים…”', 'בגרירה או בחצים ▲ ▼', '„קובץ” > „פתח ספר…”']) {
      expect(createAnswer).toContain(step)
    }
    expect(createAnswer).not.toContain('דפדפן')
    expect(createAnswer).not.toContain('Chrome')
    expect(createAnswer).not.toContain('Edge')

    const exportAnswer = HELP_TOPICS.find((topic) => topic.id === 'book-export')?.answer[0] ?? ''
    for (const detail of ['150 DPI', '300 DPI', '600 DPI', 'RGB', 'CMYK', 'ייצוא וקטורי', 'שינויים שלא נשמרו']) {
      expect(exportAnswer).toContain(detail)
    }
  })

  it('gives explicit entry paths for document settings and image background removal', () => {
    const orientation = search('כיוון עמוד').find((result) => result.id === 'document-orientation')
    expect(orientation?.answer[0]).toContain('„קובץ” > „הגדרות מסמך…” > „גודל”')

    const background = search('הסרת רקע מתמונה').find((result) => result.id === 'image-background-removal')
    expect(background?.answer[0]).toContain('„אובייקט” > „הסר רקע מהתמונה הנבחרת”')
    expect(background?.answer[0]).toContain('„חלון” > „מאפיינים”')
  })

  it('provides exact Properties-panel navigation for each object-control topic', () => {
    const topics = HELP_TOPICS.filter((topic) => topic.id.startsWith('properties-'))
    expect(topics.length).toBeGreaterThan(20)
    expect(topics.every((topic) => topic.answer[0]?.includes('„חלון” > „מאפיינים”'))).toBe(true)

    const searchableTopics: [string, string][] = [
      ['גופן במאפיינים', 'properties-text-font'],
      ['קו מתאר לאותיות', 'properties-text-color'],
      ['מרווח שורות מאפיינים', 'properties-text-spacing'],
      ['שרשור תיבות טקסט', 'properties-text-thread'],
      ['צל לתמונה מאפיינים', 'properties-shadow'],
      ['עטיפת טקסט תמונה', 'properties-image-wrap'],
      ['רזולוציית תמונה מאפיינים', 'properties-image-file'],
      ['מספר פינות מצולע', 'properties-shape-corners'],
      ['קו מקווקו', 'properties-line'],
      ['תמונה בתוך צורה', 'properties-shape-image'],
      ['צבע קו עזר', 'properties-guide'],
      ['מאפייני טבלה', 'properties-table'],
    ]
    for (const [query, id] of searchableTopics) {
      expect(search(query).some((topic) => topic.id === id), query).toBe(true)
    }
  })

  it('makes the table guide discoverable across creation, editing, formatting, and limits', () => {
    const searchableTopics: [string, string][] = [
      ['מהי טבלה', 'table-basics'],
      ['הוספת טבלה', 'table-create'],
      ['בחירת טווח תאים', 'table-select'],
      ['Shift Tab טבלה', 'table-navigation'],
      ['הוספת שורה לטבלה', 'table-structure'],
      ['מיזוג תאים', 'table-merge'],
      ['רוחב עמודה טבלה', 'table-resize'],
      ['אפשרויות טבלה', 'table-options'],
      ['אפשרויות תא', 'table-cell-options'],
      ['עיצוב טבלה בסרגל', 'table-formatting'],
      ['רקע הטבלה', 'table-background'],
      ['מחיקת טבלה', 'table-edit-undo'],
      ['מגבלות טבלה', 'table-limits'],
      ['טיפים לטבלה', 'table-tips'],
      ['רוחב טבלה מאפיינים', 'properties-table'],
    ]
    for (const [query, id] of searchableTopics) {
      expect(search(query).some((topic) => topic.id === id), query).toBe(true)
    }

    const answerFor = (id: string) => HELP_TOPICS.find((topic) => topic.id === id)?.answer[0] ?? ''
    expect(answerFor('table-create')).toContain('Ctrl+Alt+Shift+T')
    expect(answerFor('table-navigation')).toContain('Tab בתא האחרון מוסיפה שורה חדשה')
    expect(answerFor('table-options')).toContain('התווית „שורות גוף זוגיות” צובעת את השורה הראשונה')
    expect(answerFor('table-cell-options')).toContain('ערך שלא הוגדר לתא חוזר לעקוב')
    expect(answerFor('table-limits')).toContain('גם כאשר מופעל ייצוא וקטורי')
    expect(answerFor('table-limits')).toContain('אין כרגע ייבוא טבלה מ-Word או מ-Excel')
  })

  it('makes linked-image guidance discoverable across the Links panel actions', () => {
    const searchableTopics: [string, string][] = [
      ['לוח קישורים', 'links-panel'],
      ['תמונה מקושרת השתנתה בדיסק', 'links-status'],
      ['לבחור כמה תמונות מקושרות', 'links-select'],
      ['לעדכן תמונה מקושרת', 'links-update'],
      ['קובץ תמונה עבר תיקייה קשר מחדש', 'links-relink'],
      ['הצג תמונה בעמוד', 'links-show'],
      ['הצג בתיקייה קובץ תמונה', 'links-folder'],
      ['להטמיע תמונה מקושרת', 'links-embed'],
      ['ההבדל תמונה מקושרת מוטמעת', 'links-linked-vs-embedded'],
    ]

    for (const [query, id] of searchableTopics) {
      expect(search(query).some((topic) => topic.id === id), query).toBe(true)
    }

    const topicIds = new Set(HELP_TOPICS.map((topic) => topic.id))
    for (const id of searchableTopics.map(([, topicId]) => topicId)) {
      const topic = HELP_TOPICS.find((item) => item.id === id)
      if (!topic) throw new Error(`Missing help topic: ${id}`)
      expect(getHelpTopicCategory(topic)).toBe('קישורים')
      for (const related of topic.related) expect(topicIds.has(related), `${id} -> ${related}`).toBe(true)
    }

    const update = HELP_TOPICS.find((topic) => topic.id === 'links-update')?.answer[0] ?? ''
    expect(update).toContain('„חלון” > „קישורים”')
    expect(update).toContain('„עדכן הכל”')
    expect(update).toContain('„קשר מחדש…”')

    const embed = HELP_TOPICS.find((topic) => topic.id === 'links-embed')?.answer[0] ?? ''
    expect(embed).toContain('מסירה את התלות בנתיב החיצוני')
    expect(embed).toContain('הקובץ עשוי לגדול')
  })

  it('makes color, gradient, and swatches help discoverable by task', () => {
    const searchableTopics: [string, string][] = [
      ['לוח צבע איך פותחים', 'color-panel'],
      ['צבע מילוי או קו', 'color-target'],
      ['CMYK RGB LAB ערך HEX', 'color-models'],
      ['שקיפות צבע צורה', 'color-tint-opacity'],
      ['ספריית צבע חיפוש פסטל', 'color-presets'],
      ['דגום צבע מהעמוד מברשת', 'color-sampler'],
      ['לוח דוגמיות לפתוח', 'swatches-panel'],
      ['ספריית מעברים צבעים מוכנים', 'swatches-library'],
      ['הוסף את הצבע הנוכחי דוגמית', 'swatches-custom'],
      ['דגימות שנדגמו מסמך', 'swatches-sampled'],
      ['למחוק דגימת צבע', 'swatches-delete-sample'],
      ['לוח מעבר צבע להחיל גרדיאנט', 'gradient-panel'],
      ['מעבר צבע קווי מעגלי זווית', 'gradient-type'],
      ['עצירות צבע להוסיף למחוק', 'gradient-stops'],
      ['ספריית מעברים מוכנים', 'gradient-library'],
      ['מעבר צבע בטקסט', 'gradient-limits'],
    ]

    for (const [query, id] of searchableTopics) {
      expect(search(query).some((topic) => topic.id === id), query).toBe(true)
    }

    const topicIds = new Set(HELP_TOPICS.map((topic) => topic.id))
    for (const id of searchableTopics.map(([, topicId]) => topicId)) {
      const topic = HELP_TOPICS.find((item) => item.id === id)
      if (!topic) throw new Error(`Missing help topic: ${id}`)
      const expectedCategory = id.startsWith('color-') ? 'צבע' : id.startsWith('gradient-') ? 'מעבר צבע' : 'דוגמיות'
      expect(getHelpTopicCategory(topic)).toBe(expectedCategory)
      for (const related of topic.related) expect(topicIds.has(related), `${id} -> ${related}`).toBe(true)
    }

    const sampler = HELP_TOPICS.find((topic) => topic.id === 'color-sampler')?.answer[0] ?? ''
    for (const step of ['„דגום צבע”', 'ולחצו כדי לדגום', 'הצבע נכנס למצב מברשת', 'לחצו „סיום”']) {
      expect(sampler).toContain(step)
    }

    const swatches = HELP_TOPICS.find((topic) => topic.id === 'swatches-custom')?.answer[0] ?? ''
    expect(swatches).toContain('אינה נשמרת בקובץ המסמך')
    expect(swatches).toContain('„דגימות שנדגמו”')
  })

  it('makes Layers-tab guidance discoverable without confusing it with object stacking', () => {
    const searchableTopics: [string, string][] = [
      ['לשונית שכבות', 'layers-panel'],
      ['להוסיף שכבה חדשה', 'layers-add-active'],
      ['לראות אובייקטים בשכבה', 'layers-expand-collapse'],
      ['לבחור אובייקט מלוח שכבות', 'layers-find-select'],
      ['להסתיר אובייקט בשכבות', 'layers-item-visibility-lock'],
      ['להסתיר שכבה', 'layers-visibility-lock'],
      ['לשנות שם שכבה', 'layers-item-name'],
      ['למחוק שכבה', 'layers-delete'],
    ]

    for (const [query, id] of searchableTopics) {
      expect(search(query).some((topic) => topic.id === id), query).toBe(true)
    }
    expect(search('לשונית שכבות').every((topic) => topic.id.startsWith('layers-'))).toBe(true)
    expect(search('לוח שכבות').every((topic) => topic.id.startsWith('layers-'))).toBe(true)

    const topicIds = new Set(HELP_TOPICS.map((topic) => topic.id))
    for (const id of searchableTopics.map(([, topicId]) => topicId)) {
      const topic = HELP_TOPICS.find((item) => item.id === id)
      if (!topic) throw new Error(`Missing help topic: ${id}`)
      expect(getHelpTopicCategory(topic)).toBe('לשונית שכבות')
      for (const related of topic.related) expect(topicIds.has(related), `${id} -> ${related}`).toBe(true)
    }

    const panel = HELP_TOPICS.find((topic) => topic.id === 'layers-panel')?.answer[0] ?? ''
    expect(panel).toContain('„חלון” > „שכבות”')
    expect(panel).toContain('אינה קבוצת פקודות „לחזית” או „לרקע”')

    const layerControls = HELP_TOPICS.find((topic) => topic.id === 'layers-visibility-lock')?.answer[0] ?? ''
    // the eye and the lock of a layer row work for every layer, are saved and keep the layer out of the export
    expect(layerControls).toContain('מסתירה את כל אובייקטי השכבה')
    expect(layerControls).toContain('אינם נכללים בייצוא')
    expect(layerControls).toContain('נשמרות בקובץ המסמך')
    expect(layerControls).toContain('וגררו לאורך אותו סוג סמל בשורות שכבות אחרות')
    expect(layerControls).toContain('פריטים בתוך שכבה')

    const itemControls = HELP_TOPICS.find((topic) => topic.id === 'layers-item-visibility-lock')?.answer[0] ?? ''
    expect(search('לנעול כמה אובייקטים בשכבה')[0]?.id).toBe('layers-item-visibility-lock')
    expect(itemControls).toContain('וגררו לאורך אותה עמודה ברשימה')
    expect(itemControls).toContain('מנעול פתוח מוצג באפור ומנעול סגור בכתום')

    const rename = HELP_TOPICS.find((topic) => topic.id === 'layers-item-name')?.answer[0] ?? ''
    expect(rename).toContain('„אפשרויות שכבה”')
    expect(rename).toContain('נשמרים בקובץ המסמך')
  })

  it('uses matching words even when other query words are not in a topic', () => {
    const results = search('PDF בעברית')
    expect(results[0]?.id === 'export-pdf' || results[0]?.id.startsWith('pdf-')).toBe(true)
  })

  it('searches answer text as well as titles and keywords', () => {
    expect(search('אלפיות')[0]?.id).toBe('character-style-spacing')
  })

  it('gives ordered steps for editing character-style settings', () => {
    const topic = search('גודל סגנון תו').find((result) => result.id === 'character-style-font')
    expect(topic).toBeDefined()

    const answer = topic?.answer[0] ?? ''
    const steps = [
      '„חלון” > „סגנונות תו”',
      'לחצו פעמיים על הסגנון',
      '„אפשרויות סגנון תו”',
      '„גודל”',
      '„אישור”',
    ]
    const positions = steps.map((step) => answer.indexOf(step))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('finds paragraph panel and spacing guidance from natural questions', () => {
    expect(search('איך פותחים חלונית פסקה')[0]?.id).toBe('paragraph-panel')
    expect(search('רווח לפני פסקה')[0]?.id).toBe('paragraph-spacing')
    expect(search('מרווח בין שורות')[0]?.id).toBe('paragraph-leading')
  })

  it('finds paragraph flow and style guidance', () => {
    expect(search('שורה בודדת בתחילת הפסקה')[0]?.id).toBe('paragraph-keep-lines')
    expect(search('לשמור כותרת עם הפסקה הבאה')[0]?.id).toBe('paragraph-keep-next')
    expect(search('סגנון הבא אחרי Enter')[0]?.id).toBe('paragraph-style-next')

    const nextStyle = search('סגנון הבא אחרי Enter')[0]
    const answer = nextStyle?.answer[0] ?? ''
    const steps = [
      '„חלון” > „סגנונות פסקה”',
      'לחצו פעמיים על סגנון הפסקה',
      '„אפשרויות סגנון פסקה”',
      'רשימת הקטגוריות נמצאת בצד ימין',
      'לחצו על „כללי”',
      '„סגנון הבא”',
    ]
    const positions = steps.map((step) => answer.indexOf(step))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('finds paragraph lists, nested styles, and import guidance', () => {
    expect(search('להוסיף תבליטים לפסקה')[0]?.id).toBe('paragraph-style-lists')
    expect(search('לעצב מילים ראשונות בפסקה')[0]?.id).toBe('paragraph-nested-styles')
    expect(search('ייבוא סגנונות פסקה')[0]?.id).toBe('paragraph-style-import')
    expect(search('למחוק סגנון פסקה')[0]?.id).toBe('paragraph-style-delete')
    expect(search('מחיקת סגנון פיסקה')[0]?.id).toBe('paragraph-style-delete')
    expect(search('למחוק סגנון פיסקה')[0]?.id).toBe('paragraph-style-delete')
    expect(search('מחיקת סגנון תו שנבחר')[0]?.id).toBe('character-style-delete')
  })
})
