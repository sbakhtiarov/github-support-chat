import type { SourceItem } from "@github-support-chat/shared";

import type { GithubDocChunk } from "./mcpClient.js";
import type { ModelCitationDraft } from "./openAiGateway.js";

function buildSourceTitle(chunk: GithubDocChunk) {
  return chunk.sectionTitle
    ? `${chunk.pageTitle} - ${chunk.sectionTitle}`
    : chunk.pageTitle;
}

export function validateCitations(
  citations: ModelCitationDraft[],
  chunks: GithubDocChunk[]
): SourceItem[] {
  const sources: SourceItem[] = [];
  const seen = new Set<string>();

  for (const citation of citations) {
    const quote = citation.quote.trim();
    if (!quote) {
      continue;
    }

    const matchingChunk = chunks.find((chunk) => {
      const urlMatches =
        citation.url.trim().length === 0 || citation.url === chunk.canonicalUrl;

      return urlMatches && chunk.plainText.includes(quote);
    });

    if (!matchingChunk) {
      continue;
    }

    const sourceKey = `${matchingChunk.canonicalUrl}::${quote}`;
    if (seen.has(sourceKey)) {
      continue;
    }

    seen.add(sourceKey);
    sources.push({
      title: buildSourceTitle(matchingChunk),
      url: matchingChunk.canonicalUrl,
      quote
    });
  }

  return sources;
}
