/**
 * Gujarati → roman letters, by the BAPS transliteration scheme: long vowels are marked
 * (ā, ī, ū), retroflex consonants are dotted (ṭ, ḍ, ṇ, ṣh, ḷ), and ઝ is "z":
 * "અનિર્દેશ ગુજરાતી" → "anirdesh gujarātī". Rule-based and on-device.
 *
 * Each consonant carries an "a". The scheme writes it everywhere except at the end of a
 * word, where it's silent (દેશ desh) unless the word ends in a cluster that keeps it
 * (મંત્ર mantra, સત્ય satya).
 */

const VOWELS: Record<string, string> = { અ: 'a', આ: 'ā', ઇ: 'i', ઈ: 'ī', ઉ: 'u', ઊ: 'ū', ઋ: 'ṛu', ૠ: 'ṛu', એ: 'e', ઍ: 'ĕ', ઐ: 'ai', ઓ: 'o', ઑ: 'ŏ', ઔ: 'au' }
const SIGNS: Record<string, string> = { 'ા': 'ā', 'િ': 'i', 'ી': 'ī', 'ુ': 'u', 'ૂ': 'ū', 'ૃ': 'ṛu', 'ૄ': 'ṛu', 'ે': 'e', 'ૅ': 'ĕ', 'ૈ': 'ai', 'ો': 'o', 'ૉ': 'ŏ', 'ૌ': 'au' }
const CONSONANTS: Record<string, string> = {
  ક: 'k', ખ: 'kh', ગ: 'g', ઘ: 'gh', ઙ: 'ṅ',
  ચ: 'ch', છ: 'chh', જ: 'j', ઝ: 'z', ઞ: 'ny',
  ટ: 'ṭ', ઠ: 'ṭh', ડ: 'ḍ', ઢ: 'ḍh', ણ: 'ṇ',
  ત: 't', થ: 'th', દ: 'd', ધ: 'dh', ન: 'n',
  પ: 'p', ફ: 'f', બ: 'b', ભ: 'bh', મ: 'm',
  ય: 'y', ર: 'r', લ: 'l', ળ: 'ḷ', વ: 'v',
  શ: 'sh', ષ: 'ṣh', સ: 's', હ: 'h',
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

/** Silence a word's final "a", except in one-letter words (ન, જ) and Sanskrit endings: મંત્ર, સત્ય, વિશ્વ, કૃષ્ણ. */
function dropFinalA(s: Syllable[]) {
  const end = s.length - 1
  const last = s[end]
  const bare = last.vowel === 'a' && !last.independent && !last.coda
  const heldByCluster = last.cons.length > 1 && /^(y|r|v|n|ṇ)$/.test(last.cons[last.cons.length - 1])
  if (end > 0 && bare && !heldByCluster) last.vowel = ''
}

function cluster(cons: string[]): string {
  return cons
    .join('')
    .replace('jny', 'gn') // જ્ઞ: gnān
    .replace(/([kgtdbcpṭḍ])h\1h/, '$1$1h') // પથ્થર patthar, ઉચ્છ્વાસ
}

function romanize(word: string): string {
  const s = parse(word)
  if (!s.length) return word
  dropFinalA(s)
  return s
    .map((x, i) => {
      const following = s[i + 1]?.cons[0] ?? ''
      let coda: string = x.coda
      if (coda === 'n' && /^[pbm]/.test(following)) coda = 'm' // સંબંધ sambandh
      if (coda === 'h' && /^(kh|s)/.test(following)) coda = '' // દુઃખ dukh
      return cluster(x.cons) + x.vowel + coda
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
