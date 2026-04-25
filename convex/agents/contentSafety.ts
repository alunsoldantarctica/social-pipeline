const COMPETITOR_PATTERNS = [
  /squaremouth(?:\.com)?/gi,
  /insuremytrip(?:\.com)?/gi,
  /travelinsurance\.com/gi,
  /visitorscoverage(?:\.com)?/gi,
  /world\s*nomads(?:\.com)?/gi,
  /safetywing(?:\.com)?/gi,
  /travelex(?:[-\s]?insurance)?(?:\.com)?/gi,
  /imglobal\.com/gi,
];

const COMPETITOR_LINK_PATTERNS = [
  /squaremouth\.com/gi,
  /insuremytrip\.com/gi,
  /travelinsurance\.com/gi,
  /visitorscoverage\.com/gi,
  /worldnomads\.com/gi,
  /safetywing\.com/gi,
  /travelex[-\s]?insurance\.com/gi,
  /imglobal\.com/gi,
];

const PLACEHOLDER_TOKEN_PATTERN =
  /\[(?:Current Date|Current Year|Current Month|Year|Month|Date|Author Name|Insert [^\]]+|TODO|TBD)\]/gi;

const PROMPT_INJECTION_PATTERNS = [
  /ignore (?:all )?(?:previous|prior|above) instructions/gi,
  /disregard (?:all )?(?:previous|prior|above) instructions/gi,
  /system prompt/gi,
  /developer message/gi,
  /you are now/gi,
  /act as (?:an?|the)/gi,
  /reveal (?:your|the) instructions/gi,
];

function testPattern(pattern: RegExp, value: string) {
  pattern.lastIndex = 0;
  return pattern.test(value);
}

export interface DraftSafetyResult {
  blockingErrors: string[];
  warnings: string[];
}

export function stripLeadingH1(markdown: string): string {
  // Remove a single leading H1 if the writer emitted one despite the prompt.
  return markdown.replace(/^\s*#\s+[^\n]+\n+/, "");
}

export function substituteDateTokens(
  markdown: string,
  now = new Date(),
): { content: string; substituted: number } {
  const year = String(now.getFullYear());
  const month = now.toLocaleDateString("en-US", { month: "long" });
  const longDate = now.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const tokens: Array<[RegExp, string]> = [
    [/\[Current Date\]/gi, longDate],
    [/\[Current Year\]/gi, year],
    [/\[Current Month\]/gi, month],
    [/\[Year\]/gi, year],
    [/\[Month\]/gi, month],
    [/\[Date\]/gi, longDate],
  ];
  let count = 0;
  let out = markdown;
  for (const [re, value] of tokens) {
    out = out.replace(re, () => {
      count += 1;
      return value;
    });
  }
  return { content: out, substituted: count };
}

export function stripCompetitorLinks(markdown: string): {
  content: string;
  stripped: number;
} {
  let count = 0;
  let out = markdown;

  out = out.replace(/\[([^\]]+)\]\(https?:\/\/([^)]+)\)/g, (match, text, url) => {
    if (COMPETITOR_LINK_PATTERNS.some((p) => testPattern(p, url))) {
      count += 1;
      return text;
    }
    return match;
  });

  out = out.replace(/<https?:\/\/([^>]+)>/g, (match, url) => {
    if (COMPETITOR_LINK_PATTERNS.some((p) => testPattern(p, url))) {
      count += 1;
      return "";
    }
    return match;
  });

  return { content: out, stripped: count };
}

export function sanitizePromptInput(input: string, maxChars = 8_000): string {
  let out = input.slice(0, maxChars);
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    out = out.replace(pattern, "[removed instruction-like text]");
  }
  return out;
}

export function userContentBlock(label: string, value: string): string {
  return `<${label}>
${sanitizePromptInput(value)}
</${label}>`;
}

export function validateDraftForPublication(markdown: string): DraftSafetyResult {
  const blockingErrors: string[] = [];
  const warnings: string[] = [];

  if (/^\s*#\s+/m.test(markdown)) {
    blockingErrors.push("Draft contains an H1 heading; article bodies must start below the page title.");
  }

  const placeholderMatches = markdown.match(PLACEHOLDER_TOKEN_PATTERN);
  if (placeholderMatches?.length) {
    blockingErrors.push(`Draft still contains placeholder token(s): ${Array.from(new Set(placeholderMatches)).join(", ")}`);
  }

  for (const pattern of COMPETITOR_PATTERNS) {
    const matches = markdown.match(pattern);
    if (matches?.length) {
      blockingErrors.push(`Draft mentions blocked competitor marketplace term(s): ${Array.from(new Set(matches)).join(", ")}`);
      break;
    }
  }

  if (!/\[\^\d+\]/.test(markdown)) {
    warnings.push("Draft has no footnote citations.");
  }
  if (!/\n## Sources\s*\n/i.test(markdown)) {
    warnings.push("Draft is missing a final Sources section.");
  }

  return { blockingErrors, warnings };
}

export function sanitizeDraft(markdown: string): {
  content: string;
  warnings: string[];
} {
  const warnings: string[] = [];
  let content = stripLeadingH1(markdown);
  const dates = substituteDateTokens(content);
  content = dates.content;
  if (dates.substituted > 0) {
    warnings.push(`Substituted ${dates.substituted} date placeholder token(s)`);
  }
  const comps = stripCompetitorLinks(content);
  content = comps.content;
  if (comps.stripped > 0) {
    warnings.push(`Stripped ${comps.stripped} competitor link(s)`);
  }
  return { content, warnings };
}
