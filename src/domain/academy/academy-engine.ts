import type { ProgressRecord } from "@/db/local-database";
import type { AcademyLesson, AcademyLevel, LessonQuizQuestion } from "@/types/academy";

export function progressMap(records: readonly ProgressRecord[]): ReadonlyMap<string, ProgressRecord> {
  return new Map(records.map((record) => [record.id, record]));
}

export function isLessonUnlocked(lesson: AcademyLesson, records: ReadonlyMap<string, ProgressRecord>): boolean {
  return lesson.prerequisites.every((id) => (records.get(id)?.progress ?? 0) >= 100);
}

export function scoreQuiz(quiz: readonly LessonQuizQuestion[], answers: Readonly<Record<string, number>>): number {
  if (!quiz.length) return 100;
  const correct = quiz.filter((question) => answers[question.id] === question.correctOption).length;
  return Math.round((correct / quiz.length) * 100);
}

export function calculateLevelProgress(
  level: AcademyLevel,
  lessons: readonly AcademyLesson[],
  records: ReadonlyMap<string, ProgressRecord>,
): number {
  const levelLessons = lessons.filter((lesson) => lesson.level === level);
  if (!levelLessons.length) return 0;
  return Math.round(
    levelLessons.reduce((total, lesson) => total + Math.min(100, records.get(lesson.id)?.progress ?? 0), 0) /
      levelLessons.length,
  );
}

export function findResumeLesson(
  lessons: readonly AcademyLesson[],
  records: ReadonlyMap<string, ProgressRecord>,
): AcademyLesson | undefined {
  const resumable = lessons
    .filter((lesson) => {
      const progress = records.get(lesson.id)?.progress ?? 0;
      return progress > 0 && progress < 100 && isLessonUnlocked(lesson, records);
    })
    .sort((a, b) => (records.get(b.id)?.lastOpenedAt ?? "").localeCompare(records.get(a.id)?.lastOpenedAt ?? ""));
  return resumable[0] ?? lessons.find((lesson) => !records.has(lesson.id) && isLessonUnlocked(lesson, records));
}
