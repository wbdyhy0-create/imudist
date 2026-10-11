import { describe, expect, it } from 'vitest'
import { PAGE_NUMBER_MARKER } from './document'
import { pageRects } from './pages'
import { readIdmlFile, readIdmlWithNotes } from './importIdml'
import { buildZip, type ZipEntrySpec } from './testZip'

/** the geometry of a page item as the files a layout program saves have it: path points, `x y`, with the item's own transform */
const rectangle = (x0: number, y0: number, x1: number, y1: number, open = false) => `
      <Properties>
        <PathGeometry>
          <GeometryPathType PathOpen="${open}">
            <PathPointArray>
              <PathPointType Anchor="${x0} ${y0}" LeftDirection="${x0} ${y0}" RightDirection="${x0} ${y0}" />
              <PathPointType Anchor="${x0} ${y1}" LeftDirection="${x0} ${y1}" RightDirection="${x0} ${y1}" />
              <PathPointType Anchor="${x1} ${y1}" LeftDirection="${x1} ${y1}" RightDirection="${x1} ${y1}" />
              <PathPointType Anchor="${x1} ${y0}" LeftDirection="${x1} ${y0}" RightDirection="${x1} ${y0}" />
            </PathPointArray>
          </GeometryPathType>
        </PathGeometry>
      </Properties>`

const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const designMap = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Document xmlns:idPkg="urn:idml-packaging" DOMVersion="18.5" Self="d" StoryList="uStory1 uStory2">
  <Layer Self="uLayerText" Name="Text" Visible="true" Locked="false" />
  <Layer Self="uLayerArt" Name="Art" Visible="true" Locked="true" />
  <idPkg:MasterSpread src="MasterSpreads/MasterSpread_um.xml" />
  <idPkg:Spread src="Spreads/Spread_u1.xml" />
  <idPkg:Spread src="Spreads/Spread_u2.xml" />
</Document>`

const preferences = `<?xml version="1.0" encoding="UTF-8"?>
<idPkg:Preferences xmlns:idPkg="urn:idml">
  <DocumentPreference PageHeight="600" PageWidth="400" FacingPages="true" PageBinding="LeftToRight" DocumentBleedTopOffset="9" DocumentBleedBottomOffset="9" DocumentBleedInsideOrLeftOffset="9" DocumentBleedOutsideOrRightOffset="9" />
</idPkg:Preferences>`

const graphic = `<?xml version="1.0" encoding="UTF-8"?>
<idPkg:Graphic xmlns:idPkg="urn:idml">
  <Color Self="Color/Black" Name="Black" Model="Process" Space="CMYK" ColorValue="0 0 0 100" />
  <Color Self="Color/Paper" Name="Paper" Model="Process" Space="CMYK" ColorValue="0 0 0 0" />
  <Color Self="Color/Red" Name="Red" Model="Process" Space="CMYK" ColorValue="0 100 100 0" />
  <Color Self="Color/Blue%20Sea" Name="Blue Sea" Model="Process" Space="RGB" ColorValue="0 0 255" />
  <Tint Self="Tint/Red50" Name="Red 50" BaseColor="Color/Red" TintValue="50" />
  <Gradient Self="Gradient/Fade" Name="Fade" Type="Linear">
    <GradientStop Self="Gradient/Fade/s1" StopColor="Color/Blue%20Sea" Location="0" />
    <GradientStop Self="Gradient/Fade/s2" StopColor="Color/Paper" Location="100" />
  </Gradient>
</idPkg:Graphic>`

const styles = `<?xml version="1.0" encoding="UTF-8"?>
<idPkg:Styles xmlns:idPkg="urn:idml">
  <RootParagraphStyleGroup Self="u9">
    <ParagraphStyle Self="ParagraphStyle/$ID/[No paragraph style]" Name="$ID/[No paragraph style]" />
    <ParagraphStyle Self="ParagraphStyle/Body" Name="Body" PointSize="12" Justification="CenterAlign" LeftIndent="6" FillColor="Color/Black" FontStyle="Regular">
      <Properties>
        <Leading type="unit">15</Leading>
        <AppliedFont type="string">Frank Ruehl</AppliedFont>
      </Properties>
    </ParagraphStyle>
    <ParagraphStyleGroup Self="ParagraphStyleGroup/Titles" Name="Titles">
      <ParagraphStyle Self="ParagraphStyle/Titles%3aHeading" Name="Heading" PointSize="30" FontStyle="Bold" Justification="FullyJustified">
        <Properties>
          <Leading type="unit">36</Leading>
          <BasedOn type="object">ParagraphStyle/Body</BasedOn>
          <NextStyle type="object">ParagraphStyle/Body</NextStyle>
        </Properties>
      </ParagraphStyle>
    </ParagraphStyleGroup>
  </RootParagraphStyleGroup>
  <RootCharacterStyleGroup Self="u8">
    <CharacterStyle Self="CharacterStyle/$ID/[No character style]" Name="$ID/[No character style]" />
    <CharacterStyle Self="CharacterStyle/Strong" Name="Strong" FontStyle="Bold" FillColor="Color/Red" />
  </RootCharacterStyleGroup>
