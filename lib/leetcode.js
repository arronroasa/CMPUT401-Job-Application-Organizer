// Company-to-questions index over the vendored LeetCode Patterns dataset.
//
// The vendored file is question-centric (each question lists its companies).
// We build the company index once, in memory, the first time it is needed.

import dataset from './leetcodeQuestions.json';

let companyIndex = null; // Map<companyName, question[]> sorted by frequency desc

function build() {
  const index = new Map();
  for (const q of dataset.data) {
    for (const c of q.companies || []) {
      if (!index.has(c.name)) index.set(c.name, []);
      index.get(c.name).push({
        id: q.id,
        title: q.title,
        slug: q.slug,
        difficulty: q.difficulty,
        patterns: q.pattern || [],
        premium: q.premium,
        frequency: c.frequency,
      });
    }
  }
  for (const list of index.values()) list.sort((a, b) => b.frequency - a.frequency);
  companyIndex = index;
}

function getIndex() {
  if (!companyIndex) build();
  return companyIndex;
}

export const datasetUpdated = dataset.updated;

// All company names, sorted alphabetically (case-insensitive).
export function getCompanies() {
  return [...getIndex().keys()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

// Questions for one company, most-asked first. Empty array if unknown.
export function getQuestionsForCompany(name) {
  return getIndex().get(name) || [];
}

// leetcode.com problem URL for a question slug.
export function leetcodeUrl(slug) {
  return `https://leetcode.com/problems/${slug}/`;
}
