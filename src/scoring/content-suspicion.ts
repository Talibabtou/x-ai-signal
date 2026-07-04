export type SuspicionLevel = 'unknown' | 'low' | 'medium' | 'high';

export type SuspicionResult = {
  level: SuspicionLevel;
  reasons: string[];
};

const MINIMUM_CHARACTERS = 60;
const MINIMUM_WORDS = 12;

const FORMULAIC_PHRASES = [
  /\bhere(?:'|’)s the thing\b/gi,
  /\blet(?:'|’)s break (?:it|this) down\b/gi,
  /\bthe key takeaway\b/gi,
  /\bit(?:'|’)s important to (?:remember|note|understand)\b/gi,
  /\bat the end of the day\b/gi,
  /\bin today(?:'|’)s (?:fast-paced|digital) world\b/gi,
];

const CONTRAST_PATTERNS = [
  /\bnot (?:just|only)\b[^.!?\n]{1,120}\bbut (?:also )?\b/gi,
  /\b(?:isn(?:'|’)t|is not|wasn(?:'|’)t|was not) just\b[^.!?\n]{1,120}\bit(?:'|’)s\b/gi,
  /\bthe (?:real|bigger) (?:issue|question|problem) (?:is|isn(?:'|’)t)\b/gi,
];

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => count + Array.from(text.matchAll(pattern)).length, 0);
}

function hasStructuredSequence(text: string): boolean {
  const lines = text.split(/\r?\n/);
  const listItems = lines.filter((line) => /^\s*(?:[-•▪◦]|\d+[.)])\s+\S/u.test(line)).length;
  const sequenceMarkers = Array.from(
    text.matchAll(/(?:^|[.!?]\s+)(?:first(?:ly)?|second(?:ly)?|third(?:ly)?|finally),/gi),
  ).length;

  return listItems >= 3 || sequenceMarkers >= 3;
}

export function scoreContentSuspicion(text: string | null): SuspicionResult {
  const normalizedText = text?.replace(/\s+/g, ' ').trim() ?? '';
  const wordCount = normalizedText ? normalizedText.split(/\s+/u).length : 0;

  if (Array.from(normalizedText).length < MINIMUM_CHARACTERS || wordCount < MINIMUM_WORDS) {
    return {
      level: 'unknown',
      reasons: ['Not enough text for a useful content-only score.'],
    };
  }

  let points = 0;
  const reasons: string[] = [];

  if (countMatches(text ?? '', FORMULAIC_PHRASES) >= 2) {
    points += 2;
    reasons.push('Contains several formulaic phrases.');
  }

  if (hasStructuredSequence(text ?? '')) {
    points += 1;
    reasons.push('Uses a strongly structured list or sequence.');
  }

  if (countMatches(text ?? '', CONTRAST_PATTERNS) >= 2) {
    points += 1;
    reasons.push('Repeats contrast-based sentence framing.');
  }

  if (points === 0) {
    return {
      level: 'low',
      reasons: ['No configured writing-pattern signals were found.'],
    };
  }

  return {
    level: points >= 3 ? 'high' : points >= 2 ? 'medium' : 'low',
    reasons,
  };
}
