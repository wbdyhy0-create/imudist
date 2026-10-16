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
  'DataMergeDialog',
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
  'ShortcutsDialog',
  'UpdateDialog',
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
  'MinimumFontHint',
  'ArrangeButtons',
  'DockingPanels',
  'Workspace',
  'FootnoteDialogs',
  'ParagraphStylesPanel',
  'CharacterStylesPanel',
  'ObjectStylesPanel',
  'StyleManagerPanel',
  'NestedStylesEditor',
  'StyleLayersEditor',
  'ParagraphSequenceDialog',
  'WindowTextDialog',
  'DesignLibraryDialog',
  'FootnoteConverterPanel',
  'BookPanel',
  'ColorToolsPanel',
  'BrushesPanel',
  'ImageTraceDialog',
  'SeparationPreviewDialog',
  'ExtrudeDialog',
  'FindReplacePanel',
  'CreateGuidesDialog',
  'LayersPanel',
  'SmartLayoutDialog',
  'LinksPanel',
  'ColorPickerDialog',
  'ColorLibrary',
  'TrialGate',
  'FeatherControls',
  'TocDialog',
  'StrokeSettingsDialog',
  'ImportOptionsDialog',
  'FirstWordStylerDialog',
  'FillPicker',
  'ImportPdfOptionsDialog',
  'ShapeToolDialog',
  'ShadowControls',
  'GuideProperties',
  'AlignButtons',
  'SaveWorkspaceDialog',
  'RunningHeaderDialog',
  'FontPicker',
  'LicensesDialog',
  'TableView',
  'RichEditor',
  'ErrorBoundary',
  'PathTextEditor',
  'GuideColors',
  'useDocumentSession',
  'useBook',
  'designs',
  'vectorText',
  'importEps',
  'importIdml',
  'importText',
  'brushImport',
  'backgroundRemoval',
  'extrude',
  'lineProfile',
  'preflight',
  'document',
  'fonts',
  'footnoteOrnaments',
  'styleLayers',
  'fileFormat',
  'tableFormulas',
  'shapes',
  'separations',
  'imageLinks',
  'importPsd',
  'importPdf',
  'importXml',
  'importImage',
  'book',
  'bookStorage',
  'svgBuild',
  'svgExport',
  'footnoteConvert',
  'findReplace',
  'pdfExport',
  'units',
  'vectorShapes',
  'tableSort',
  'nestedStyles',
  'brushes',
  'sharpness',
  'App',
]

const sources = import.meta.glob(['./components/*.tsx', './App.tsx', './*.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const hebrew = /[֐-׿]/

describe('the translated dialogs', () => {
  for (const name of TRANSLATED) {
    it(`${name}: every text it translates has an English one`, () => {
      const source = sources[`./components/${name}.tsx`] ?? sources[`./${name}.tsx`] ?? sources[`./${name}.ts`]
      expect(source).toBeDefined()
      const used = [...source.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)].map((match) => match[1].replace(/\\(['\\n])/g, (_, escaped: string) => (escaped === 'n' ? '\n' : escaped)))
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
