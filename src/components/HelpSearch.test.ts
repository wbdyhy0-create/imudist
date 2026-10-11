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
    expect(categoryFor('guides-create')).toBe('קווי עזר')
    expect(categoryFor('typography-menu')).toBe('טיפוגרפיה')
    expect(categoryFor('path-text-create')).toBe('טיפוגרפיה')
    expect(categoryFor('style-sampler-use')).toBe('טיפוגרפיה')
    expect(categoryFor('shape-tools')).toBe('כלי צורה')
    expect(categoryFor('tool-overview')).toBe('כלים')
    expect(categoryFor('object-shape-building')).toBe('אובייקט')
    expect(categoryFor('object-grouping')).toBe('אובייקט')
    expect(categoryFor('object-multi-select')).toBe('אובייקט')
    expect(categoryFor('file-export')).toBe('תפריט קובץ')
    expect(categoryFor('export-pdf')).toBe('קובץ · PDF')
    expect(categoryFor('pdf-page-range')).toBe('קובץ · PDF')
    expect(categoryFor('export-png')).toBe('קובץ · PNG')
    expect(categoryFor('png-current-page')).toBe('קובץ · PNG')
    expect(categoryFor('png-selection')).toBe('PNG · בחירת אובייקטים')
    expect(categoryFor('magnetic-lasso')).toBe('תמונות')
  })

  it('finds vector-related topics from a single Hebrew word', () => {
    expect(search('וקטורי')[0]?.id).toBe('pdf-vector')
    expect(search('וקטו')[0]?.id).toBe('pdf-vector')
    expect(search('וקטורי בלבד')[0]?.id).toBe('pdf-vector')
  })

  it('finds dedicated help for object menu commands', () => {
    expect(search('בניית צורות איחוד חיסור חיתוך והחרגה')[0]?.id).toBe('object-shape-building')
    expect(search('קיבוץ אובייקטים בטל קיבוץ נתיב מורכב')[0]?.id).toBe('object-grouping')
    expect(search('בחירה והזזה של כמה אובייקטים יחד')[0]?.id).toBe('object-multi-select')
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
    for (const step of ['„קובץ”', '„ייצוא ל-PDF…”', '„ייצוא תמונה” > „PNG…”', 'העמוד שמוצג כעת', '„ייצא בחירה ל־PNG”']) {
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
      ['איך יוצרים קווי עזר בעמוד', 'guides-create'],
      ['חלוקה שווה או מרווח קבוע בקווי עזר', 'guides-layout'],
      ['קווי עזר בכל העמודים במסמך', 'guides-pages'],
      ['למחוק קווי עזר בעמוד הנוכחי', 'guides-clear'],
      ['להסתיר קווי עזר והאם הם יוצאים ל-PDF', 'guides-visibility'],
      ['להזיז וליישר קו עזר בעמודים', 'guides-move-delete'],
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

    const runningHeader = HELP_TOPICS.find((topic) => topic.id === 'page-running-header')?.answer.join(' ') ?? ''
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
    expect(background?.answer[0]).toContain('„הסר רקע” בסרגל הכלים העליון')
    expect(background?.answer[0]).toContain('„אובייקט” > „הסר רקע מהתמונה הנבחרת”')
    expect(background?.answer[0]).toContain('„חלון” > „מאפיינים”')
  })

  it('explains that Space moves a shape while it is being drawn', () => {
    const topic = search('להזיז צורה תוך כדי ציור').find((result) => result.id === 'shape-tools')
    expect(topic).toBeDefined()
    expect(topic?.answer.join(' ')).toContain('מקש הרווח')
  })

  it('explains the decorations of the footnote divider and how to import one', () => {
    const topic = search('ייבוא עיטור לקו הפרדה').find((result) => result.id === 'footnote-divider-ornaments')
    expect(topic).toBeDefined()
    const answer = topic?.answer.join(' ') ?? ''
    for (const detail of ['ייבוא עיטור מקובץ', 'SVG, PNG או JPG', 'עובי הקווים', 'PDF ול-PNG', 'גודל העיטור', 'גודל הגופן של הכותרת', 'מרווח בין הקווים או העיטורים לכותרת', 'מיושרים לאמצע האותיות']) expect(answer).toContain(detail)
    for (const removedPreset of ['קו דועך', 'סלסול', 'קו מנוקד', 'עיגול, כוכב, עלה']) expect(answer).not.toContain(removedPreset)
  })

  it('explains how to make a line thicker at one end or in the middle', () => {
    const topic = search('קו עבה בצד אחד ודק בצד השני').find((result) => result.id === 'line-width-profile')
    expect(topic).toBeDefined()
    const answer = topic?.answer.join(' ') ?? ''
    for (const detail of ['„עובי לאורך הקו”', 'עבה באמצע', 'בהתחלה, באמצע ובסוף', 'כצורה מלאה']) expect(answer).toContain(detail)
  })

  it('explains how to export vectors as an SVG file', () => {
    const topic = search('ייצוא וקטורים לקובץ').find((result) => result.id === 'export-svg')
    expect(topic).toBeDefined()
    const answer = topic?.answer.join(' ') ?? ''
    for (const detail of ['„קובץ” > „ייצוא תמונה” > „SVG…”', 'אם לא נבחר דבר', 'נתיבים', 'האותיות']) expect(answer).toContain(detail)
  })

  it('explains how to turn a picture of a logo into a vector shape', () => {
    const topic = search('המרת תמונה לווקטור').find((result) => result.id === 'image-trace')
    expect(topic).toBeDefined()
    const answer = topic?.answer.join(' ') ?? ''
    for (const detail of ['„אובייקט” > „המר תמונה לווקטור…”', 'סף בהירות', 'פישוט', 'שימור קווים דקים', 'חור', 'Ctrl+Z', 'בצבע אחד']) {
      expect(answer).toContain(detail)
    }
    // a logo that prints with broken letters leads here too
    expect(search('לוגו שבור בהדפסה').some((result) => result.id === 'image-trace')).toBe(true)
  })

  it('explains how to add and remove vector anchor points', () => {
    const topic = search('איך מוסיפים נקודת עיגון לווקטור').find((result) => result.id === 'shape-anchor-points')
    expect(topic).toBeDefined()
    const answer = topic?.answer.join(' ') ?? ''
    for (const detail of ['„עריכת נקודות” (A)', 'ידית אמצע הצלע', 'Delete או Backspace', 'Shift', 'Alt', 'Ctrl+Z']) {
      expect(answer).toContain(detail)
    }
    expect(search('למחוק נקודת עיגון מצורה').some((result) => result.id === 'shape-anchor-points')).toBe(true)
  })

  it('explains how to turn live text into vector outlines', () => {
    const topic = search('המרת טקסט לווקטור').find((result) => result.id === 'create-outlines')
    expect(topic).toBeDefined()
    const answer = topic?.answer.join(' ') ?? ''
    for (const detail of ['„אובייקט” > „המר טקסט לווקטור”', 'Ctrl+Shift+O', 'Ctrl+Z', 'TrueType', 'ניקוד', 'לחיצה כפולה על האות', 'באפור', 'Esc', 'עריכת נקודות', 'כל אות היא צורה בפני עצמה', '„אובייקט” > „שחרר נתיב מורכב”']) {
      expect(answer).toContain(detail)
    }
    expect(search('איך להפוך טקסט לוקטור').some((result) => result.id === 'create-outlines')).toBe(true)
    // the name other programs give it still finds it
    expect(search('יצירת קווי מתאר').some((result) => result.id === 'create-outlines')).toBe(true)
    expect(search('איך לבחור אות אחת ולגרור אותה').some((result) => result.id === 'create-outlines')).toBe(true)
  })

  it('explains how to use the magnetic lasso and its raster editing actions', () => {
    const topic = search('לאסו מגנטי').find((result) => result.id === 'magnetic-lasso')
    expect(topic).toBeDefined()
    const answer = topic?.answer.join(' ') ?? ''
    for (const detail of ['„כלי החיתוך”', 'נקודת עוגן', 'לסגור את הצורה', 'הרחבה (+)', 'צמצום (−)', 'הסמן העגול', 'דוחף את הגבול החוצה', 'מילוי', 'מחק אזור', 'מסיכה', 'Ctrl+Z', 'תמונת PNG', 'GIF']) {
      expect(answer).toContain(detail)
    }
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

  it('makes Find and Replace guidance discoverable and documents its actual behavior', () => {
    const searchableTopics: [string, string][] = [
      ['Ctrl+H חיפוש והחלפה', 'find-replace-open'],
      ['Enter חיפוש הבא', 'find-replace-navigation'],
      ['תווים מיוחדים חיפוש', 'find-replace-special-meaning'],
      ['חיפוש בבחירה בלבד כולל הערות שוליים', 'find-replace-scope'],
      ['החלפת כל המופעים במסמך', 'find-replace-actions'],
      ['$1 ביטוי רגולרי החלפה', 'find-replace-regex'],
      ['מה זה התאם רישיות', 'find-replace-case'],
      ['מה זה מילה שלמה בלבד', 'find-replace-whole-word'],
      ['מה זה ביטוי רגולרי', 'find-replace-regex-meaning'],
      ['מה לכתוב בחפש ובהחלף בביטוי רגולרי', 'find-replace-regex-examples'],
      ['מה זה GREP', 'find-replace-regex-meaning'],
      ['גרעפ', 'find-replace-regex-meaning'],
      ['מה זה תווים מיוחדים', 'find-replace-special-meaning'],
    ]
    for (const [query, id] of searchableTopics) {
      expect(search(query)[0]?.id, query).toBe(id)
    }

    const answerFor = (id: string) => HELP_TOPICS.find((topic) => topic.id === id)?.answer[0] ?? ''
    expect(answerFor('find-replace-open')).toContain('„עריכה” > „חיפוש והחלפה…”')
    expect(answerFor('find-replace-navigation')).toContain('ולאחר המופע האחרון הוא חוזר לראשון')
    expect(answerFor('find-replace-scope')).toContain('הטקסט שבתוך טבלאות אינו חלק מחיפוש זה')
    expect(answerFor('find-replace-actions')).toContain('התאמה שנמצאה בהערת שוליים אינה מוחלפת בכפתור זה')
    expect(answerFor('find-replace-regex')).toContain('$<שם>')
    expect(answerFor('find-replace-case')).toContain('בעברית אין אותיות גדולות וקטנות')
    expect(answerFor('find-replace-whole-word')).toContain('חיפוש „בית” ימצא „בית גדול”, אך לא „ביתי”')
    expect(answerFor('find-replace-regex-meaning')).toContain('התבנית ‎[א-ת]+')
    expect(answerFor('find-replace-regex-meaning')).toContain('תכונת החיפוש וההחלפה לפי תבניות נקראת בתוכנות פריסה GREP')
    expect(answerFor('find-replace-regex-examples')).toContain('„חפש” ‎([א-תךםןףץ]+) ([א-תךםןףץ]+), „החלף ב” ‎$2 $1')
    expect(answerFor('find-replace-special-meaning')).toContain('‎\\n מייצג ירידת פסקה')
  })

  it('makes typography, text-on-path, shape, and style-sampler help discoverable', () => {
    const searchableTopics: [string, string][] = [
      ['מה יש בתפריט טיפוגרפיה', 'typography-menu'],
      ['יצירת תיבת טקסט והקלדה', 'text-tool-create'],
      ['Shift+T לכתוב על משושה', 'path-text-create'],
      ['להזיז טקסט בתוך עיגול', 'path-text-position'],
      ['ציור עיגול אליפסה ומלבן', 'shape-tools'],
      ['לצייר משולש או משושה', 'shape-polygon'],
      ['להעתיק עיצוב עם דוגם סגנון', 'style-sampler-use'],
      ['עיצוב אוטומטי של מילה ראשונה', 'typography-first-word'],
      ['יצירת חלון בטקסט', 'typography-window-text'],
      ['מניעת יתומים אלמנות וכיווץ שורה', 'typography-smart-layout'],
      ['ניקוי רווחים כפולים ופסקאות ריקות', 'typography-clean-spacing'],
      ['הוספת הערת שוליים Ctrl+Alt+Shift+F', 'footnote-insert'],
      ['אפשרויות הערות שוליים להעביר לסוף המסמך', 'footnote-options'],
    ]
    for (const [query, id] of searchableTopics) {
      expect(search(query).some((topic) => topic.id === id), query).toBe(true)
    }

    const topicIds = new Set(HELP_TOPICS.map((topic) => topic.id))
    for (const [, id] of searchableTopics) {
      const topic = HELP_TOPICS.find((item) => item.id === id)
      expect(topic?.answer[0], id).toContain('„')
      for (const related of topic?.related ?? []) expect(topicIds.has(related), `${id} -> ${related}`).toBe(true)
      expect(getHelpTopicCategory(topic!)).toBe(id.startsWith('shape-') ? 'כלי צורה' : id.startsWith('footnote-') ? 'הערות שוליים' : 'טיפוגרפיה')
    }
    expect(search('לכתוב מסביב לעיגול')[0]?.id).toBe('path-text-create')
    expect(search('דוגם סגנון')[0]?.id).toBe('style-sampler-use')
    expect(search('משושה')[0]?.id).toBe('shape-polygon')
    const typographyMenu = HELP_TOPICS.find((topic) => topic.id === 'typography-menu')?.answer.join(' ') ?? ''
    expect(typographyMenu).not.toContain('גופן וגודל')
    expect(typographyMenu).toContain('גופן, גודל ושאר מאפייני הטקסט משנים בסרגל העיצוב')
  })

  it('explains every text command shown in the Typography menu screenshots', () => {
    const topic = (id: string) => {
      const found = HELP_TOPICS.find((item) => item.id === id)
      if (!found) throw new Error(`Missing help topic: ${id}`)
      return found.answer.join('\n')
    }

    expect(topic('typography-clean-spacing')).toContain('רווח אחד במקום רצף של רווחים')
    expect(topic('typography-first-word')).toContain('סגנון התו')
    expect(topic('typography-window-text')).toContain('השורה השנייה והשורות שאחריה')
    expect(topic('page-running-header')).toContain('אם הפקודה אפורה')
    expect(topic('footnote-insert')).toContain('הסימן יחליף את הטקסט המסומן')
    expect(topic('footnote-options')).toContain('בסוף המסמך')
    expect(topic('footnote-options')).toContain('מרווח אפס מצמיד אותו למילה')
    expect(topic('footnote-options')).toContain('ערך חיובי מעלה את המספר ושלילי מוריד אותו')
    expect(topic('footnote-converter')).toContain('סוגריים עגולים')
    expect(topic('page-number-types')).toContain('כרגע אין הבדל במספר או באות')
    expect(topic('typography-smart-layout')).toContain('ריווח האותיות')
    expect(topic('paragraph-style-import')).toContain('אינו מעתיק את הטקסט, העמודים או האובייקטים')

    expect(search('כותרת משתנה אפורה')[0]?.id).toBe('page-running-header')
    expect(search('ייבוא סגנונות פסקה ותו')[0]?.id).toBe('paragraph-style-import')
    expect(search('מרווח בין מספר הפניה למילה')[0]?.id).toBe('footnote-options')
    expect(search('להוריד מספר הפניה של הערת שוליים')[0]?.id).toBe('footnote-options')
    expect(getHelpTopicCategory(HELP_TOPICS.find((item) => item.id === 'footnote-options')!)).toBe('הערות שוליים')
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

  it('finds the footnote converter by what it does', () => {
    expect(search('המרת הערות בסוגריים להערות שוליים')[0]?.id).toBe('footnote-converter')
    expect(search('ממיר הערות שוליים')[0]?.id).toBe('footnote-converter')
    expect(search('הערות שבטקסט להערות שוליים ולהפך')[0]?.id).toBe('footnote-converter')
    expect(search('הערות שוליים להערות סיום')[0]?.id).toBe('footnote-converter')
    const answer = HELP_TOPICS.find((topic) => topic.id === 'footnote-converter')?.answer.join(' ') ?? ''
    for (const phrase of ['„טיפוגרפיה”', '„ממיר הערות שבטקסט להערות שוליים ולהפך…”', '„ממיר הערות שוליים להערות סיום ולהפך…”', 'ממיר נפרד „ממיר הערות שוליים להערות סיום ולהפך”', '„המר הערות שוליים להערות סיום”', '„המר הערות סיום להערות שוליים”', 'מיקום הצגת', '„המר הערות להערות שוליים”', '„המר הערות שוליים להערות פנימיות”', '„עצור פעולה”']) expect(answer).toContain(phrase)
    expect(answer).not.toContain('בלוחית הממיר אפשר לבחור גם „מיקום ההערות”')
  })
})
