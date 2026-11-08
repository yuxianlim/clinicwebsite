import type { Metadata } from 'next';
import LearningWorkspace from './LearningWorkspace';

export const metadata: Metadata = { title: 'Demo learning | Whitewater University of California', robots: { index: false, follow: false } };
export default function LearningPage() { return <LearningWorkspace />; }
