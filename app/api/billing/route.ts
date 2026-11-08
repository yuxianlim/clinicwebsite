import { billingActor } from '@/app/lib/billingAccess.server';
import { approveDemoRefund, BillingError, completeDemoTreatment, correctDemoInvoice, demoBillingSnapshot, processDueDemoInsuranceInvoices, recordDemoCancellation, recordDemoNoShow, recordDemoPayment, settleDemoRefund, unblockDemoPatient } from '@/app/lib/demoBilling.server';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET() {
  const actor = await billingActor();
  if (!actor) return Response.json({ error: 'Clinic staff access required. This ledger is a development demo.' }, { status: 403, headers });
  try { return Response.json(demoBillingSnapshot(actor), { headers }); }
  catch { return Response.json({ error: 'Demo billing records are unavailable.' }, { status: 503, headers }); }
}
export async function POST(request: Request) {
  const actor = await billingActor();
  if (!actor) return Response.json({ error: 'Clinic staff access required.' }, { status: 403, headers });
  const origin = request.headers.get('origin');
  try { if (origin && new URL(origin).host !== request.headers.get('host')) throw new Error('Origin mismatch.'); }
  catch { return Response.json({ error: 'Request origin rejected.' }, { status: 403, headers }); }
  try {
    const text = await request.text(); if (text.length > 16_000) return Response.json({ error: 'Request too large.' }, { status: 413, headers });
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BillingError('Invalid billing request.');
    const value = (key: string) => typeof body[key] === 'string' ? body[key] : '';
    let result: unknown;
    if (body.action === 'complete-treatment') result = completeDemoTreatment(actor, value('patientId'), value('serviceId'), body.medicine === true, body.insurance === true, value('requestId'));
    else if (body.action === 'payment') result = recordDemoPayment(actor, value('invoiceId'), value('method'), value('requestId'), body.amount);
    else if (body.action === 'refund') result = approveDemoRefund(actor, value('invoiceId'), value('reason'), value('requestId'));
    else if (body.action === 'correct-invoice') result = correctDemoInvoice(actor, value('invoiceId'), value('serviceId'), body.medicine === true, value('reason'), value('requestId'));
    else if (body.action === 'settle-refund') result = settleDemoRefund(actor, value('refundId'));
    else if (body.action === 'no-show') result = recordDemoNoShow(actor, value('patientId'), value('requestId'));
    else if (body.action === 'unblock') result = unblockDemoPatient(actor, value('patientId'));
    else if (body.action === 'cancellation') {
      const hours = body.hoursBefore;
      if (typeof hours !== 'number' || !Number.isFinite(hours) || hours < 0 || hours > 24 * 365) throw new BillingError('Enter valid hours before the fictional appointment.');
      const now = Date.now(); result = recordDemoCancellation(actor, value('patientId'), now + hours * 3600000, value('requestId'), now);
    } else if (body.action === 'simulate-insurance-day7') {
      const visit = demoBillingSnapshot(actor).visits.find((item) => item.id === value('treatmentId'));
      if (!visit || !visit.insurance || visit.invoice_id) throw new BillingError('Choose an unissued fictional insurance treatment.');
      result = { issued: processDueDemoInsuranceInvoices(Date.parse(`${visit.due_date}T20:00:00Z`)), source: 'simulated-clock' };
    } else throw new BillingError('Unknown billing action.');
    return Response.json({ ok: true, result, source: 'development-fixture' }, { headers });
  } catch (error) { return Response.json({ error: error instanceof BillingError ? error.message : 'Billing action could not be confirmed. Refresh records before retrying.' }, { status: error instanceof BillingError ? 400 : 503, headers }); }
}
