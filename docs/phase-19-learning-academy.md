# Phase 19 — Learning Academy

Phase 19 replaces the Academy placeholder with a stateful, Thai-first learning system.

## Content architecture

- `src/data/academy.ts` contains seven courses and all 46 roadmap lessons.
- `src/types/academy.ts` defines lessons, sections, diagrams, examples, demos, glossary, mistakes, quizzes and related labs.
- `src/domain/academy/academy-engine.ts` owns prerequisite, scoring, level-progress and resume rules. The UI never embeds course content or scoring rules.

## Learner experience

- Academy dashboard with per-level progress and course cards
- Sequential prerequisite locks from Beginner through Expert
- Lesson viewer with table of contents, diagrams and interactive workspace links
- Quiz scoring, bookmarks, completion and Continue Learning
- Progress, current section, score and bookmark state persisted in IndexedDB

## Verification

- Unit tests cover course loading, content completeness, locks, scoring, progress and resume selection.
- Browser coverage verifies IndexedDB resume, quiz scoring, bookmark persistence and prerequisite unlock behavior.
