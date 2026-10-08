import { HELP_TOPICS, type HelpTopic } from './HelpTopics'

const IGNORED_QUERY_WORDS = new Set([
  'איך', 'מה', 'אני', 'רוצה', 'אפשר', 'בבקשה', 'תוכל', 'תוכלי', 'לי', 'את', 'של', 'על', 'עם', 'עבור', 'גם',
  'למה', 'איפה', 'היכן', 'מתי', 'איזה', 'איזו', 'כיצד', 'כדי', 'האם', 'שלי', 'שלך', 'זה', 'זאת', 'יש', 'כל',
  'בין', 'ההבדל', 'הבדל', 'אם', 'עושים', 'מתאים', 'מתאימה', 'מומלץ', 'מומלצת', 'כדאי', 'בלבד',
])

const STARTER_TOPIC_IDS = ['new-document', 'open-file', 'document-presets', 'custom-size', 'document-margins']
const SEARCH_FIELDS = [
  { weight: 6, getText: (topic: HelpTopic) => topic.title },
  { weight: 4.5, getText: (topic: HelpTopic) => topic.keywords.join(' ') },
  { weight: 1.25, getText: (topic: HelpTopic) => topic.answer.join(' ') },
]

export function normalizeHelpQuery(value: string) {
  return value
    .toLocaleLowerCase('he')
    .replace(/[״"'׳.,?!:;()[\]{}־–—-]/g, ' ')
    .replace(/פידיאף|פי\s*די\s*אף/g, 'pdf')
    .replace(/פיסקאות/g, 'פסקאות')
    .replace(/פיסקה/g, 'פסקה')
    .replace(/פיסקות/g, 'פסקאות')
    .replace(/\bvector(?:ial)?\b/g, 'וקטורי')
    .replace(/\s+/g, ' ')
    .trim()
}

export function getHelpSearchTokens(normalizedQuery: string) {
  return normalizedQuery.split(' ').filter((token) => token.length > 1 && !IGNORED_QUERY_WORDS.has(token))
}

function wordVariants(word: string) {
  const variants = new Set([word])
  const unprefixed = /^[והלבמכש]/.test(word) && word.length > 3 ? word.slice(1) : word
  variants.add(unprefixed)
  for (const root of [word, unprefixed]) {
    for (const ending of ['יות', 'ים', 'ות', 'ית', 'יה', 'ה', 'ת', 'י', 'ך', 'כם', 'ן']) {
      const stem = root.slice(0, -ending.length)
      if (root.endsWith(ending) && stem.length >= 4) variants.add(stem)
    }
  }
  return [...variants]
}

function wordMatchQuality(queryWord: string, topicWord: string) {
  let quality = 0
  for (const queryVariant of wordVariants(queryWord)) {
    for (const topicVariant of wordVariants(topicWord)) {
      if (queryVariant === topicVariant) quality = Math.max(quality, 1)
      else if (topicVariant.startsWith(queryVariant)) quality = Math.max(quality, 0.85)
      else if (queryVariant.length >= 3 && topicVariant.includes(queryVariant)) quality = Math.max(quality, 0.55)
    }
  }
  return quality
}

function topicScore(topic: HelpTopic, query: string, tokens: string[]) {
  const fields = SEARCH_FIELDS.map(({ weight, getText }) => {
    const text = normalizeHelpQuery(getText(topic))
    return { text, words: text.split(' '), weight }
  })

  let score = 0
  let matchedTokens = 0
  for (const [index, token] of tokens.entries()) {
    const fieldScore = fields.reduce((total, field) => {
      const quality = Math.max(0, ...field.words.map((word) => wordMatchQuality(token, word)))
      return total + quality * field.weight
    }, 0)
    if (fieldScore > 0) {
      matchedTokens += 1
      score += fieldScore * (index === 0 ? 1.25 : 1)
      if (topic.keywords.some((keyword) => normalizeHelpQuery(keyword) === token)) score += 4.5
    }
  }
  if (!matchedTokens) return 0

  const titleAndKeywords = fields.slice(0, 2).map((field) => field.text).join(' ')
  if (titleAndKeywords.includes(query)) score += 5
  return score + matchedTokens * 0.75 - (tokens.length - matchedTokens) * 0.25
}

export function getHelpTopicResults(normalizedQuery: string) {
  const tokens = getHelpSearchTokens(normalizedQuery)
  if (!tokens.length) return []

  const asksAboutLayersPanel = ['לשונית שכבות', 'לוח שכבות', 'חלונית שכבות', 'שכבות בלוח'].some((phrase) => normalizedQuery.includes(phrase))
  const asksAboutFileExport = ['לשונית קובץ', 'תפריט קובץ', 'מתוך קובץ'].some((phrase) => normalizedQuery.includes(phrase))
  const candidates = asksAboutLayersPanel
    ? HELP_TOPICS.filter((topic) => topic.id.startsWith('layers-'))
    : asksAboutFileExport
      ? HELP_TOPICS.filter((topic) =>
          topic.id === 'file-export' ||
          topic.id === 'export-pdf' ||
          topic.id.startsWith('pdf-') ||
          topic.id === 'export-png' ||
          topic.id === 'png-current-page',
        )
      : HELP_TOPICS

  return candidates
    .map((topic) => ({ topic, score: topicScore(topic, normalizedQuery, tokens) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.topic.title.localeCompare(b.topic.title, 'he'))
    .slice(0, 7)
    .map(({ topic }) => topic)
}

export function getStarterHelpTopics() {
  return STARTER_TOPIC_IDS
    .map((id) => HELP_TOPICS.find((topic) => topic.id === id))
    .filter((topic): topic is HelpTopic => !!topic)
}
