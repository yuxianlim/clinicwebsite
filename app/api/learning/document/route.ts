import { cookies } from 'next/headers';
import { learnerCookie, learnerFromToken, learningDemoEnabled, learningDocument } from '@/app/lib/learningStore.server';
import { learningOrganizer } from '@/app/lib/learningPolicy';

export const runtime = 'nodejs';
const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
export async function GET(request: Request) {
  if (!learningDemoEnabled()) return new Response(null, { status: 404 });
  const user = learnerFromToken((await cookies()).get(learnerCookie)?.value);
  if (!user) return new Response(null, { status: 401 });
  const query = new URL(request.url).searchParams;
  try {
    const document = learningDocument(user.id, query.get('kind') ?? '', query.get('id') ?? '');
    const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(document.title)}</title><style>body{font:18px system-ui;color:#172336;background:#f6f5f1;padding:5vw}main{max-width:850px;margin:auto;border:2px solid #3158d8;background:white;padding:6vw;overflow-wrap:anywhere}small{color:#3158d8}h1{font-size:clamp(26px,5vw,44px)}@media print{body{padding:0;background:white}main{border:2px solid #3158d8}}</style><main><small>DEMONSTRATION ONLY · NO APPROVED CE CREDIT</small><h2>${escape(learningOrganizer)}</h2><h1>${escape(document.title)}</h1><p>${escape(document.name)}</p><h2>${escape(document.course)}</h2><p>Date: ${escape(document.date.slice(0, 10))}</p>${document.amount === null ? '<p>Completed all required demo videos and passed the final exam with at least 90%.</p>' : `<p>USD ${(document.amount / 100).toFixed(2)} · Stripe sandbox payment · No real money collected.</p>`}<p>Reference: ${escape(document.reference)}</p><p>No CAB/NCBAHM course approval or credit hours are claimed. This is not a tax invoice or an accredited CE certificate.</p><p>Use your browser’s Print command to print or save as PDF.</p></main></html>`;
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'Content-Disposition': `attachment; filename="demo-${query.get('kind') === 'certificate' ? 'certificate' : 'receipt'}.html"`, 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff' } });
  } catch { return new Response('Document not found.', { status: 404 }); }
}
