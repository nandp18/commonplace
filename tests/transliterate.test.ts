import assert from 'node:assert'
import { transliterate as t } from '../src/transliterate.ts'

const words: [string, string][] = [
  // Silent final "a", but not on one-letter words
  ['ઘર', 'ghar'], ['ન', 'na'], ['જ', 'ja'], ['પરમ', 'param'], ['સરસ', 'saras'],
  // Silent "a" inside words
  ['ભગવાન', 'bhagvaan'], ['ઉપકાર', 'upkaar'], ['સમજણ', 'samjan'], ['અમદાવાદ', 'amdaavaad'], ['મૂરખને', 'moorakhne'],
  ['એટલા', 'etla'], ['આપની', 'aapni'], ['નરસિંહ', 'narsinh'], ['રામને', 'raamne'], ['કરતો', 'karto'],
  // Kept before a cluster or at the start
  ['નમસ્તે', 'namaste'], ['કરે', 'kare'], ['સરોવર', 'sarovar'],
  // Sanskrit endings keep their "a"; others don't
  ['મંત્ર', 'mantra'], ['સત્ય', 'satya'], ['વિશ્વ', 'vishva'], ['કૃષ્ણ', 'krushna'], ['ધર્મ', 'dharm'], ['ભક્ત', 'bhakt'],
  // Everyday spellings at the ends of words
  ['મારી', 'maari'], ['કહીએ', 'kahie'], ['ગયા', 'gaya'], ['મા', 'maa'], ['પીડ', 'peed'], ['નહીં', 'nahin'],
  ['છું', 'chhu'], ['કરવું', 'karvu'], ['શું', 'shu'], ['ત્યાં', 'tyaan'],
  // Nasals, visarga, special letters
  ['સંબંધ', 'sambandh'], ['દુઃખે', 'dukhe'], ['જ્ઞાન', 'gnaan'], ['પથ્થર', 'patthar'], ['અચ્છું', 'achhu'], ['ક્ષમા', 'kshama'],
  ['ફૂલ', 'fool'], ['વૈષ્ણવ', 'vaishnav'], ['અખો', 'akho'], ['ૐ', 'om'],
]
for (const [gu, expected] of words) assert.equal(t(gu), expected, gu)

// Real lines, with punctuation and line breaks left alone
assert.equal(t('વૈષ્ણવ જન તો તેને કહીએ, જે પીડ પરાઈ જાણે રે;'), 'vaishnav jan to tene kahie, je peed paraai jaane re;')
assert.equal(t('એક મૂરખને એવી ટેવ,\nપથ્થર એટલા પૂજે દેવ.'), 'ek moorakhne evi tev,\npatthar etla pooje dev.')
assert.equal(t('“શું કરે છે?”'), '“shu kare chhe?”')
assert.equal(t('પાન ૧૨૩ of the Gita'), 'paan 123 of the Gita')
assert.equal(t('No Gujarati here.'), 'No Gujarati here.')
assert.equal(t('સ્‍વ'), t('સ્વ'), 'joiners do not split a word')

console.log('transliterate tests passed')
