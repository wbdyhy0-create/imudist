import { type FootnoteLayoutConfig, type ParagraphStyleRecord, type TextFrame } from '../document'
import { footnoteDividerHeight, footnoteDividerTextStyle } from '../footnoteLayout'
import type { FrameFlow } from '../textLayout'
import { TextFrameView } from './TextFrameView'

interface Props {
  frame: TextFrame
  flow: FrameFlow
  config: FootnoteLayoutConfig
  paragraphStyles: ParagraphStyleRecord[]
  zoom: number
  tx: number
  ty: number
  z: number
}

const noop = () => {}

export function EndnotesPageView({ frame, flow, config, paragraphStyles, zoom, tx, ty, z }: Props) {
  const heading = config.dividerMode === 'heading' ? {
    text: config.dividerText,
    height: footnoteDividerHeight(config, paragraphStyles),
    style: footnoteDividerTextStyle(config, paragraphStyles),
    showLines: config.dividerHeadingLines,
    decoration: config.dividerHeadingDecoration,
  } : undefined
  return (
    <div className="endnote-page-readonly" onPointerDownCapture={(event) => event.stopPropagation()} onContextMenuCapture={(event) => event.stopPropagation()}>
    <TextFrameView
      frame={frame}
      style={flow.style}
      slice=""
      runs={[]}
      highlight={null}
      floats={[]}
      z={z}
      overflow={false}
      continuesParagraphAtEnd={false}
      hasPrev={false}
      zoom={zoom}
      tx={tx}
      ty={ty}
      selected={false}
      locked
      editing={false}
      armed={false}
      showEdge={false}
      showHidden={false}
      paraGaps={[]}
      startParaIndex={0}
      atParaStart
      spaceBeforeFirst={0}
      spaceAfterLast={0}
      footnotes={flow.footnotes}
      footnoteHeight={frame.h}
      footnoteDividerGap={config.dividerGap}
      footnoteDividerWidth={config.dividerWidth}
      footnoteDividerThickness={config.dividerThickness}
      footnoteDividerAlignment={config.dividerAlignment}
      footnoteDividerHeading={heading}
      footnoteNumberGap={config.numberTextGap}
      footnoteWidthScale={config.widthScale}
      footnoteMode={config.mode}
      footnoteColumns={config.columns}
      request={null}
      onPointerDown={noop}
      onDoubleClick={noop}
      onHandleDown={noop}
      onRotateDown={noop}
      onOutPortDown={noop}
      onInPortDown={noop}
      onEdit={noop}
      onSelect={noop}
      onCopyText={() => null}
      onBackspaceAtStart={noop}
      onStopEditing={noop}
    />
    </div>
  )
}
