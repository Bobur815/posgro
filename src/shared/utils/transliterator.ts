// src/shared/utils/transliterator.ts

// Uzbek Latin ⇄ Cyrillic Transliterator

type ScriptType = "latin" | "cyrillic" | "unknown";

const latinToCyrillicMap: Record<string, string> = {
  a: "а", b: "б", d: "д", e: "е", f: "ф", g: "г", h: "ҳ", i: "и",
  j: "ж", k: "к", l: "л", m: "м", n: "н", o: "о", p: "п", q: "қ",
  r: "р", s: "с", t: "т", u: "у", v: "в", x: "х", y: "й", z: "з",
  "o‘": "ў", "g‘": "ғ", sh: "ш", ch: "ч", ng: "нг", ya: "я", yo: "ё", yu: "ю",
};

const cyrillicToLatinMap: Record<string, string> = {
  а: "a", б: "b", д: "d", е: "e", ф: "f", г: "g", ҳ: "h", и: "i",
  ж: "j", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", қ: "q",
  р: "r", с: "s", т: "t", у: "u", в: "v", х: "x", й: "y", з: "z",
  ў: "o‘", ғ: "g‘", ш: "sh", ч: "ch", я: "ya", ё: "yo", ю: "yu",
};

const latinDigraphs = ["o‘", "g‘", "sh", "ch", "ng", "ya", "yo", "yu"];

function detectScript(text: string): ScriptType {
  const latin = /[a-zA-Z]/.test(text);
  const cyrillic = /[а-яА-Яўқғҳё]/.test(text);

  if (latin && !cyrillic) return "latin";
  if (cyrillic && !latin) return "cyrillic";
  return "unknown";
}

function isUzbekWord(word: string): boolean {
  return /^[a-zA-Zа-яА-Яўқғҳёʼ‘]+$/.test(word);
}

function latinToCyrillic(word: string): string {
  let w = word.toLowerCase();

  for (const d of latinDigraphs) {
    const regex = new RegExp(d, "g");
    w = w.replace(regex, latinToCyrillicMap[d]);
  }

  return w.replace(/[a-z]/g, (char) => latinToCyrillicMap[char] || char);
}

function cyrillicToLatin(word: string): string {
  return word.replace(/[а-яўқғҳё]/g, (char) => cyrillicToLatinMap[char] || char);
}

/**
 * Converts Uzbek text between Latin and Cyrillic automatically.
 * @param text Input text
 * @param translateOnlyUzbekWords If true, only Uzbek-like words are transliterated
 */
export function convertUzbekText(
  text: string,
  translateOnlyUzbekWords: boolean = false
): string {
  const script = detectScript(text);
  if (script === "unknown") return text;

  return text
    .split(/(\s+)/) // keep spaces
    .map((token) => {
      if (token.trim() === "") return token;

      if (translateOnlyUzbekWords && !isUzbekWord(token)) {
        return token;
      }

      return script === "latin"
        ? latinToCyrillic(token)
        : cyrillicToLatin(token);
    })
    .join("");
}

