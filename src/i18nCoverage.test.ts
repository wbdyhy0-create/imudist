import { describe, expect, it } from 'vitest'
import { ar } from './locales/ar'
import { en } from './locales/en'

/**
 * The dialogs and panels that are translated: every text they pass to t(...) has an English one. (A text added to one of them without its
 * English would show up as Hebrew in the English interface; this says so before anyone sees it.)
 */
const TRANSLATED = [
  'DocumentSetupDialog',
  'ExportPdfDialog',
  'PrintMarksFields',
  'TableOptionsDialog',
  'InsertTableDialog',
  'CellOptionsDialog',
  'TableSortDialog',
  'TableFormulaDialog',
  'Home',
  'NewDocumentDialog',
  'ContextToolbar',
  'Toolbox',
  'PropertiesPanel',
  'ParagraphPanel',
  'PageToolBar',
  'MultiSelectionToolbar',
  'ShapeProperties',
  'ImageProperties',
  'LineToolbarControls',
  'PagesPanel',
  'MultiSelectionPanel',
  'StatusBar',
  'DocTabs',
  'HelpAssistant',
  'TextFrameView',
  'ImageFrameView',
  'ShapeFrameView',
  'PreflightPanel',
  'GuidedToolTour',
  'MinimumFontNotice',
  'ArrangeButtons',
  'DockingPanels',
  'Workspace',
  'App',
]

const sources = import.meta.glob(['./components/*.tsx', './App.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const hebrew = /[֐-׿]/

describe('the translated dialogs', () => {
  for (const name of TRANSLATED) {
    it(`${name}: every text it translates has an English one`, () => {
      const source = sources[`./components/${name}.tsx`] ?? sources[`./${name}.tsx`]
      expect(source).toBeDefined()
      const used = [...source.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)].map((match) => match[1].replace(/\\'/g, "'"))
      expect(used.length).toBeGreaterThan(0)
      const missing = used.filter((text) => hebrew.test(text) && en[text] === undefined)
      expect(missing).toEqual([])
    })
  }
})

describe('the translation tables', () => {
  const holes = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
  for (const [name, table] of [['en', en], ['ar', ar]] as const) {
    it(`${name}: every translation keeps the placeholders of its Hebrew text`, () => {
      const broken = Object.entries(table).filter(([text, translated]) => holes(text).join() !== holes(translated).join()).map(([text]) => text)
      expect(broken).toEqual([])
    })
  }
})
