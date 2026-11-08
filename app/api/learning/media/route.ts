import { cookies } from 'next/headers';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { learnerCookie, learnerFromToken, learningAccount, learningDemoEnabled } from '@/app/lib/learningStore.server';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  if (!learningDemoEnabled()) return new Response(null, { status: 404 });
  const user = learnerFromToken((await cookies()).get(learnerCookie)?.value);
  if (!user) return new Response(null, { status: 401 });
  const query = new URL(request.url).searchParams;
  const course = learningAccount(user).courses.find((item) => item.id === query.get('course'));
  const lesson = course?.lessons.find((item) => item.id === query.get('lesson'));
  if (!course?.paid || !lesson) return new Response(null, { status: 403 });
  const file = await readFile(path.join(process.cwd(), 'assets', 'learning', `${lesson.id}.mp4`));
  const headers = { 'Content-Type': 'video/mp4', 'Cache-Control': 'private, no-store', 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff' };
  const range = request.headers.get('range');
  if (!range) return new Response(file, { headers: { ...headers, 'Content-Length': String(file.length) } });
  const match = /^bytes=(\d+)-(\d*)$/.exec(range);
  const start = match ? Number(match[1]) : -1;
  const end = match?.[2] ? Math.min(Number(match[2]), file.length - 1) : file.length - 1;
  if (start < 0 || start >= file.length || end < start) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${file.length}` } });
  return new Response(file.subarray(start, end + 1), { status: 206, headers: { ...headers, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${file.length}` } });
}
