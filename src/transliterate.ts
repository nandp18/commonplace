/**
 * Gujarati → the everyday roman spelling people text in: "વૈષ્ણવ જન" → "vaishnav jan".
 * Rule-based and on-device. The hard part is the vowel Gujarati writes but doesn't say:
 * each consonant carries an "a" that is usually silent at the end of a word and between
 * certain consonants, so ભગવાન is "bhagvaan", not "bhagavaana".
 */

const VOWELS: Record<string, string> = { અ: 'a', આ: 'aa', ઇ: 'i', ઈ: 'ee', ઉ: 'u', ઊ: 'oo', ઋ: 'ru', એ: 'e', ઍ: 'e', ઐ: 'ai', ઓ: 'o', ઑ: 'o', ઔ: 'au' }
const SIGNS: Record<string, string> = { 'ા': 'aa', 'િ': 'i', 'ી': 'ee', 'ુ': 'u', 'ૂ': 'oo', 'ૃ': 'ru', 'ે': 'e', 'ૅ': 'e', 'ૈ': 'ai', 'ો': 'o', 'ૉ': 'o', 'ૌ': 'au' }
const CONSONANTS: Record<string, string> = {
  ક: 'k', ખ: 'kh', ગ: 'g', ઘ: 'gh', ઙ: 'ng',
  ચ: 'ch', છ: 'chh', જ: 'j', ઝ: 'jh', ઞ: 'ny',
  ટ: 't', ઠ: 'th', ડ: 'd', ઢ: 'dh', ણ: 'n',
  ત: 't', થ: 'th', દ: 'd', ધ: 'dh', ન: 'n',
  પ: 'p', ફ: 'f', બ: 'b', ભ: 'bh', મ: 'm',
  ય: 'y', ર: 'r', લ: 'l', ળ: 'l', વ: 'v',
  શ: 'sh', ષ: 'sh', સ: 's', હ: 'h',
}
const VIRAMA = '્'
const NUKTA = '઼'
const WORD = /[ઁ-હ઼-્ૠ-ૣ]+/g

interface Syllable {
  cons: string[]
  vowel: string
  /** Written as a full vowel letter, so always pronounced. */
  independent: boolean
  coda: '' | 'n' | 'h'
}

function parse(word: string): Syllable[] {
  const out: Syllable[] = []
  let cons: string[] = []
  const push = (vowel: string, independent = false) => {
    out.push({ cons, vowel, independent, coda: '' })
    cons = []
  }
  for (let i = 0; i < word.length; i++) {
    const ch = word[i]
    if (CONSONANTS[ch]) {
      let sound = CONSONANTS[ch]
      if (word[i + 1] === NUKTA) {
        i++
        if (ch === 'જ') sound = 'z'
      }
      cons.push(sound)
      if (word[i + 1] === VIRAMA) {
        i++
        if (!CONSONANTS[word[i + 1]]) push('')
        continue
      }
      const sign = SIGNS[word[i + 1]]
      if (sign) i++
      push(sign ?? 'a')
    } else if (VOWELS[ch]) {
      push(VOWELS[ch], true)
    } else if ((ch === 'ં' || ch === 'ઁ' || ch === 'ઃ') && out.length) {
      out[out.length - 1].coda = ch === 'ઃ' ? 'h' : 'n'
    }
  }
  return out
}

/** Silence the "a"s Gujarati doesn't pronounce. Right to left, like the language's own rhythm. */
function dropSilentVowels(s: Syllable[]) {
  const end = s.length - 1
  const isBareA = (x: Syllable) => x.vowel === 'a' && !x.independent && !x.coda

  // A final "a" goes, except one-letter words (ન, જ) and Sanskrit endings: મંત્ર, સત્ય, વિશ્વ, કૃષ્ણ.
  const last = s[end]
  const heldByCluster = last.cons.length > 1 && /^(y|r|v|n)$/.test(last.cons[last.cons.length - 1])
  if (end > 0 && isBareA(last) && !heldByCluster) last.vowel = ''

  // Between vowels, a lone "a" goes: ઉપકાર upkaar. Never twice in a row, never in the first syllable.
  for (let i = end - 1; i >= 1; i--) {
    const next = s[i + 1]
    if (isBareA(s[i]) && s[i].cons.length === 1 && next.cons.length === 1 && next.vowel) s[i].vowel = ''
  }
}

function cluster(cons: string[]): string {
  return cons
    .join('')
    .replace('jny', 'gn') // જ્ઞ
    .replace('chchh', 'chh') // ચ્છ
    .replace(/([kgtdbc])h\1h/, '$1$1h') // પથ્થર patthar, બચ્ચા baccha
}

function romanize(word: string): string {
  const s = parse(word)
  if (!s.length) return word
  dropSilentVowels(s)
  return s
    .map((x, i) => {
      const next = s[i + 1]
      const final = !next
      const following = next?.cons[0] ?? ''
      let vowel = x.vowel
      let coda: string = x.coda
      if (vowel === 'ee' && (final || !following)) vowel = 'i' // મારી maari, કહીએ kahie
      if (vowel === 'aa' && final && !coda && s.length > 1) vowel = 'a' // ગયા gaya
      if (coda === 'n' && final && vowel === 'u') coda = '' // કરવું karvu: barely voiced
      if (coda === 'n' && /^[pbm]/.test(following)) coda = 'm' // સંબંધ sambandh
      if (coda === 'h' && /^(kh|s)/.test(following)) coda = '' // દુઃખ dukh
      return cluster(x.cons) + vowel + coda
    })
    .join('')
}

/** Latin text, punctuation and spacing pass through untouched. */
export function transliterate(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[‌‍]/g, '')
    .replace(/ૐ/g, 'om')
    .replace(/[૦-૯]/g, (d) => String(d.charCodeAt(0) - 0x0ae6))
    .replace(WORD, romanize)
}
