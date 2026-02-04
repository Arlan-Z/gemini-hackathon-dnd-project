export class JsonParseError extends Error {
  public readonly rawText: string;

  constructor(message: string, rawText: string) {
    super(message);
    this.name = "JsonParseError";
    this.rawText = rawText;
  }
}

const stripCodeFences = (text: string) =>
  text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

const extractJsonCandidate = (text: string) => {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }

  const firstBracket = text.indexOf("[");
  const lastBracket = text.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    return text.slice(firstBracket, lastBracket + 1);
  }

  return text;
};

export const parseJsonWithCleanup = <T>(rawText: string): T => {
  const cleaned = stripCodeFences(rawText);

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const fallback = extractJsonCandidate(cleaned);
    try {
      return JSON.parse(fallback) as T;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown JSON parse error";
      throw new JsonParseError(message, rawText);
    }
  }
};
