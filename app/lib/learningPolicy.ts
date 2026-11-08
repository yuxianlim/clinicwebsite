export const learningOrganizer = 'Whitewater University of California';
export const retryWaitMs = 7 * 24 * 60 * 60 * 1000;
export const attemptsPerBlock = 3;
export const passingPercent = 90;

/** The original price is fixed at the first purchase, in USD cents. */
export const learningBlockPrice = (originalPrice: number, block: number) => {
  if (!Number.isSafeInteger(originalPrice) || originalPrice < 1 || !Number.isSafeInteger(block) || block < 1)
    throw new Error('Invalid course price or attempt block.');
  return block === 2 ? Math.round(originalPrice / 2) : originalPrice;
};

export type LearningCourse = {
  id: string; title: string; description: string; price: number;
  lessons: { id: string; title: string; seconds: number; transcript: string }[];
  questions: { prompt: string; options: string[] }[];
};
export type LearningCourseState = LearningCourse & {
  block: number; nextPrice: number; attemptsUsed: number; lastScore: number | null;
  purchaseId: string | null; paid: boolean; watched: Record<string, number>;
  retryAt: string | null; certificateId: string | null;
};
export type LearningAccount = {
  user: { id: string; name: string; email: string };
  courses: LearningCourseState[];
  payments: { id: string; courseTitle: string; block: number; amount: number; paidAt: string | null }[];
};
