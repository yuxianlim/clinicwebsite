import type { LearningCourse } from './learningPolicy';

// Development content only. No medical instruction, accreditation or CE credit.
export const demoCourses: LearningCourse[] = [
  ['demo-course-orientation', 'Learning workspace orientation', 'Explore your course, payment record and completion journey.', 9500],
  ['demo-records', 'Learning records and certificates', 'Practice finding your course history and sample completion document.', 10500],
  ['demo-assessment', 'Final assessment practice', 'Try the exam, retry and repeat-purchase workflow with fictional content.', 9000],
].map(([id, title, description, price]) => ({
  id: String(id), title: String(title), description: String(description), price: Number(price),
  lessons: [
    { id: 'orientation', title: 'Welcome to the demo', seconds: 12,
      transcript: 'This is a fictional demonstration, not approved CE credit. Whitewater University of California is the requested organizer display name. Complete every required video before the final exam. Your progress belongs to your signed-in account.' },
    { id: 'assessment', title: 'How completion works', seconds: 12,
      transcript: 'The final exam has ten questions. Pass with 90 percent or higher. Each paid block provides three attempts. After three failures, wait seven days. The second block costs 50 percent of the original price; every later block costs 100 percent. Each new block requires watching all videos again. Demo certificates do not award CE credit.' },
  ],
  questions: [
    { prompt: 'What kind of course is this?', options: ['An approved clinical CE course', 'A fictional demonstration', 'A licensing examination'] },
    { prompt: 'What is the minimum passing score?', options: ['70%', '80%', '90%'] },
    { prompt: 'How much of every required video must be watched?', options: ['100%', '50%', 'Only the introduction'] },
    { prompt: 'How many final-exam attempts does a paid block include?', options: ['One', 'Three', 'Unlimited'] },
    { prompt: 'When does the seven-day wait begin?', options: ['After every answer', 'After the first failure', 'After all three attempts fail'] },
    { prompt: 'What does the second paid block cost?', options: ['50% of the original price', 'Nothing', 'Double the original price'] },
    { prompt: 'What does each block after the second cost?', options: ['25% of the original price', '100% of the original price', 'Nothing'] },
    { prompt: 'What must happen after buying a new attempt block?', options: ['Skip directly to the exam', 'Use another account', 'Watch every required video again'] },
    { prompt: 'Does this demo certificate award approved CE credit?', options: ['No', 'Yes', 'Only if printed'] },
    { prompt: 'Where are your course and payment records available?', options: ['Another learner’s account', 'Your signed-in learning account', 'The public kiosk'] },
  ],
}));

// Kept in a server-only module; answers are never included in API course payloads.
export const demoAnswerKey = [1, 2, 0, 1, 2, 0, 1, 2, 0, 1];
