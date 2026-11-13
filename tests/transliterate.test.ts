import assert from 'node:assert'
import { transliterate as t } from '../src/transliterate.ts'

const words: [string, string][] = [
  // The scheme's own example
  ['અનિર્દેશ', 'anirdesh'], ['ગુજરાતી', 'gujarātī'],
  // A silent final "a", but not on one-letter words; every other "a" is written
  ['ઘર', 'ghar'], ['ન', 'na'], ['જ', 'ja'], ['પરમ', 'param'], ['ભગવાન', 'bhagavān'], ['ઉપકાર', 'upakār'],
  ['અમદાવાદ', 'amadāvād'], ['નમસ્તે', 'namaste'], ['સરોવર', 'sarovar'],
  // Sanskrit endings keep their "a"; others don't
  ['મંત્ર', 'mantra'], ['સત્ય', 'satya'], ['વિશ્વ', 'vishva'], ['કૃષ્ણ', 'kṛuṣhṇa'], ['ધર્મ', 'dharm'], ['ભક્ત', 'bhakt'],
  // Long vowels are marked and kept, also at the end of a word
  ['મારી', 'mārī'], ['ગયા', 'gayā'], ['મા', 'mā'], ['ફૂલ', 'fūl'], ['ઊંચું', 'ūnchun'], ['ઈશ્વર', 'īshvar'],
  // Dotted retroflexes, ળ, ઝ, ઞ
  ['ટેવ', 'ṭev'], ['ઠાકોર', 'ṭhākor'], ['ડર', 'ḍar'], ['ઢોલ', 'ḍhol'], ['ગણ', 'gaṇ'], ['વૈષ્ણવ', 'vaiṣhṇav'],
  ['ક્ષમા', 'kṣhamā'], ['કમળ', 'kamaḷ'], ['ઝાડ', 'zāḍ'], ['જ્ઞાન', 'gnān'],
  // ઍ, ઑ, ઋ
  ['બૅન્ક', 'bĕnk'], ['ઑફિસ', 'ŏfis'], ['ઋષિ', 'ṛuṣhi'],
  // Nasals, visarga, doubled aspirates
  ['સંબંધ', 'sambandh'], ['નહીં', 'nahīn'], ['દુઃખે', 'dukhe'], ['પથ્થર', 'patthar'], ['છું', 'chhun'], ['ૐ', 'om'],
]
for (const [gu, expected] of words) assert.equal(t(gu), expected, gu)

// Real lines, with punctuation and line breaks left alone
assert.equal(t('અનિર્દેશ ગુજરાતી'), 'anirdesh gujarātī')
assert.equal(t('વૈષ્ણવ જન તો તેને કહીએ, જે પીડ પરાઈ જાણે રે;'), 'vaiṣhṇav jan to tene kahīe, je pīḍ parāī jāṇe re;')
assert.equal(t('“શું કરે છે?”'), '“shun kare chhe?”')
assert.equal(t('પાન ૧૨૩ of the Gita'), 'pān 123 of the Gita')
assert.equal(t('No Gujarati here.'), 'No Gujarati here.')
assert.equal(t('સ્‍વ'), t('સ્વ'), 'joiners do not split a word')

console.log('transliterate tests passed')
