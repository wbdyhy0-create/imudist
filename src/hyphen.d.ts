declare module 'hyphen/en-us' {
  export interface HyphenOptions {
    /** the character put at each place a word may be broken (a soft hyphen by default) */
    hyphenChar?: string
    /** the shortest word that is hyphenated */
    minWordLength?: number
    debug?: boolean
  }
  export function hyphenateSync(text: string, options?: HyphenOptions): string
}
