/**
 * Newsletter Draft Parser
 *
 * The `newsletter_issue` format adapter (convex/agents/formatAdapters.ts)
 * instructs the draft agent to emit a structured markdown body with these
 * H3 section headers in order:
 *
 *   ### SUBJECT
 *   ### PREVIEW
 *   ### INTRO
 *   ### MAIN STORY
 *   ### QUICK HITS
 *   ### CTA
 *
 * This helper splits that body into the parts an email tool needs (subject,
 * preview header, body) without losing any content if the model adds extra
 * sections or skips one. Pure function — unit-testable.
 */

export type NewsletterParts = {
  subject: string;
  preview: string;
  bodyMarkdown: string;
};

const KNOWN_SECTIONS = [
  "SUBJECT",
  "PREVIEW",
  "INTRO",
  "MAIN STORY",
  "QUICK HITS",
  "CTA",
];

/**
 * Parse a newsletter draft into subject + preview + body markdown.
 *
 * - `subject`: contents under `### SUBJECT`, single line, trimmed. Falls back
 *   to the first non-blank line of the draft if no SUBJECT header is found.
 * - `preview`: contents under `### PREVIEW`, single line, trimmed. Empty if
 *   none found.
 * - `bodyMarkdown`: everything from INTRO onward, with the `### INTRO`/etc.
 *   headers preserved so the rendered email keeps its structure.
 */
export function parseNewsletterDraft(content: string): NewsletterParts {
  const sections = splitBySectionHeaders(content);

  const subject = takeFirstLine(sections.SUBJECT) ||
    firstNonBlankLine(content) ||
    "";
  const preview = takeFirstLine(sections.PREVIEW) || "";

  // Body = everything from INTRO onward (in source order). If INTRO is missing
  // we fall back to "MAIN STORY", then to the whole draft minus subject/preview.
  const bodyOrder = ["INTRO", "MAIN STORY", "QUICK HITS", "CTA"];
  const bodyParts: string[] = [];
  for (const name of bodyOrder) {
    const block = sections[name];
    if (block && block.trim().length > 0) {
      bodyParts.push(`### ${name}\n${block.trim()}`);
    }
  }
  const bodyMarkdown = bodyParts.length > 0
    ? bodyParts.join("\n\n")
    : stripSubjectAndPreview(content).trim();

  return { subject: subject.trim(), preview: preview.trim(), bodyMarkdown };
}

/** Split a draft into a map of section name → body. Section names are H3 headers. */
function splitBySectionHeaders(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  // Match `### NAME` at the start of a line where NAME is one of the known
  // sections (case-insensitive).
  const headerRe = /^###\s+([A-Z][A-Z\s]+?)\s*$/gim;
  const matches: Array<{ name: string; start: number; end: number }> = [];
  for (const m of content.matchAll(headerRe)) {
    const name = m[1].trim().toUpperCase();
    if (!KNOWN_SECTIONS.includes(name)) continue;
    matches.push({ name, start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const next = matches[i + 1];
    const body = content.slice(cur.end, next ? next.start : content.length);
    out[cur.name] = body;
  }
  return out;
}

function takeFirstLine(block: string | undefined): string {
  if (!block) return "";
  for (const line of block.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return "";
}

function firstNonBlankLine(content: string): string {
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return "";
}

function stripSubjectAndPreview(content: string): string {
  return content
    .replace(/^###\s+SUBJECT[\s\S]*?(?=^###\s+|\z)/im, "")
    .replace(/^###\s+PREVIEW[\s\S]*?(?=^###\s+|\z)/im, "");
}
