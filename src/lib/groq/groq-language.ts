import { StreamLanguage } from "@codemirror/language";

const GROQ_KEYWORDS = new Set([
  "in",
  "match",
  "asc",
  "desc",
  "order",
  "select",
  "collate",
  "true",
  "false",
  "null",
  "and",
  "or",
  "not",
]);

const PUNCTUATION = new Set([
  "|", "+", "-", "*", "!", "<", ">", "=", "@", "^",
  ".", ",", ":", ";", "{", "}", "(", ")", "[", "]",
]);

export const groqLanguage = StreamLanguage.define({
  name: "groq",

  startState: () => ({}),

  token(stream) {
    if (stream.eatSpace()) return null;

    if (stream.match("//")) {
      stream.skipToEnd();
      return "comment";
    }

    if (stream.match(/^["']/)) {
      const quote = stream.current();
      while (!stream.eol()) {
        const ch = stream.next();
        if (ch === "\\") {
          stream.next();
        } else if (ch === quote) {
          break;
        }
      }
      return "string";
    }

    if (stream.match(/^-?\d+(\.\d+)?/)) return "number";

    if (stream.match(/^(==|!=|<=|>=|&&|\|\||\.\.|->)/)) return "operator";

    if (stream.match(/^[a-zA-Z_][a-zA-Z0-9_$-]*/)) {
      const word = stream.current();
      if (GROQ_KEYWORDS.has(word)) return "keyword";
      return "variableName";
    }

    const ch = stream.next();
    if (ch === "*" || ch === "@" || ch === "^") return "atom";
    if (ch && PUNCTUATION.has(ch)) return "operator";

    return null;
  },

  languageData: {
    commentTokens: { line: "//" },
    closeBrackets: { brackets: ["(", "[", "{", '"', "'"] },
  },
});
