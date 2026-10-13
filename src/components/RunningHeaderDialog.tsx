import { useState } from 'react'
import type { ParagraphStyleRecord } from './ParagraphStylesPanel'
import { t } from '../i18n'

interface Props {
  styles: ParagraphStyleRecord[]
  onApply: (styleId: string, strategy: 'first' | 'last') => void
  onClose: () => void
}

export function RunningHeaderDialog({ styles, onApply, onClose }: Props) {
  const [styleId, setStyleId] = useState(styles[0]?.id ?? '')
  const [strategy, setStrategy] = useState<'first' | 'last'>('last')
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-label={t('כותרת משתנה')}>
        <h2>{t('כותרת משתנה')}</h2>
        <p>{t('הכותרת תוצג בתיבת המאסטר ותשתנה לפי סגנון הפסקה שמופיע בעמוד.')}</p>
        <label className="field-label">{t('סגנון פסקה')}<select className="select" value={styleId} onChange={(event) => setStyleId(event.target.value)}>{styles.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}</select></label>
        <div className="seg" role="radiogroup" aria-label={t('בחירת כותרת')}><button className={strategy === 'first' ? 'on' : ''} onClick={() => setStrategy('first')}>{t('ראשון בעמוד')}</button><button className={strategy === 'last' ? 'on' : ''} onClick={() => setStrategy('last')}>{t('אחרון בעמוד')}</button></div>
        <div className="modal-buttons"><button className="btn primary" disabled={!styleId} onClick={() => { onApply(styleId, strategy); onClose() }}>{t('הוסף כותרת')}</button><button className="btn" onClick={onClose}>{t('ביטול')}</button></div>
      </div>
    </div>
  )
}
