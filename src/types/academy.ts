export const academyLevels = [
  "Beginner",
  "Foundation",
  "Intermediate",
  "Advanced",
  "Professional",
  "Specialist",
  "Expert",
] as const;

export type AcademyLevel = (typeof academyLevels)[number];

export interface LessonSection {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

export interface LessonQuizQuestion {
  readonly id: string;
  readonly prompt: string;
  readonly options: readonly string[];
  readonly correctOption: number;
  readonly explanation: string;
}

export interface AcademyLesson {
  readonly id: string;
  readonly title: string;
  readonly titleTh: string;
  readonly level: AcademyLevel;
  readonly objectives: readonly string[];
  readonly prerequisites: readonly string[];
  readonly sections: readonly LessonSection[];
  readonly diagram: {
    readonly title: string;
    readonly nodes: readonly string[];
    readonly flow: string;
  };
  readonly example: string;
  readonly interactiveDemo: string;
  readonly glossary: readonly { readonly term: string; readonly meaning: string }[];
  readonly commonMistakes: readonly string[];
  readonly quiz: readonly LessonQuizQuestion[];
  readonly relatedLabIds: readonly string[];
  readonly estimatedMinutes: number;
}

export interface AcademyCourse {
  readonly id: string;
  readonly title: string;
  readonly titleTh: string;
  readonly level: AcademyLevel;
  readonly summary: string;
  readonly lessons: readonly AcademyLesson[];
}