</idPkg:Styles>`

const masterSpread = `<?xml version="1.0" encoding="UTF-8"?>
<idPkg:MasterSpread xmlns:idPkg="urn:idml">
  <MasterSpread Self="uMaster" Name="A-Parent" ItemTransform="1 0 0 1 0 0">
    <Page Self="uMasterLeft" Name="A" GeometricBounds="0 0 600 400" ItemTransform="1 0 0 1 -400 -300" />
    <Page Self="uMasterRight" Name="A" GeometricBounds="0 0 600 400" ItemTransform="1 0 0 1 0 -300" />
    <TextFrame Self="uNumberLeft" ParentStory="uStoryNumber" PreviousTextFrame="n" NextTextFrame="n" ContentType="TextType" ItemLayer="uLayerText" ItemTransform="1 0 0 1 -200 270">${rectangle(-20, -10, 20, 10)}
    </TextFrame>
    <Rectangle Self="uRuleRight" ItemLayer="uLayerArt" FillColor="Color/Black" StrokeColor="Swatch/None" ItemTransform="1 0 0 1 200 -280">${rectangle(-150, -1, 150, 1)}
    </Rectangle>
  </MasterSpread>
</idPkg:MasterSpread>`

// a spread of two facing pages: the left page is at x -400…0 of the spread, the right one at 0…400
const spreadOne = `<?xml version="1.0" encoding="UTF-8"?>
<idPkg:Spread xmlns:idPkg="urn:idml">
  <Spread Self="uSpread1" ItemTransform="1 0 0 1 0 0" PageCount="2">
    <Page Self="uPage1" Name="1" GeometricBounds="0 0 600 400" ItemTransform="1 0 0 1 -400 -300" AppliedMaster="uMaster" />
    <Page Self="uPage2" Name="2" GeometricBounds="0 0 600 400" ItemTransform="1 0 0 1 0 -300" AppliedMaster="uMaster">
      <MarginPreference ColumnCount="2" ColumnGutter="10" Top="20" Bottom="30" Left="40" Right="50" />
    </Page>
    <TextFrame Self="uFrame1" ParentStory="uStory1" PreviousTextFrame="n" NextTextFrame="uFrame2" ContentType="TextType" ItemLayer="uLayerText" FillColor="Color/Paper" Name="Opening" ItemTransform="1 0 0 1 -200 -100">${rectangle(-150, -40, 150, 40)}
      <TextWrapPreference TextWrapMode="BoundingBoxTextWrap">
        <Properties>
          <TextWrapOffset Top="4" Left="4" Bottom="4" Right="4" />
        </Properties>
      </TextWrapPreference>
    </TextFrame>
    <Group Self="uGroup" ItemTransform="1 0 0 1 100 200">
      <Rectangle Self="uGrouped1" ItemLayer="uLayerArt" FillColor="Color/Red" StrokeColor="Color/Black" StrokeWeight="2" ItemTransform="1 0 0 1 10 10">${rectangle(0, 0, 40, 20)}
      </Rectangle>
      <Oval Self="uGrouped2" ItemLayer="uLayerArt" FillColor="Tint/Red50" StrokeColor="Swatch/None" ItemTransform="0 1 -1 0 50 60">${rectangle(-50, -25, 50, 25)}
      </Oval>
    </Group>
    <Rectangle Self="uPicture" ContentType="GraphicType" ItemLayer="uLayerArt" Visible="false" ItemTransform="1 0 0 1 100 -150">${rectangle(-60, -30, 60, 30)}
      <Image Self="uImage" ItemTransform="1 0 0 1 -60 -30">
        <Properties>
          <GraphicBounds Left="0" Top="0" Right="120" Bottom="60" />
        </Properties>
        <Link Self="uLink" LinkResourceURI="file:C:/Users/someone/Desktop/photo%201.png" />
      </Image>
    </Rectangle>
    <Rectangle Self="uEmbedded" ContentType="GraphicType" ItemLayer="uLayerArt" ItemTransform="1 0 0 1 -300 200">${rectangle(-20, -20, 20, 20)}
      <Image Self="uImageEmbedded" ItemTransform="1 0 0 1 0 0">
        <Properties>
          <Contents><![CDATA[${PNG_1X1}]]></Contents>
        </Properties>
        <Link Self="uLinkEmbedded" LinkResourceURI="file:embedded.png" />
      </Image>
    </Rectangle>
    <GraphicLine Self="uLine" ItemLayer="uLayerArt" StrokeColor="Color/Red" StrokeWeight="3" ItemTransform="1 0 0 1 150 100">
      <Properties>
        <PathGeometry>
          <GeometryPathType PathOpen="true">
            <PathPointArray>
              <PathPointType Anchor="-30 -10" LeftDirection="-30 -10" RightDirection="-30 -10" />
              <PathPointType Anchor="30 10" LeftDirection="30 10" RightDirection="30 10" />
            </PathPointArray>
          </GeometryPathType>
        </PathGeometry>
      </Properties>
    </GraphicLine>
    <Polygon Self="uBlob" ItemLayer="uLayerArt" FillColor="Gradient/Fade" StrokeColor="Swatch/None" ItemTransform="1 0 0 1 -250 -250">
      <Properties>
        <PathGeometry>
          <GeometryPathType PathOpen="false">
            <PathPointArray>
              <PathPointType Anchor="0 0" LeftDirection="0 0" RightDirection="20 -10" />
              <PathPointType Anchor="40 0" LeftDirection="20 -10" RightDirection="40 0" />
              <PathPointType Anchor="20 30" LeftDirection="20 30" RightDirection="20 30" />
            </PathPointArray>
          </GeometryPathType>
        </PathGeometry>
      </Properties>
    </Polygon>
  </Spread>
