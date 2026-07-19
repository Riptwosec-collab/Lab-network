"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  BookOpen,
  CheckCircle2,
  Clock3,
  FlaskConical,
  GraduationCap,
  LockKeyhole,
  Network,
  Play,
  RotateCcw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { academyCourses, academyLessons } from "@/data/academy";
import { labs } from "@/data/labs";
import { db, type ProgressRecord } from "@/db/local-database";
import {
  calculateLevelProgress,
  findResumeLesson,
  isLessonUnlocked,
  progressMap,
  scoreQuiz,
} from "@/domain/academy/academy-engine";
import { academyLevels, type AcademyLesson } from "@/types/academy";

async function saveProgress(id: string, patch: Partial<ProgressRecord>) {
  const previous = await db.learningProgress.get(id);
  await db.learningProgress.put({
    id,
    progress: previous?.progress ?? 0,
    ...previous,
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

function ProgressBar({ value }: { readonly value: number }) {
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <div className="bg-muted h-2 overflow-hidden rounded-full" aria-label={`ความคืบหน้า ${safeValue}%`}>
      <div className="bg-primary h-full rounded-full transition-[width]" style={{ width: `${safeValue}%` }} />
    </div>
  );
}

interface LessonViewerProps {
  readonly lesson: AcademyLesson;
  readonly record?: ProgressRecord;
  readonly onBack: () => void;
  readonly onOpenLesson: (lesson: AcademyLesson) => void;
}

function LessonViewer({ lesson, record, onBack, onOpenLesson }: LessonViewerProps) {
  const [sectionIndex, setSectionIndex] = useState(record?.currentSection ?? 0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submittedScore, setSubmittedScore] = useState<number | undefined>(record?.quizScore);
  const relatedLabs = labs.filter((lab) => lesson.relatedLabIds.includes(lab.id));
  const lessonIndex = academyLessons.findIndex((item) => item.id === lesson.id);
  const nextLesson = academyLessons[lessonIndex + 1];

  const selectSection = async (index: number) => {
    setSectionIndex(index);
    const sectionProgress = Math.min(80, Math.round(((index + 1) / lesson.sections.length) * 80));
    await saveProgress(lesson.id, {
      currentSection: index,
      progress: Math.max(record?.progress ?? 0, sectionProgress),
      lastOpenedAt: new Date().toISOString(),
    });
  };

  const submitQuiz = async () => {
    const result = scoreQuiz(lesson.quiz, answers);
    setSubmittedScore(result);
    await saveProgress(lesson.id, {
      quizScore: result,
      progress: Math.max(record?.progress ?? 0, result >= 70 ? 90 : 80),
      lastOpenedAt: new Date().toISOString(),
    });
  };

  const completeLesson = async () => {
    const now = new Date().toISOString();
    await saveProgress(lesson.id, { progress: 100, completedAt: now, lastOpenedAt: now });
  };

  const toggleBookmark = async () => {
    await saveProgress(lesson.id, {
      bookmarked: !record?.bookmarked,
      lastOpenedAt: new Date().toISOString(),
    });
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft /> กลับ Academy
        </Button>
        <Button variant="outline" onClick={toggleBookmark} aria-pressed={record?.bookmarked ?? false}>
          {record?.bookmarked ? <BookmarkCheck /> : <Bookmark />}
          {record?.bookmarked ? "บันทึกแล้ว" : "Bookmark"}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader>
              <Badge className="w-fit">{lesson.level}</Badge>
              <CardTitle className="mt-2 text-lg">สารบัญบทเรียน</CardTitle>
              <CardDescription>
                {lesson.estimatedMinutes} นาที · {lesson.sections.length} หัวข้อ
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {lesson.sections.map((section, index) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => void selectSection(index)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    sectionIndex === index ? "border-primary bg-primary/8 text-primary" : "border-border hover:bg-muted"
                  }`}
                >
                  {index + 1}. {section.title}
                </button>
              ))}
              <ProgressBar value={record?.progress ?? 0} />
              <p className="text-muted-foreground text-xs">บันทึกใน IndexedDB · {record?.progress ?? 0}%</p>
            </CardContent>
          </Card>
        </aside>

        <article className="min-w-0 space-y-6" data-testid="lesson-viewer">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{lesson.level}</Badge>
              <span className="text-muted-foreground flex items-center gap-1 text-sm">
                <Clock3 className="size-4" /> {lesson.estimatedMinutes} นาที
              </span>
            </div>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">{lesson.title}</h1>
            <p className="text-muted-foreground mt-2">{lesson.titleTh}</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>เป้าหมายการเรียนรู้</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {lesson.objectives.map((objective) => (
                  <li key={objective} className="flex gap-2 text-sm">
                    <CheckCircle2 className="text-primary mt-0.5 size-4 shrink-0" />
                    {objective}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{lesson.sections[sectionIndex]?.title}</CardTitle>
              <CardDescription>
                ส่วนที่ {sectionIndex + 1} จาก {lesson.sections.length}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="leading-8">{lesson.sections[sectionIndex]?.body}</p>
              <div className="mt-5 flex justify-between gap-3">
                <Button
                  variant="outline"
                  disabled={sectionIndex === 0}
                  onClick={() => void selectSection(sectionIndex - 1)}
                >
                  ก่อนหน้า
                </Button>
                <Button
                  disabled={sectionIndex === lesson.sections.length - 1}
                  onClick={() => void selectSection(sectionIndex + 1)}
                >
                  หัวข้อถัดไป <ArrowRight />
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card className="technical-grid">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Network className="text-primary" />
                  {lesson.diagram.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center gap-2">
                  {lesson.diagram.nodes.map((node, index) => (
                    <div key={node} className="contents">
                      <span className="bg-background border-primary/30 rounded-lg border px-3 py-2 text-sm">
                        {node}
                      </span>
                      {index < lesson.diagram.nodes.length - 1 ? <ArrowRight className="text-primary size-4" /> : null}
                    </div>
                  ))}
                </div>
                <code className="text-muted-foreground mt-4 block text-xs">{lesson.diagram.flow}</code>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>ตัวอย่างสถานการณ์</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-7">{lesson.example}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-primary/25 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Play className="text-primary" />
                Interactive Demo
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-7">{lesson.interactiveDemo}</p>
              <Button asChild className="shrink-0">
                <Link href="/workspace?project=demo-project">
                  เปิด Demo <ArrowRight />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Glossary</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-3">
                  {lesson.glossary.map((item) => (
                    <div key={item.term}>
                      <dt className="font-mono text-sm font-semibold">{item.term}</dt>
                      <dd className="text-muted-foreground mt-1 text-sm">{item.meaning}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>ข้อผิดพลาดที่พบบ่อย</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {lesson.commonMistakes.map((mistake) => (
                    <li key={mistake}>— {mistake}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Quiz</CardTitle>
              <CardDescription>ผ่านเมื่อได้อย่างน้อย 70%</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {lesson.quiz.map((question, questionIndex) => (
                <fieldset key={question.id} className="space-y-3">
                  <legend className="font-medium">
                    {questionIndex + 1}. {question.prompt}
                  </legend>
                  {question.options.map((option, optionIndex) => (
                    <label
                      key={option}
                      className="border-border hover:bg-muted flex cursor-pointer gap-3 rounded-lg border p-3 text-sm"
                    >
                      <input
                        type="radio"
                        name={question.id}
                        checked={answers[question.id] === optionIndex}
                        onChange={() => setAnswers((current) => ({ ...current, [question.id]: optionIndex }))}
                      />
                      {option}
                    </label>
                  ))}
                </fieldset>
              ))}
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => void submitQuiz()} disabled={Object.keys(answers).length !== lesson.quiz.length}>
                  ตรวจคำตอบ
                </Button>
                {submittedScore !== undefined ? (
                  <Badge variant={submittedScore >= 70 ? "success" : "warning"}>คะแนน {submittedScore}%</Badge>
                ) : null}
              </div>
              {submittedScore !== undefined ? (
                <p className="text-muted-foreground text-sm">
                  {submittedScore >= 70 ? "ผ่านเกณฑ์แล้ว คุณสามารถจบบทเรียนได้" : "ทบทวนเนื้อหาแล้วลองอีกครั้ง"}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FlaskConical className="text-primary" />
                Related Labs
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {relatedLabs.map((lab) => (
                <Button key={lab.id} asChild variant="outline">
                  <Link href={`/workspace?project=demo-project&lab=${lab.id}`}>
                    {lab.title}
                    <ArrowRight />
                  </Link>
                </Button>
              ))}
            </CardContent>
          </Card>

          <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t pt-6">
            <Button
              variant="outline"
              onClick={() => {
                setAnswers({});
                setSubmittedScore(undefined);
              }}
            >
              <RotateCcw />
              ทำ Quiz ใหม่
            </Button>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => void completeLesson()} disabled={(submittedScore ?? 0) < 70}>
                <CheckCircle2 />
                จบบทเรียน
              </Button>
              {record?.progress === 100 && nextLesson ? (
                <Button onClick={() => onOpenLesson(nextLesson)}>
                  บทเรียนถัดไป <ArrowRight />
                </Button>
              ) : null}
            </div>
          </div>
        </article>
      </div>
    </main>
  );
}

export function AcademyClient() {
  const records = useLiveQuery(() => db.learningProgress.toArray(), [], []);
  const [selectedLessonId, setSelectedLessonId] = useState<string>();
  const recordsById = useMemo(() => progressMap(records ?? []), [records]);
  const selectedLesson = academyLessons.find((lesson) => lesson.id === selectedLessonId);
  const resumeLesson = findResumeLesson(academyLessons, recordsById);
  const completedLessons = academyLessons.filter((lesson) => (recordsById.get(lesson.id)?.progress ?? 0) >= 100).length;

  const openLesson = async (lesson: AcademyLesson) => {
    if (!isLessonUnlocked(lesson, recordsById)) return;
    await saveProgress(lesson.id, {
      progress: Math.max(1, recordsById.get(lesson.id)?.progress ?? 0),
      lastOpenedAt: new Date().toISOString(),
    });
    setSelectedLessonId(lesson.id);
  };

  if (selectedLesson) {
    return (
      <LessonViewer
        key={selectedLesson.id}
        lesson={selectedLesson}
        record={recordsById.get(selectedLesson.id)}
        onBack={() => setSelectedLessonId(undefined)}
        onOpenLesson={(lesson) => void openLesson(lesson)}
      />
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 lg:px-8 lg:py-10">
      <Badge>
        <GraduationCap className="mr-1 size-3" />
        NETLAB ACADEMY
      </Badge>
      <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">
            เรียน Network จาก <span className="text-primary">Beginner ถึง Expert</span>
          </h1>
          <p className="text-muted-foreground mt-3 max-w-3xl leading-7">
            บทเรียนภาษาไทยที่เชื่อมแนวคิดกับ packet flow, topology และ Lab จริง พร้อมบันทึกความคืบหน้าในเครื่องของคุณ
          </p>
        </div>
        {resumeLesson ? (
          <Button size="lg" onClick={() => void openLesson(resumeLesson)}>
            <Play />
            เรียนต่อ: {resumeLesson.title}
          </Button>
        ) : null}
      </div>

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-sm">เส้นทางการเรียน</p>
            <p className="mt-1 text-3xl font-semibold">7 LEVELS</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-sm">บทเรียนทั้งหมด</p>
            <p className="mt-1 text-3xl font-semibold">{academyLessons.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-sm">เรียนจบแล้ว</p>
            <p className="mt-1 text-3xl font-semibold">
              {completedLessons}/{academyLessons.length}
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="mt-10">
        <div className="mb-4 flex items-center gap-2">
          <BookOpen className="text-primary" />
          <h2 className="text-2xl font-semibold">Level Progress</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {academyLevels.map((level) => {
            const value = calculateLevelProgress(level, academyLessons, recordsById);
            return (
              <Card key={level}>
                <CardContent className="pt-5">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="font-medium">{level}</span>
                    <Badge variant={value === 100 ? "success" : "outline"}>{value}%</Badge>
                  </div>
                  <ProgressBar value={value} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="mt-10 space-y-6">
        <h2 className="text-2xl font-semibold">หลักสูตรทั้งหมด</h2>
        {academyCourses.map((course, courseIndex) => {
          const courseProgress = calculateLevelProgress(course.level, academyLessons, recordsById);
          return (
            <Card key={course.id} className="overflow-hidden">
              <CardHeader className="border-border border-b lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge>{course.level}</Badge>
                    <span className="text-muted-foreground font-mono text-xs">
                      COURSE {String(courseIndex + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <CardTitle className="mt-3">{course.titleTh}</CardTitle>
                  <CardDescription className="mt-1">{course.summary}</CardDescription>
                </div>
                <div className="mt-4 min-w-48 lg:mt-0">
                  <div className="mb-2 flex justify-between text-xs">
                    <span>ความคืบหน้า</span>
                    <span>{courseProgress}%</span>
                  </div>
                  <ProgressBar value={courseProgress} />
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 pt-5 md:grid-cols-2 xl:grid-cols-3">
                {course.lessons.map((lesson, index) => {
                  const unlocked = isLessonUnlocked(lesson, recordsById);
                  const progress = recordsById.get(lesson.id)?.progress ?? 0;
                  return (
                    <button
                      key={lesson.id}
                      type="button"
                      disabled={!unlocked}
                      onClick={() => void openLesson(lesson)}
                      className="border-border enabled:hover:border-primary/50 enabled:hover:bg-primary/5 flex min-h-24 items-start gap-3 rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55"
                      aria-label={`${unlocked ? "เริ่มบทเรียน" : "ล็อกบทเรียน"} ${lesson.title}`}
                    >
                      <span className="bg-muted grid size-9 shrink-0 place-items-center rounded-lg">
                        {progress === 100 ? (
                          <CheckCircle2 className="size-4 text-emerald-500" />
                        ) : unlocked ? (
                          <BookOpen className="text-primary size-4" />
                        ) : (
                          <LockKeyhole className="size-4" />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-medium">
                          {index + 1}. {lesson.title}
                        </span>
                        <span className="text-muted-foreground mt-1 block text-xs">
                          {lesson.estimatedMinutes} นาที ·{" "}
                          {progress ? `${progress}%` : unlocked ? "พร้อมเรียน" : "ต้องเรียนบทก่อนหน้า"}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </section>
    </main>
  );
}
