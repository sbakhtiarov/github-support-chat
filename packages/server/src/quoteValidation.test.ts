import { describe, expect, it } from "vitest";

import { validateCitations } from "./quoteValidation.js";

describe("validateCitations", () => {
  it("keeps only exact quote matches from retrieved chunks", () => {
    const sources = validateCitations(
      [
        {
          quote: "The Conversation tab of a pull request displays a description of the changes.",
          url: "https://docs.github.com/pull-requests"
        },
        {
          quote: "This sentence does not exist in the docs.",
          url: "https://docs.github.com/pull-requests"
        }
      ],
      [
        {
          chunkId: "chunk-1",
          repoPath: "content/pull-requests.md",
          pageTitle: "About pull requests",
          sectionTitle: "Working with pull requests",
          canonicalUrl: "https://docs.github.com/pull-requests",
          rawMarkdown: "",
          plainText:
            "The Conversation tab of a pull request displays a description of the changes."
        }
      ]
    );

    expect(sources).toEqual([
      {
        quote: "The Conversation tab of a pull request displays a description of the changes.",
        title: "About pull requests - Working with pull requests",
        url: "https://docs.github.com/pull-requests"
      }
    ]);
  });
});