</idPkg:Spread>`

const spreadTwo = `<?xml version="1.0" encoding="UTF-8"?>
<idPkg:Spread xmlns:idPkg="urn:idml">
  <Spread Self="uSpread2" ItemTransform="1 0 0 1 0 700" PageCount="1">
    <Page Self="uPage3" Name="3" GeometricBounds="0 0 600 400" ItemTransform="1 0 0 1 0 -300" AppliedMaster="n" />
    <TextFrame Self="uFrame2" ParentStory="uStory1" PreviousTextFrame="uFrame1" NextTextFrame="n" ContentType="TextType" ItemLayer="uLayerText" ItemTransform="1 0 0 1 200 0">${rectangle(-100, -100, 100, 100)}
    </TextFrame>
    <TextFrame Self="uFrame3" ParentStory="uStory2" PreviousTextFrame="n" NextTextFrame="n" ContentType="TextType" ItemLayer="uLayerText" ItemTransform="1 0 0 1 200 250">${rectangle(-80, -20, 80, 20)}
    </TextFrame>
  </Spread>
</idPkg:Spread>`

// one story of three paragraphs the way the file writes them: a range of paragraphs of one style ends each with <Br/>, the markup is
// indented, and the properties of a range hold font names and numbers that are not text
const storyOne = `<?xml version="1.0" encoding="UTF-8"?>
<idPkg:Story xmlns:idPkg="urn:idml">
  <Story Self="uStory1" StoryTitle="$ID/">
    <StoryPreference OpticalMarginAlignment="false" />
    <ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/Titles%3aHeading" Justification="RightAlign">
      <Properties>
        <TabList type="list">
          <ListItem type="record">
            <Position type="unit">174</Position>
          </ListItem>
        </TabList>
      </Properties>
      <CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]">
        <Properties>
          <Leading type="unit">36</Leading>
          <AppliedFont type="string">Fb Pekan</AppliedFont>
        </Properties>
        <Content>Hello &amp; welcome</Content>
        <Br />
        <Content>Second line</Content>
        <Br />
      </CharacterStyleRange>
    </ParagraphStyleRange>
    <ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/Body">
      <CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]">
        <Content>Plain </Content>
      </CharacterStyleRange>
      <CharacterStyleRange AppliedCharacterStyle="CharacterStyle/Strong" PointSize="20">
        <HyperlinkTextSource Self="uHyper" Name="link">
          <Content>strong</Content>
        </HyperlinkTextSource>
        <Content>&#x2028;after</Content>
        <TextVariableInstance Self="uVar" ResultText="[Chapter]" />
        <Footnote Self="uNote">
          <ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/Body">
            <CharacterStyleRange><Content>The note</Content></CharacterStyleRange>
          </ParagraphStyleRange>
        </Footnote>
      </CharacterStyleRange>
    </ParagraphStyleRange>
  </Story>
</idPkg:Story>`

const storyTwo = `<?xml version="1.0" encoding="UTF-8"?>
<idPkg:Story xmlns:idPkg="urn:idml">
  <Story Self="uStory2">
    <ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/Body">
      <CharacterStyleRange>
        <Table Self="uTable" RowCount="2" ColumnCount="2">
          <Cell Self="uc1" Name="0:0"><ParagraphStyleRange><CharacterStyleRange><Content>A</Content></CharacterStyleRange></ParagraphStyleRange></Cell>
          <Cell Self="uc2" Name="1:0"><ParagraphStyleRange><CharacterStyleRange><Content>B</Content></CharacterStyleRange></ParagraphStyleRange></Cell>
          <Cell Self="uc3" Name="0:1"><ParagraphStyleRange><CharacterStyleRange><Content>C</Content></CharacterStyleRange></ParagraphStyleRange></Cell>
          <Cell Self="uc4" Name="1:1"><ParagraphStyleRange><CharacterStyleRange><Content>D</Content></CharacterStyleRange></ParagraphStyleRange></Cell>
        </Table>
      </CharacterStyleRange>
    </ParagraphStyleRange>
  </Story>
