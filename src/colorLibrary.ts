import sourceGradients from './data/ui-gradients.json'

export interface ColorSwatchPreset {
  name: string
  hex: string
  category: 'יסוד' | 'פסטל' | 'ניאון' | 'טבע'
}

export interface GradientPreset {
  id: string
  name: string
  source: 'metallic' | 'uiGradients'
  tags: string[]
  angle: number
  stops: { offset: number; color: string }[]
}

export const SOLID_COLORS: ColorSwatchPreset[] = [
  { name: 'נייר', hex: '#FFFFFF', category: 'יסוד' },
  { name: 'שחור', hex: '#111318', category: 'יסוד' },
  { name: 'אפור בהיר', hex: '#D9DDE3', category: 'יסוד' },
  { name: 'אפור', hex: '#8A9099', category: 'יסוד' },
  { name: 'אפור כהה', hex: '#454B54', category: 'יסוד' },
  { name: 'אדום', hex: '#D92D20', category: 'יסוד' },
  { name: 'כתום', hex: '#E96A1A', category: 'יסוד' },
  { name: 'צהוב', hex: '#E9B91C', category: 'יסוד' },
  { name: 'ירוק', hex: '#16844A', category: 'יסוד' },
  { name: 'טורקיז', hex: '#008C95', category: 'יסוד' },
  { name: 'כחול', hex: '#1769AA', category: 'יסוד' },
  { name: 'סגול', hex: '#7046A8', category: 'יסוד' },
  { name: 'ורוד', hex: '#D94783', category: 'יסוד' },
  { name: 'אפרסק', hex: '#F2B9A1', category: 'פסטל' },
  { name: 'ורוד אבקתי', hex: '#E9B9C5', category: 'פסטל' },
  { name: 'לבנדר', hex: '#C9B8E8', category: 'פסטל' },
  { name: 'לילך', hex: '#D8C5E8', category: 'פסטל' },
  { name: 'תכלת', hex: '#B7D8EA', category: 'פסטל' },
  { name: 'מנטה', hex: '#B8E0D2', category: 'פסטל' },
  { name: 'מרווה', hex: '#C6D2B6', category: 'פסטל' },
  { name: 'צהוב חמאה', hex: '#F2E3A2', category: 'פסטל' },
  { name: 'קורל בהיר', hex: '#F2B2A0', category: 'פסטל' },
  { name: 'כחול קרח', hex: '#D1E7F0', category: 'פסטל' },
  { name: 'ירוק ים', hex: '#A8D8CF', category: 'פסטל' },
  { name: 'ורוד זוהר', hex: '#FF2D95', category: 'ניאון' },
  { name: 'מג׳נטה זוהרת', hex: '#F000FF', category: 'ניאון' },
  { name: 'כתום זוהר', hex: '#FF5A00', category: 'ניאון' },
  { name: 'צהוב זוהר', hex: '#E8FF00', category: 'ניאון' },
  { name: 'ירוק ליים', hex: '#7CFF00', category: 'ניאון' },
  { name: 'ירוק זוהר', hex: '#00E676', category: 'ניאון' },
  { name: 'טורקיז זוהר', hex: '#00F5D4', category: 'ניאון' },
  { name: 'תכלת זוהר', hex: '#00C8FF', category: 'ניאון' },
  { name: 'כחול חשמלי', hex: '#245BFF', category: 'ניאון' },
  { name: 'סגול זוהר', hex: '#8B35FF', category: 'ניאון' },
  { name: 'חול', hex: '#C7A77A', category: 'טבע' },
  { name: 'טרקוטה', hex: '#B65D45', category: 'טבע' },
  { name: 'חמרה', hex: '#8F4635', category: 'טבע' },
  { name: 'חרדל', hex: '#B88A2D', category: 'טבע' },
  { name: 'זית', hex: '#6E7440', category: 'טבע' },
  { name: 'יער', hex: '#315B45', category: 'טבע' },
  { name: 'אורן', hex: '#1F5147', category: 'טבע' },
  { name: 'ים עמוק', hex: '#245A68', category: 'טבע' },
  { name: 'אבן', hex: '#A99F91', category: 'טבע' },
  { name: 'חימר', hex: '#C78966', category: 'טבע' },
  { name: 'קקאו', hex: '#6B4B3E', category: 'טבע' },
  { name: 'שזיף', hex: '#684653', category: 'טבע' },
]

