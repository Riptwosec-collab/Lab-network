import { describe, expect, it } from "vitest";

import { academyCourses, academyLessons } from "@/data/academy";
import type { ProgressRecord } from "@/db/local-database";
import {
  calculateLevelProgress,
  findResumeLesson,
  isLessonUnlocked,
  progressMap,
  scoreQuiz,
} from "@/domain/academy/academy-engine";

const record = (id: string, progress: number, lastOpenedAt = "2026-07-19T00:00:00.000Z"): ProgressRecord => ({
  id,
  progress,
  lastOpenedAt,
  updatedAt: lastOpenedAt,
});

describe("academy content and progression", () => {
  it("loads all seven roadmap levels and 46 lessons", () => {
    expect(academyCourses).toHaveLength(7);
    expect(academyLessons).toHaveLength(46);
    expect(new Set(academyCourses.map((course) => course.level)).size).toBe(7);
  });

  it("keeps lesson content independent from the UI and complete", () => {
    academyLessons.forEach((lesson) => {
      expect(lesson.objectives.length).toBeGreaterThan(0);
      expect(lesson.sections.length).toBeGreaterThan(0);
      expect(lesson.diagram.nodes.length).toBeGreaterThan(1);
      expect(lesson.quiz.length).toBeGreaterThan(0);
      expect(lesson.relatedLabIds.length).toBeGreaterThan(0);
    });
  });

  it("locks a lesson until every prerequisite is complete", () => {
    const first = academyLessons[0];
    const second = academyLessons[1];
    expect(isLessonUnlocked(first, progressMap([]))).toBe(true);
    expect(isLessonUnlocked(second, progressMap([record(first.id, 99)]))).toBe(false);
    expect(isLessonUnlocked(second, progressMap([record(first.id, 100)]))).toBe(true);
  });

  it("scores quizzes deterministically", () => {
    const quiz = academyLessons[0].quiz;
    expect(scoreQuiz(quiz, { [quiz[0].id]: quiz[0].correctOption, [quiz[1].id]: -1 })).toBe(50);
    expect(scoreQuiz(quiz, { [quiz[0].id]: quiz[0].correctOption, [quiz[1].id]: quiz[1].correctOption })).toBe(100);
  });

  it("calculates level progress from persisted records", () => {
    const beginner = academyLessons.filter((lesson) => lesson.level === "Beginner");
    const records = progressMap([record(beginner[0].id, 100), record(beginner[1].id, 50)]);
    expect(calculateLevelProgress("Beginner", academyLessons, records)).toBe(15);
  });

  it("resumes the most recently opened unlocked incomplete lesson", () => {
    const first = academyLessons[0];
    const second = academyLessons[1];
    const records = progressMap([
      record(first.id, 80, "2026-07-19T02:00:00.000Z"),
      record(second.id, 20, "2026-07-19T01:00:00.000Z"),
    ]);
    expect(findResumeLesson(academyLessons, records)?.id).toBe(first.id);
  });
});