</idPkg:Story>`

const storyNumber = `<?xml version="1.0" encoding="UTF-8"?>
<idPkg:Story xmlns:idPkg="urn:idml">
  <Story Self="uStoryNumber">
    <ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/Body">
      <CharacterStyleRange><Content>Page </Content><?ACE 18?></CharacterStyleRange>
    </ParagraphStyleRange>
  </Story>
</idPkg:Story>`

const fixture = (): ZipEntrySpec[] => [
  { name: 'mimetype', data: 'application/vnd.idml-package' },
  { name: 'designmap.xml', data: designMap },
  { name: 'Resources/Preferences.xml', data: preferences },
  { name: 'Resources/Graphic.xml', data: graphic },
  { name: 'Resources/Styles.xml', data: styles },
  { name: 'MasterSpreads/MasterSpread_um.xml', data: masterSpread },
  { name: 'Spreads/Spread_u1.xml', data: spreadOne },
  { name: 'Spreads/Spread_u2.xml', data: spreadTwo },
  { name: 'Stories/Story_uStory1.xml', data: storyOne },
  { name: 'Stories/Story_uStory2.xml', data: storyTwo },
  { name: 'Stories/Story_uStoryNumber.xml', data: storyNumber },
]

const open = async (entries = fixture(), name = 'layout.idml') => readIdmlWithNotes(new File([await buildZip(entries)], name))

describe('the pages of an IDML file', () => {
  it('are read with their size, the binding, the margins and the bleed the file says', async () => {
    const { content } = await open()
    expect(content.doc).toMatchObject({ name: 'layout', pages: 3, width: 400, height: 600, facingPages: true, binding: 'ltr' })
    expect(content.doc.bleed).toMatchObject({ top: 9, bottom: 9, left: 9, right: 9 })
    expect(content.doc.pageSizes).toHaveLength(3)
    expect(content.doc.margins).toBeDefined()
  })

  it('take the margins, the columns and the gutter of the first page that has them, and give another page its own', async () => {
    const { content } = await open()
    // only the second page names margins (and two columns): they are the document's
    expect(content.doc.margins).toEqual({ top: 20, bottom: 30, left: 40, right: 50 })
    expect(content.doc.columns).toBe(2)
    expect(content.doc.gutter).toBe(10)
    expect(content.doc.pageMargins).toEqual([])
    const other = fixture().map((entry) => (entry.name === 'Spreads/Spread_u2.xml' ? { ...entry, data: String(entry.data).replace('<Page Self="uPage3" Name="3" GeometricBounds="0 0 600 400" ItemTransform="1 0 0 1 0 -300" AppliedMaster="n" />', '<Page Self="uPage3" Name="3" GeometricBounds="0 0 600 400" ItemTransform="1 0 0 1 0 -300" AppliedMaster="n"><MarginPreference ColumnCount="1" ColumnGutter="12" Top="1" Bottom="2" Left="3" Right="4" /></Page>') } : entry))
    const second = (await open(other)).content
    expect(second.doc.pageMargins[2]).toEqual({ top: 1, bottom: 2, left: 3, right: 4 })
    expect(second.doc.pageMargins[0]).toBeNull()
  })
})

describe('the objects of an IDML file', () => {
  it('are where their paths put them: the box of the points, through the item transform', async () => {
    const { content } = await open()
    const opening = content.frames.find((frame) => frame.id === 'idml-object-uFrame1')!
    // the points are -150…150 and -40…40, the transform moves the item by (-200, -100) in the spread, and the page is at (-400, -300):
    // the frame is 50 points in and 160 down from the corner of the page it is on
    const page = pageRects(content.doc)[0]!
    // 80 high, and a little higher: the margin the layout keeps under the last line of a frame (0.15 of the 30 points) and the part of
    // the letters' boxes that reaches below a line of 36 points ((1.35 × 30 - 36) / 2)
    expect(opening).toMatchObject({ w: 300, h: 86.8 })
    expect(opening.x).toBeCloseTo(page.x + 50, 6)
    expect(opening.y).toBeCloseTo(page.y + 160, 6)
    expect(opening.label).toBe('Opening')
  })

  it('are not given a size the file does not say', async () => {
    const { content } = await open()
    expect(content.frames.filter((frame) => frame.w === 100 && frame.h === 100)).toHaveLength(0)
  })

  it('take the transform of the group they are in, and the group is kept', async () => {
    const { content } = await open()
    const first = content.shapes.find((shape) => shape.id === 'idml-object-uGrouped1')!
    const second = content.shapes.find((shape) => shape.id === 'idml-object-uGrouped2')!
    // group (100, 200) then item (10, 10): points 0…40, 0…20 -> x 110…150, y 210…230 in the spread; the page is at (0, -300)
    const page = pageRects(content.doc)[1]!
    expect(first).toMatchObject({ kind: 'rect', x: page.x + 110, y: page.y + 510, w: 40, h: 20, fill: '#ff0000', stroke: '#000000', strokeWidth: 2 })
    expect(first.groupId).toBeTruthy()
    expect(second.groupId).toBe(first.groupId)
    expect(first.layerId).toBe('idml-layer-uLayerArt')
  })

  it('keep the turn of an object as a rotation about its middle, with its size unturned', async () => {
    const { content } = await open()
    const oval = content.shapes.find((shape) => shape.id === 'idml-object-uGrouped2')!
    expect(oval.kind).toBe('ellipse')
    expect(oval.w).toBeCloseTo(100, 6)
    expect(oval.h).toBeCloseTo(50, 6)
    expect(oval.rotation).toBeCloseTo(90, 6)
    // the middle of the oval: item (50, 60) in the group (100, 200) -> (150, 260) in the spread, page at (0, -300)
    const page = pageRects(content.doc)[1]!
    expect(oval.x + oval.w / 2).toBeCloseTo(page.x + 150, 6)
    expect(oval.y + oval.h / 2).toBeCloseTo(page.y + 560, 6)
    expect(oval.fill).toBe('#ff8080')
    expect(oval.stroke).toBeNull()
  })

  it('have the colour of a tint, of a gradient (its first stop) and of a name with a space', async () => {
    const { content } = await open()
    expect(content.shapes.find((shape) => shape.id === 'idml-object-uBlob')?.fill).toBe('#0000ff')
    expect(content.colorSamples?.map((sample) => sample.label)).toContain('Blue Sea')
  })

  it('keep the curves of a polygon: points in the box of its path, handles relative to their point', async () => {
    const { content } = await open()
    const blob = content.shapes.find((shape) => shape.id === 'idml-object-uBlob')!
    expect(blob.kind).toBe('path')
    expect(blob.w).toBe(40)
    expect(blob.h).toBe(30)
    const ring = blob.geom![0]![0]!
    expect(ring).toHaveLength(3)
    const first = ring[0] as { p: [number, number]; ho: [number, number] }
    expect(first.p).toEqual([0, 0])
    // the handle (20, -10) from the point (0, 0) is half the width to the right and a third of the height up
    expect(first.ho[0]).toBeCloseTo(0.5, 6)
    expect(first.ho[1]).toBeCloseTo(-1 / 3, 6)
  })

  it('make a straight line of a line with two points', async () => {
    const { content } = await open()
    const line = content.shapes.find((shape) => shape.id === 'idml-object-uLine')!
    expect(line).toMatchObject({ kind: 'line', w: 60, h: 20, stroke: '#ff0000', strokeWidth: 3, fill: null })
  })

  it('have no fill that the file does not give them', async () => {
    const { content } = await open()
    const rule = content.parents[1]!.shapes[0]!
    expect(rule.stroke).toBeNull()
    expect(rule.fill).toBe('#000000')
  })

  it('keep a hidden object hidden and a locked layer locked', async () => {
    const { content } = await open()
    expect(content.shapes.find((shape) => shape.id === 'idml-object-uPicture')?.hidden).toBe(true)
    expect(content.layers?.['idml-layer-uLayerArt']).toMatchObject({ name: 'Art', locked: true })
    expect(content.layerOrder).toEqual(['idml-layer-uLayerText', 'idml-layer-uLayerArt'])
  })

  it('make a coloured text frame a rectangle behind its text', async () => {
    const { content } = await open()
    const background = content.shapes.find((shape) => shape.id === 'idml-object-uFrame1-background')!
    expect(background).toMatchObject({ kind: 'rect', fill: '#ffffff', w: 300, h: 80 })
    const frame = content.frames.find((candidate) => candidate.id === 'idml-object-uFrame1')!
    expect(background.z!).toBeLessThan(frame.z!)
  })
})

describe('the pictures of an IDML file', () => {
  it('stay in place as an empty picture frame when the file they are linked to is not in the package', async () => {
    const { content, notes } = await open()
    const frame = content.shapes.find((shape) => shape.id === 'idml-object-uPicture')!
    expect(frame).toMatchObject({ kind: 'rect', frame: true, w: 120, h: 60, label: 'photo 1.png' })
    expect(notes.join(' ')).toMatch(/מסגרות תמונה ריקות/)
  })

  it('are read from the package when they are embedded or in its Links folder', async () => {
    const { content } = await open()
    const embedded = content.images.find((image) => image.id === 'idml-object-uEmbedded')!
    expect(embedded).toMatchObject({ w: 40, h: 40, fit: 'fill' })
    expect(content.assets[embedded.assetId]).toMatchObject({ mime: 'image/png', width: 1, height: 1 })
    const png = Uint8Array.from(atob(PNG_1X1), (ch) => ch.charCodeAt(0))
    const linked = await open([...fixture(), { name: 'Links/photo 1.png', data: png }])
    expect(linked.content.images.map((image) => image.id)).toContain('idml-object-uPicture')
  })
})

describe('the text of an IDML file', () => {
  it('is what the Content elements say: no markup whitespace, no font names, a paragraph for each Br', async () => {
    const { content } = await open()
    const head = content.frames.find((frame) => frame.id === 'idml-object-uFrame1')!
    expect(head.text).toBe('Hello & welcome\nSecond line\nPlain strong\nafter[Chapter]')
    expect(head.paragraphStyleIds).toHaveLength(head.text.split('\n').length)
    expect(head.runs.reduce((sum, run) => sum + run.len, 0)).toBe(head.text.length)
  })

  it('has a paragraph style for each paragraph, and what a range of paragraphs sets for itself', async () => {
    const { content } = await open()
    const head = content.frames.find((frame) => frame.id === 'idml-object-uFrame1')!
    const heading = content.paragraphStyles.find((style) => style.name === 'Heading')!
    const body = content.paragraphStyles.find((style) => style.name === 'Body')!
    expect(head.paragraphStyleIds).toEqual([heading.id, heading.id, body.id, body.id])
    expect(head.paragraphStylePatches?.[0]).toMatchObject({ align: 'right' })
    // the settings of the style are on the paragraph too, as applying a style does
    expect(head.paragraphStylePatches?.[2]).toMatchObject({ leading: 15, indentLeft: 6, align: 'center' })
  })

  it('takes the style of a run from its paragraph style, then its character style, then what the range itself sets', async () => {
    const { content } = await open()
    const head = content.frames.find((frame) => frame.id === 'idml-object-uFrame1')!
    const strong = content.characterStyles!.find((style) => style.name === 'Strong')!
    // "Hello & welcome": the heading (30, bold) based on the body (font)
    expect(head.runs[0]!.style).toMatchObject({ fontFamily: 'Fb Pekan', fontSize: 30, weight: 700 })
    // "Plain ": the body: 12 points, regular
    const plain = head.runs.find((run) => run.style.fontSize === 12)!
    expect(plain.style).toMatchObject({ fontFamily: 'Frank Ruehl', weight: 400 })
    // "strong": the character style (bold, red), the range's own 20 points
    const emphasised = head.runs.find((run) => run.style.charStyleId === strong.id)!
    expect(emphasised.style).toMatchObject({ fontSize: 20, weight: 700, color: '#ff0000' })
  })

  it('is based on the styles a style is based on, and the next style of a style is kept', async () => {
    const { content } = await open()
    const heading = content.paragraphStyles.find((style) => style.name === 'Heading')!
    const body = content.paragraphStyles.find((style) => style.name === 'Body')!
    expect(heading.basedOnId).toBe(body.id)
    expect(heading.nextStyleId).toBe(body.id)
    expect(heading.patch).toMatchObject({ fontSize: 30, weight: 700, align: 'justify' })
    expect(body.patch).toMatchObject({ fontSize: 12, leading: 15, align: 'center', indentLeft: 6, color: '#000000' })
  })

  it('has the leading and the space the file has, and not the defaults of this program', async () => {
    // an automatic leading is a percentage of the size (120 unless the style says), and nothing is added between paragraphs
    const loose = `<?xml version="1.0"?><idPkg:Story xmlns:idPkg="urn:idml"><Story Self="uStory2">
      <ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/Auto"><CharacterStyleRange><Content>One</Content><Br /></CharacterStyleRange></ParagraphStyleRange>
      <ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/Plain"><CharacterStyleRange><Content>Two</Content><Br /><Content>Three</Content></CharacterStyleRange></ParagraphStyleRange>
      </Story></idPkg:Story>`
    const extra = `<ParagraphStyle Self="ParagraphStyle/Auto" Name="Auto" PointSize="20" AutoLeading="150" /><ParagraphStyle Self="ParagraphStyle/Plain" Name="Plain" PointSize="10" SpaceAfter="6" />`
    const entries = fixture().map((entry) =>
      entry.name === 'Stories/Story_uStory2.xml' ? { ...entry, data: loose } : entry.name === 'Resources/Styles.xml' ? { ...entry, data: String(entry.data).replace('</RootParagraphStyleGroup>', `${extra}</RootParagraphStyleGroup>`) } : entry,
    )
    const { content } = await open(entries)
    const frame = content.frames.find((candidate) => candidate.id === 'idml-object-uFrame3')!
    expect(frame.text).toBe('One\nTwo\nThree')
    expect(frame.leading).toBe(30)
    expect(frame.spaceBefore).toBe(0)
    expect(frame.spaceAfter).toBe(0)
    // the other paragraphs: a size of 10 and the default 120 %, with their own space after
    expect(frame.paragraphStylePatches?.map((patch) => patch.leading)).toEqual([30, 12, 12])
    expect(frame.paraSpaceAfter).toEqual([0, 6, 6])
    // the style records have the leading too, for the next text that gets them
    expect(content.paragraphStyles.find((style) => style.name === 'Auto')?.patch).toMatchObject({ fontSize: 20, leading: 30 })
    expect(content.paragraphStyles.find((style) => style.name === 'Auto')?.patch).not.toHaveProperty('autoLeading')
  })

  it('makes a frame with columns a frame for each column, threaded in the order the story reads, the first on the right for a Hebrew story', async () => {
    const withColumns = (data: string) => fixture().map((entry) => (entry.name === 'Spreads/Spread_u1.xml' ? { ...entry, data: String(entry.data).replace('<TextWrapPreference TextWrapMode="BoundingBoxTextWrap">', data + '<TextWrapPreference TextWrapMode="BoundingBoxTextWrap">') } : entry))
    const { content } = await open(withColumns('<TextFramePreference TextColumnCount="2" TextColumnGutter="10" />'))
    const page = pageRects(content.doc)[0]!
    const first = content.frames.find((frame) => frame.id === 'idml-object-uFrame1')!
    const second = content.frames.find((frame) => frame.id === 'idml-object-uFrame1-column-2')!
    // 300 wide, a gutter of 10: two columns of 145; the story reads from the right, so the first column is the right one
    expect(first.w).toBe(145)
    expect(second.w).toBe(145)
    expect(first.x).toBeCloseTo(page.x + 50 + 155, 6)
    expect(second.x).toBeCloseTo(page.x + 50, 6)
    expect(first.y).toBe(second.y)
    expect(first.h).toBe(second.h)
    // the story is in the first column, the second goes on from it, and the thread goes on from the second to the next frame
    expect(first.text).toContain('Hello')
    expect(second.text).toBe('')
    expect(first.next).toBe(second.id)
    expect(second.next).toBe('idml-object-uFrame2')
    // a story that reads from the left starts at the left
    const left = await open(withColumns('<TextFramePreference TextColumnCount="2" TextColumnGutter="10" />').map((entry) => (entry.name === 'Stories/Story_uStory1.xml' ? { ...entry, data: String(entry.data).replace('<StoryPreference OpticalMarginAlignment="false" />', '<StoryPreference StoryDirection="LeftToRightDirection" />') } : entry)))
    const leftFirst = left.content.frames.find((frame) => frame.id === 'idml-object-uFrame1')!
    expect(leftFirst.x).toBeCloseTo(page.x + 50, 6)
  })

  it('takes the insets off the frame, so that it is the area the text has', async () => {
    const entries = fixture().map((entry) =>
      entry.name === 'Spreads/Spread_u1.xml'
        ? { ...entry, data: String(entry.data).replace('<TextWrapPreference TextWrapMode="BoundingBoxTextWrap">', '<TextFramePreference TextColumnCount="1"><Properties><InsetSpacing type="list"><ListItem type="unit">5</ListItem><ListItem type="unit">10</ListItem><ListItem type="unit">15</ListItem><ListItem type="unit">20</ListItem></InsetSpacing></Properties></TextFramePreference><TextWrapPreference TextWrapMode="BoundingBoxTextWrap">') }
        : entry,
    )
    const { content } = await open(entries)
    const page = pageRects(content.doc)[0]!
    const frame = content.frames.find((candidate) => candidate.id === 'idml-object-uFrame1')!
    // top 5, left 10, bottom 15, right 20 of a frame at (50, 160) that is 300 × 80
    expect(frame.x).toBeCloseTo(page.x + 50 + 10, 6)
    expect(frame.w).toBeCloseTo(300 - 10 - 20, 6)
    expect(frame.y).toBeCloseTo(page.y + 160 + 5, 6)
    // 60 high, a little higher for what the layout needs under the last line
    expect(frame.h).toBeGreaterThanOrEqual(60)
    expect(frame.h).toBeLessThan(70)
  })

  it('uses the leading the characters name, over the paragraph', async () => {
    const entries = fixture().map((entry) =>
      entry.name === 'Stories/Story_uStory1.xml'
        ? { ...entry, data: String(entry.data).replace(/<Leading type="unit">36<\/Leading>\s*<AppliedFont/, '<Leading type="unit">44</Leading><AppliedFont') }
        : entry,
    )
    const { content } = await open(entries)
    const head = content.frames.find((frame) => frame.id === 'idml-object-uFrame1')!
    // the first two paragraphs are in that range of characters; the others have the leading of their style
    expect(head.paragraphStylePatches?.map((patch) => patch.leading)).toEqual([44, 44, 15, 15])
    expect(head.leading).toBe(44)
  })

  it('makes a frame as high as its first line when it is a little lower, and leaves a frame that is far too low', async () => {
    const withHeight = async (half: number) => {
      const entries = fixture().map((entry) =>
        entry.name === 'Spreads/Spread_u2.xml' ? { ...entry, data: String(entry.data).replace(rectangle(-80, -20, 80, 20), rectangle(-80, -half, 80, half)) } : entry,
      )
      const { content } = await open(entries)
      return content.frames.find((candidate) => candidate.id === 'idml-object-uFrame3')!
    }
    // the first paragraph of that story has a leading of 15 points: a frame 14 high is a little lower than its line
    // (the text of that frame is at the default size of 14 points, with a leading of 15: the margin is 2.1 points, and the letters
    // reach 1.95 below the line)
    expect((await withHeight(7)).h).toBe(19.1)
    expect((await withHeight(2)).h).toBe(4)
    expect((await withHeight(20)).h).toBe(44.1)
  })

  it('goes on in the next frame of the thread, in another spread, and the story is in the first', async () => {
    const { content } = await open()
    const head = content.frames.find((frame) => frame.id === 'idml-object-uFrame1')!
    const tail = content.frames.find((frame) => frame.id === 'idml-object-uFrame2')!
    expect(head.next).toBe(tail.id)
    expect(tail.next).toBeNull()
    expect(tail.text).toBe('')
  })

  it('keeps a footnote, the text of a variable, a forced line break and the cells of a table', async () => {
    const { content } = await open()
    const head = content.frames.find((frame) => frame.id === 'idml-object-uFrame1')!
    expect(head.footnotes).toEqual([expect.objectContaining({ content: 'The note', anchor: head.text.length })])
    const table = content.frames.find((frame) => frame.id === 'idml-object-uFrame3')!
    expect(table.text).toBe('A\tB\nC\tD')
  })

  it('has the automatic page number only where a parent page can show it', async () => {
    const { content } = await open()
    const number = content.parents.flatMap((parent) => parent.frames).find((frame) => frame.id === 'idml-object-uNumberLeft')!
    expect(number.text).toBe(`Page ${PAGE_NUMBER_MARKER}`)
  })
})

describe('the parent pages of an IDML file', () => {
  it('are one for each page of the parent spread, with the objects that lie on it', async () => {
    const { content } = await open()
    expect(content.parents).toHaveLength(2)
    const [left, right] = content.parents
    expect(left!.frames.map((frame) => frame.id)).toEqual(['idml-object-uNumberLeft'])
    expect(left!.shapes).toHaveLength(0)
    expect(right!.frames).toHaveLength(0)
    expect(right!.shapes.map((shape) => shape.id)).toEqual(['idml-object-uRuleRight'])
    // the rule: (200, -280) and points -150…150, -1…1, on the right page that starts at (0, -300)
    expect(right!.shapes[0]).toMatchObject({ x: 50, y: 19, w: 300, h: 2 })
  })

  it('are given to the pages the file gives them to: the left page of a spread has the left parent page', async () => {
    const { content } = await open()
    const [left, right] = content.parents
    expect(content.pageParents).toEqual([left!.id, right!.id, null])
  })
})

describe('an IDML file that cannot be read', () => {
  it('is refused with a message when it is not a zip, is encrypted or has no design map', async () => {
    await expect(readIdmlFile(new File(['not a zip at all, not even close'], 'x.idml'))).rejects.toThrow(/פגום/)
    await expect(open([{ name: 'designmap.xml', data: designMap, flags: 1 }])).rejects.toThrow(/מוצפן/)
    await expect(open([{ name: 'readme.txt', data: 'not IDML' }])).rejects.toThrow(/designmap\.xml/)
    await expect(open(fixture(), 'layout.zip')).rejects.toThrow(/IDML/)
  })

  it('is refused when an XML file declares entities or a document type', async () => {
    const hostile = `<?xml version="1.0"?><!DOCTYPE lol [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;">]><Story Self="x"><Content>&b;</Content></Story>`
    await expect(open([...fixture(), { name: 'Stories/Story_hostile.xml', data: hostile }])).rejects.toThrow(/DOCTYPE|ENTITY/)
  })

  it('is refused when an entry says it is small and unpacks to a huge file', async () => {
    const bomb = new Uint8Array(6 * 1024 * 1024)
    await expect(open([...fixture(), { name: 'Stories/Story_bomb.xml', data: bomb, deflate: true, declaredUnpacked: 200 }])).rejects.toThrow(/גדול מדי/)
  })

  it('is refused when its XML is broken', async () => {
    await expect(open([...fixture().filter((entry) => entry.name !== 'Spreads/Spread_u1.xml'), { name: 'Spreads/Spread_u1.xml', data: '<Spread><Page></Spread>' }])).rejects.toThrow(/XML פגום/)
  })
})