const METALLIC_GRADIENTS: GradientPreset[] = [
  { id: 'metal-gold', name: 'זהב מטאלי', source: 'metallic', tags: ['מתכתי'], angle: 0, stops: ['#BF953F', '#FCF6BA', '#B38728', '#FBF5B7', '#AA771C'].map((color, index) => ({ offset: index / 4, color })) },
  { id: 'metal-silver', name: 'כסף מטאלי', source: 'metallic', tags: ['מתכתי'], angle: 0, stops: ['#73777D', '#F4F6F8', '#A6ABB2', '#FFFFFF', '#858A91'].map((color, index) => ({ offset: index / 4, color })) },
  { id: 'metal-copper', name: 'נחושת מטאלית', source: 'metallic', tags: ['מתכתי'], angle: 0, stops: ['#6F351D', '#C77B48', '#F3C18D', '#A6532B', '#E2A16B'].map((color, index) => ({ offset: index / 4, color })) },
  { id: 'metal-bronze', name: 'ברונזה מטאלית', source: 'metallic', tags: ['מתכתי'], angle: 0, stops: ['#49301F', '#A36D38', '#E0B66E', '#78502C', '#C99451'].map((color, index) => ({ offset: index / 4, color })) },
]

const rgb = (hex: string) => {
  const value = hex.slice(1)
  const normalized = value.length === 3 ? [...value].map((part) => part + part).join('') : value
  return [0, 2, 4].map((index) => Number.parseInt(normalized.slice(index, index + 2), 16))
}

function hueFor(channels: number[]) {
  const [red, green, blue] = channels.map((value) => value / 255)
  const maximum = Math.max(red, green, blue)
  const minimum = Math.min(red, green, blue)
  const delta = maximum - minimum
  if (delta < 0.08) return null
  const hue = maximum === red
    ? 60 * (((green - blue) / delta) % 6)
    : maximum === green
      ? 60 * ((blue - red) / delta + 2)
      : 60 * ((red - green) / delta + 4)
  return (hue + 360) % 360
}

function tagsFor(colors: string[]) {
  const channels = colors.map(rgb)
  const average = channels.reduce((sum, color) => sum + (color[0] + color[1] + color[2]) / 3, 0) / channels.length
  const tags = average > 190 ? ['בהירים'] : average < 72 ? ['כהים'] : []
  const hues = channels.map(hueFor)
  const warmCount = hues.filter((hue) => hue !== null && (hue < 85 || hue >= 330)).length
  const coolCount = hues.filter((hue) => hue !== null && hue >= 85 && hue < 330).length
  const neutralCount = hues.filter((hue) => hue === null).length
  if (warmCount / colors.length >= 1 / 3) tags.push('חמים')
  if (coolCount / colors.length >= 1 / 3) tags.push('קרים')
  if (neutralCount / colors.length >= 1 / 2 || (warmCount === 0 && coolCount === 0)) tags.push('ניטרליים')
  return tags
}

const importedGradients: GradientPreset[] = (sourceGradients as { name: string; colors: string[] }[]).map((gradient, index) => ({
  id: `ui-${index}`,
  name: gradient.name,
  source: 'uiGradients',
  tags: tagsFor(gradient.colors),
  angle: 0,
  stops: gradient.colors.map((color, stopIndex) => ({ offset: stopIndex / (gradient.colors.length - 1), color })),
}))

export const GRADIENT_PRESETS = [...METALLIC_GRADIENTS, ...importedGradients]