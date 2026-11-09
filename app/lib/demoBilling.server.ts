import { randomUUID } from 'node:crypto';
import { learningDatabase, appendDemoBillingAudit, createClinicPatient, listClinicPatients } from './auditStore.server';
import { addClinicBusinessDays, clinicDateKey } from './clinicBusinessDays';
import { fictionalWorkflowEnabled } from './deploymentMode';

export const demoBillingEnabled = () => fictionalWorkflowEnabled(process.env.ENABLE_DEVELOPMENT_INTEGRATION_SIMULATORS);
export type BillingActor = { role: 'admin' | 'clinic_staff'; sessionId: string };
export class BillingError extends Error {}
const fail = (message: string): never => { throw new BillingError(message); };
const requireActor = (actor: BillingActor) => {
  if (!demoBillingEnabled() || !actor || !['admin', 'clinic_staff'].includes(actor.role) || !actor.sessionId) fail('Authorized development clinic staff access is required.');
};
export const demoBillingCatalog = [
  { id: 'initial', name: 'Initial visit', amount: 18000 },
  { id: 'follow-up', name: 'Follow-up visit', amount: 12000 },
];
export const medicineAddon = 5000;
export const demoPaymentMethods = ['credit_card', 'venmo', 'zelle', 'paypal', 'apple_pay', 'samsung_pay', 'google_pay'] as const;
type Invoice = { id: string; sequence: number; patient_id: string; reference_id: string; service_id: string; medicine: number; amount: number; issued_at: string; kind: string; actor_role: string };
type Treatment = { id: string; patient_id: string; service_id: string; medicine: number; amount: number; treated_at: string; insurance: number; due_date: string; window_end: string; invoice_id: string | null; actor_role: string };
type Payment = { id: string; invoice_id: string; amount: number; method: string; recorded_at: string };
type Refund = { id: string; invoice_id: string; amount: number; reason: string; approved_at: string; expected_start: string; expected_end: string; settled_at: string | null };
type PatientState = { patient_id: string; fixture_label: string; streak: number; blocked: number };
const db = () => {
  const database = learningDatabase();
  database.exec(`CREATE TABLE IF NOT EXISTS demo_billing_patients (patient_id TEXT PRIMARY KEY, fixture_label TEXT NOT NULL UNIQUE, streak INTEGER NOT NULL DEFAULT 0, blocked INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS demo_billing_seed_runs (id TEXT PRIMARY KEY, visit_id TEXT NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS demo_clinic_treatments (id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, service_id TEXT NOT NULL, medicine INTEGER NOT NULL, amount INTEGER NOT NULL, treated_at TEXT NOT NULL, insurance INTEGER NOT NULL, due_date TEXT NOT NULL, window_end TEXT NOT NULL, invoice_id TEXT, actor_role TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS demo_clinic_invoices (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, patient_id TEXT NOT NULL, reference_id TEXT NOT NULL UNIQUE, service_id TEXT NOT NULL, medicine INTEGER NOT NULL, amount INTEGER NOT NULL, issued_at TEXT NOT NULL, kind TEXT NOT NULL, actor_role TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS demo_clinic_payments (id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL, amount INTEGER NOT NULL, method TEXT NOT NULL, recorded_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS demo_clinic_refunds (id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL, amount INTEGER NOT NULL, reason TEXT NOT NULL, approved_at TEXT NOT NULL, expected_start TEXT NOT NULL, expected_end TEXT NOT NULL, settled_at TEXT);
    CREATE TABLE IF NOT EXISTS demo_invoice_adjustments (id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL, service_id TEXT NOT NULL, medicine INTEGER NOT NULL, amount INTEGER NOT NULL, corrected_at TEXT NOT NULL, reason TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS demo_clinic_visit_events (id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, kind TEXT NOT NULL, occurred_at TEXT NOT NULL, invoice_id TEXT);`);
  return database;
};
const atomic = <T>(work: () => T) => { const database = db(); database.exec('BEGIN IMMEDIATE'); try { const result = work(); database.exec('COMMIT'); return result; } catch (error) { database.exec('ROLLBACK'); throw error; } };
const identifier = (id: string) => { if (!/^[0-9a-f-]{36}$/i.test(id)) fail('A valid transaction reference is required.'); };
const patientState = (id: string) => db().prepare('SELECT * FROM demo_billing_patients WHERE patient_id = ?').get(id) as PatientState | undefined ?? fail('Choose a marked fictional billing patient.');
const invoiceById = (id: string) => db().prepare('SELECT * FROM demo_clinic_invoices WHERE id = ?').get(id) as Invoice | undefined ?? fail('Demo invoice not found.');
const invoiceAmount = (id:string) => {
  const invoice=invoiceById(id);
  const treatment=db().prepare('SELECT amount FROM demo_clinic_treatments WHERE id=?').get(invoice.reference_id) as {amount:number}|undefined;
  return treatment?.amount ?? invoice.amount;
};
const issue = (patientId: string, reference: string, serviceId: string, medicine: boolean, amount: number, kind: string, actorRole: string, sessionId: string, now: number) => {
  const existing = db().prepare('SELECT * FROM demo_clinic_invoices WHERE reference_id = ?').get(reference) as Invoice | undefined;
  if (existing) { if(existing.patient_id!==patientId||existing.kind!==kind||existing.amount!==amount||existing.service_id!==serviceId||Boolean(existing.medicine)!==medicine)fail('Reference belongs to a different invoice event.'); return existing; }
  db().prepare('INSERT INTO demo_clinic_invoices (id,patient_id,reference_id,service_id,medicine,amount,issued_at,kind,actor_role) VALUES (?,?,?,?,?,?,?,?,?)').run(reference,patientId,reference,serviceId,medicine?1:0,amount,new Date(now).toISOString(),kind,actorRole);
  appendDemoBillingAudit('Demo invoice issued', reference, sessionId);
  return invoiceById(reference);
};

export const seedBillingPatient = () => {
  if (!demoBillingEnabled()) fail('Demo billing is disabled.');
  const existing = db().prepare('SELECT patient_id FROM demo_billing_patients WHERE fixture_label = ?').get('primary') as { patient_id: string } | undefined;
  if (existing) return existing.patient_id;
  const used = new Set(listClinicPatients().map((patient) => patient.phone.replace(/\D/g,'').slice(-4)));
  const phone = Array.from({length:100},(_,index)=>`40855501${String(99-index).padStart(2,'0')}`).find((value)=>!used.has(value.slice(-4))) ?? fail('No fictional phone suffix is available.');
  const patient = createClinicPatient({firstName:'Fictional',lastName:'Billing Patient',phone,sessionId:null});
  db().prepare('INSERT INTO demo_billing_patients (patient_id,fixture_label) VALUES (?,?)').run(patient.id,'primary');
  return patient.id;
};
export const completeDemoTreatment = (actor: BillingActor, patientId: string, serviceId: string, medicine: boolean, insurance: boolean, requestId: string, now=Date.now()) => {
  requireActor(actor); identifier(requestId);
  if(serviceId && !['auto',...demoBillingCatalog.map((item)=>item.id)].includes(serviceId))fail('Invalid reported visit type.');
  return atomic(()=>{
    const patient=patientState(patientId);
    const existing=db().prepare('SELECT * FROM demo_clinic_treatments WHERE id=?').get(requestId) as Treatment|undefined;
    if(existing){if(existing.patient_id!==patientId||Boolean(existing.medicine)!==medicine||Boolean(existing.insurance)!==insurance)fail('Reference belongs to a different treatment.');return existing;}
    if(patient.blocked)fail('Staff must unblock this patient before a new demo visit.');
    const earlier=db().prepare('SELECT 1 FROM demo_clinic_treatments WHERE patient_id=? AND treated_at<=? LIMIT 1').get(patientId,new Date(now).toISOString());
    const patientRecord=listClinicPatients().find((item)=>item.id===patientId)??fail('Patient record is unavailable.');
    const history=patientRecord.visitHistory.filter((entry)=>entry.date<=clinicDateKey(now)).length;
    const service=demoBillingCatalog[earlier||history>0?1:0];
    const detectedServiceId=service.id;
    const date=clinicDateKey(now), due=insurance?addClinicBusinessDays(date,7):date, end=insurance?addClinicBusinessDays(date,14):date;
    const amount=service.amount+(medicine?medicineAddon:0);
    db().prepare('INSERT INTO demo_clinic_treatments VALUES (?,?,?,?,?,?,?,?,?,NULL,?)').run(requestId,patientId,detectedServiceId,medicine?1:0,amount,new Date(now).toISOString(),insurance?1:0,due,end,actor.role);
    const visitHistory=[...patientRecord.visitHistory,{date:clinicDateKey(now),treatment:`Demo completed ${service.name.toLowerCase()}${medicine?' + medicine':''}`,practitioner:'Demo clinic staff',source:'development-fixture',referenceId:requestId}];
    db().prepare('UPDATE clinic_patients SET visit_history=?,last_visit=? WHERE id=?').run(JSON.stringify(visitHistory),clinicDateKey(now),patientId);
    db().prepare('UPDATE demo_billing_patients SET streak=0 WHERE patient_id=?').run(patientId);
    appendDemoBillingAudit('Demo treatment completed',requestId,actor.sessionId);
    if(!insurance){issue(patientId,requestId,detectedServiceId,medicine,amount,'treatment',actor.role,actor.sessionId,now);db().prepare('UPDATE demo_clinic_treatments SET invoice_id=? WHERE id=?').run(requestId,requestId);}
    return db().prepare('SELECT * FROM demo_clinic_treatments WHERE id=?').get(requestId) as Treatment;
  });
};
export const processDueDemoInsuranceInvoices = (now=Date.now()) => {
  if(!demoBillingEnabled())return 0;
  return atomic(()=>{
    const due=db().prepare('SELECT * FROM demo_clinic_treatments WHERE insurance=1 AND invoice_id IS NULL AND due_date<=?').all(clinicDateKey(now)) as Treatment[];
    for(const visit of due){issue(visit.patient_id,visit.id,visit.service_id,Boolean(visit.medicine),visit.amount,'insurance-treatment','system','demo-insurance-scheduler',now);db().prepare('UPDATE demo_clinic_treatments SET invoice_id=? WHERE id=?').run(visit.id,visit.id);}
    return due.length;
  });
};
export const recordDemoPayment = (actor: BillingActor, invoiceId: string, method: string, requestId: string, paidAmount?:number) => {
  requireActor(actor); identifier(requestId);
  if(!demoPaymentMethods.some((item)=>item===method))fail('Select a requested demo payment method.');
  return atomic(()=>{
    invoiceById(invoiceId);
    const existing=db().prepare('SELECT * FROM demo_clinic_payments WHERE id=?').get(requestId) as Payment|undefined;
    if(existing){if(existing.invoice_id!==invoiceId||existing.method!==method||(paidAmount!==undefined&&existing.amount!==paidAmount))fail('Reference belongs to another payment.');return existing;}
    const received=(db().prepare('SELECT COALESCE(sum(amount),0) AS amount FROM demo_clinic_payments WHERE invoice_id=?').get(invoiceId) as {amount:number}).amount;
    const amount=paidAmount??Math.max(0,invoiceAmount(invoiceId)-received);
    if(!Number.isSafeInteger(amount)||amount<=0||amount>10000000)fail('Enter a positive valid amount received in cents.');
    db().prepare('INSERT INTO demo_clinic_payments VALUES (?,?,?,?,?)').run(requestId,invoiceId,amount,method,new Date().toISOString());
    appendDemoBillingAudit('Demo payment recorded',invoiceId,actor.sessionId);
    return db().prepare('SELECT * FROM demo_clinic_payments WHERE id=?').get(requestId) as Payment;
  });
};
export const approveDemoRefund = (actor: BillingActor, invoiceId: string, reason: string, requestId: string, amount?:number, now=Date.now()) => {
  requireActor(actor); identifier(requestId);
  if(!reason.trim()||reason.length>300)fail('Enter a fictional refund reason, maximum 300 characters.');
  return atomic(()=>{
    invoiceById(invoiceId);
    const existing=db().prepare('SELECT * FROM demo_clinic_refunds WHERE id=?').get(requestId) as Refund|undefined;
    if(existing){if(existing.invoice_id!==invoiceId||existing.reason!==reason.trim()||(amount!==undefined&&existing.amount!==amount))fail('Reference belongs to another refund.');return existing;}
    const payment=(db().prepare('SELECT COALESCE(sum(amount),0) AS amount FROM demo_clinic_payments WHERE invoice_id=?').get(invoiceId) as {amount:number});
    if(!payment.amount)fail('Record a fictional payment first.');
    const reserved=(db().prepare('SELECT COALESCE(sum(amount),0) AS amount FROM demo_clinic_refunds WHERE invoice_id=?').get(invoiceId) as {amount:number}).amount;
    const eligible=payment.amount-invoiceAmount(invoiceId)-reserved;
    const value=amount??eligible;
    if(!Number.isSafeInteger(value)||value<=0||value!==eligible)fail('Refund must equal the remaining overpayment above the correct invoice amount.');
    const date=clinicDateKey(now);
    db().prepare('INSERT INTO demo_clinic_refunds VALUES (?,?,?,?,?,?,?,NULL)').run(requestId,invoiceId,value,reason.trim(),new Date(now).toISOString(),addClinicBusinessDays(date,3),addClinicBusinessDays(date,5));
    appendDemoBillingAudit('Demo refund approved',invoiceId,actor.sessionId);
    return db().prepare('SELECT * FROM demo_clinic_refunds WHERE id=?').get(requestId) as Refund;
  });
};
export const settleDemoRefund = (actor:BillingActor,id:string) => {requireActor(actor);return atomic(()=>{
  const refund=db().prepare('SELECT * FROM demo_clinic_refunds WHERE id=?').get(id) as Refund|undefined??fail('Approved refund not found.');
  if(!refund.settled_at){db().prepare('UPDATE demo_clinic_refunds SET settled_at=? WHERE id=?').run(new Date().toISOString(),id);appendDemoBillingAudit('Demo refund settled',refund.invoice_id,actor.sessionId);}
  return db().prepare('SELECT * FROM demo_clinic_refunds WHERE id=?').get(id) as Refund;
});};
export const correctDemoInvoice = (actor:BillingActor, invoiceId:string, serviceId:string, medicine:boolean, reason:string, requestId:string) => {
  requireActor(actor); identifier(requestId);
  if(!demoBillingCatalog.some((item)=>item.id===serviceId))fail('Select a valid visit type.');
  if(!reason.trim()||reason.length>300)fail('A short correction reason is required.');
  return atomic(()=>{
    const invoice=invoiceById(invoiceId);
    if(!['treatment','insurance-treatment'].includes(invoice.kind))fail('A visit-type correction cannot change a policy fee.');
    const existing=db().prepare('SELECT * FROM demo_invoice_adjustments WHERE id=?').get(requestId) as {invoice_id:string;service_id:string;medicine:number;reason:string}|undefined;
    if(existing){if(existing.invoice_id!==invoiceId||existing.service_id!==serviceId||Boolean(existing.medicine)!==medicine||existing.reason!==reason.trim())fail('Reference belongs to a different correction.');return invoiceAmount(invoiceId);}
    const treatment=db().prepare('SELECT * FROM demo_clinic_treatments WHERE id=?').get(invoice.reference_id) as Treatment|undefined??fail('Completed visit history is unavailable.');
    if(treatment.service_id!==serviceId||Boolean(treatment.medicine)!==medicine)fail('The correct visit type and medicine amount are determined by completed treatment records.');
    const amount=treatment.amount;
    const reserved=(db().prepare('SELECT COALESCE(sum(amount),0) AS amount FROM demo_clinic_refunds WHERE invoice_id=?').get(invoiceId) as {amount:number}).amount;
    const paid=(db().prepare('SELECT COALESCE(sum(amount),0) AS amount FROM demo_clinic_payments WHERE invoice_id=?').get(invoiceId) as {amount:number}).amount;
    if(reserved>0&&amount>paid-reserved)fail('This correction conflicts with already approved refunds.');
    db().prepare('INSERT INTO demo_invoice_adjustments VALUES (?,?,?,?,?,?,?)').run(requestId,invoiceId,serviceId,medicine?1:0,amount,new Date().toISOString(),reason.trim());
    appendDemoBillingAudit('Demo invoice corrected',invoiceId,actor.sessionId);
    return amount;
  });
};
export const recordDemoNoShow = (actor:BillingActor,patientId:string,requestId:string,now=Date.now()) => {requireActor(actor);identifier(requestId);return atomic(()=>{
  const patient=patientState(patientId);
  const existing=db().prepare('SELECT * FROM demo_clinic_visit_events WHERE id=?').get(requestId) as {patient_id:string;kind:string}|undefined;
  if(existing){if(existing.patient_id!==patientId||existing.kind!=='no-show')fail('Reference belongs to another visit event.');return patientState(patientId);}
  if(patient.blocked)fail('This patient is already blocked. Staff may remove the restriction.');
  const streak=patient.streak+1;
  const invoice=streak===3?issue(patientId,requestId,'third-no-show',false,10000,'third-no-show',actor.role,actor.sessionId,now):null;
  db().prepare('INSERT INTO demo_clinic_visit_events VALUES (?,?,?,?,?)').run(requestId,patientId,'no-show',new Date(now).toISOString(),invoice?.id??null);
  db().prepare('UPDATE demo_billing_patients SET streak=?,blocked=? WHERE patient_id=?').run(streak,streak>=3?1:0,patientId);
  appendDemoBillingAudit('Demo no-show recorded',requestId,actor.sessionId);
  return patientState(patientId);
});};
export const unblockDemoPatient = (actor:BillingActor,patientId:string) => {requireActor(actor);return atomic(()=>{
  const state=patientState(patientId);if(!state.blocked)return state;
  db().prepare('UPDATE demo_billing_patients SET streak=0,blocked=0 WHERE patient_id=?').run(patientId);
  appendDemoBillingAudit('Demo booking block removed',patientId,actor.sessionId);return patientState(patientId);
});};
export const recordDemoCancellation = (actor:BillingActor,patientId:string,startsAt:number,requestId:string,now=Date.now()) => {requireActor(actor);identifier(requestId);if(!Number.isFinite(startsAt))fail('A valid appointment time is required.');return atomic(()=>{
  patientState(patientId);
  const previous=db().prepare('SELECT * FROM demo_clinic_visit_events WHERE id=?').get(requestId) as {patient_id:string;kind:string;invoice_id:string|null}|undefined;
  if(previous){if(previous.patient_id!==patientId||previous.kind!=='cancellation')fail('Reference belongs to another visit event.');return previous;}
  const remaining=startsAt-now;
  const invoice=remaining>=0&&remaining<=24*60*60*1000?issue(patientId,requestId,'late-cancellation',false,5000,'late-cancellation',actor.role,actor.sessionId,now):null;
  db().prepare('INSERT INTO demo_clinic_visit_events VALUES (?,?,?,?,?)').run(requestId,patientId,'cancellation',new Date(now).toISOString(),invoice?.id??null);
  appendDemoBillingAudit('Demo cancellation recorded',requestId,actor.sessionId);
  return {invoice_id:invoice?.id??null};
});};
export const isDemoBookingBlocked = (phone:string) => {
  if(!demoBillingEnabled())return false;
  const normalized=phone.replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');
  return Boolean(db().prepare('SELECT 1 FROM demo_billing_patients b JOIN clinic_patients p ON p.id=b.patient_id WHERE b.blocked=1 AND p.normalized_phone=?').get(normalized));
};
export const recordDemoAttendance = (patientId:string, appointmentId:string) => {
  if(!demoBillingEnabled()||!db().prepare('SELECT 1 FROM demo_billing_patients WHERE patient_id=?').get(patientId))return;
  return atomic(()=>{
    const id=`attendance:${appointmentId}`;
    if(db().prepare('SELECT 1 FROM demo_clinic_visit_events WHERE id=?').get(id))return;
    db().prepare('INSERT INTO demo_clinic_visit_events VALUES (?,?,?,?,NULL)').run(id,patientId,'attended',new Date().toISOString());
    db().prepare('UPDATE demo_billing_patients SET streak=0 WHERE patient_id=?').run(patientId);
    appendDemoBillingAudit('Demo attendance recorded',id,'demo-kiosk-attendance');
  });
};
export const demoBillingSnapshot = (actor:BillingActor) => {requireActor(actor);
  const visits=db().prepare('SELECT * FROM demo_clinic_treatments ORDER BY rowid DESC LIMIT 100').all() as Treatment[];
  const invoices=db().prepare('SELECT * FROM demo_clinic_invoices ORDER BY sequence DESC LIMIT 100').all() as Invoice[];
  const payments=db().prepare('SELECT * FROM demo_clinic_payments').all() as Payment[];
  const refunds=db().prepare('SELECT * FROM demo_clinic_refunds').all() as Refund[];
  const adjustments=db().prepare('SELECT * FROM demo_invoice_adjustments ORDER BY rowid DESC').all() as {id:string;invoice_id:string;service_id:string;medicine:number;amount:number;reason:string}[];
  const markers=db().prepare('SELECT * FROM demo_billing_patients').all() as PatientState[];
  const patients=listClinicPatients().filter((patient)=>markers.some((item)=>item.patient_id===patient.id)).map((patient)=>({...markers.find((item)=>item.patient_id===patient.id)!,name:`${patient.firstName} ${patient.lastName}`,phone:patient.phone}));
  return {source:'development-fixture' as const,actor:{role:actor.role},catalog:demoBillingCatalog,medicineAddon,methods:demoPaymentMethods,patients,visits,
    invoices:invoices.map((invoice)=>({...invoice,number:`DEMO-${String(invoice.sequence).padStart(6,'0')}`,correctAmount:invoiceAmount(invoice.id),adjustment:adjustments.find((item)=>item.invoice_id===invoice.id)??null,service:demoBillingCatalog.find((item)=>item.id===invoice.service_id)?.name??(invoice.kind==='third-no-show'?'Third consecutive no-show fee':'Late cancellation fee'),payments:payments.filter((item)=>item.invoice_id===invoice.id),totalPaid:payments.filter((item)=>item.invoice_id===invoice.id).reduce((sum,item)=>sum+item.amount,0),refunds:refunds.filter((item)=>item.invoice_id===invoice.id)}))};
};
export const demoBillingEvidence = () => {
  if(!demoBillingEnabled())return null;
  const last=(db().prepare('SELECT MAX(timestamp) AS timestamp FROM (SELECT issued_at AS timestamp FROM demo_clinic_invoices UNION ALL SELECT recorded_at FROM demo_clinic_payments UNION ALL SELECT approved_at FROM demo_clinic_refunds)').get() as {timestamp:string|null}).timestamp;
  return {invoices:(db().prepare('SELECT count(*) AS count FROM demo_clinic_invoices').get() as {count:number}).count,payments:(db().prepare('SELECT count(*) AS count FROM demo_clinic_payments').get() as {count:number}).count,refunds:(db().prepare('SELECT count(*) AS count FROM demo_clinic_refunds').get() as {count:number}).count,last};
};
export const demoBillingStatus = (auditValid:boolean) => {
  let evidence:ReturnType<typeof demoBillingEvidence>=null;
  try { evidence=demoBillingEvidence(); } catch { /* Storage failure must not be reported as connected. */ }
  const connected=auditValid&&Boolean(evidence?.invoices&&evidence.payments&&evidence.refunds);
  return {
    kind:'Connection', name:'Demo billing: invoices, payments and refunds -> durable records and audit',
    status:!auditValid||!evidence?'Failed':connected?'Connected':'Partly Connected',
    description:'Development-only clinic ledger implements history-based visit pricing, overpayment refunds, booking restrictions and delayed insurance invoices. All financial records are fictional; no payment processor or insurer is contacted.',
    connectedComponents:['Clinic billing screen','Scoped staff/admin billing API','SQLite demo clinic ledger','Patient visit history','Audit chain'],
    informationExchanged:'Authorized fictional patient/treatment references, server-calculated USD prices and durable invoice/payment/refund records. No card details or real financial instructions.',
    evidence:[`${evidence?.invoices??0} fictional invoice(s), ${evidence?.payments??0} payment receipt(s), ${evidence?.refunds??0} approved overpayment refund(s).`,'Initial $180; follow-up $120; medicine +$50. Completed visit history selects the visit type. Overpayments are eligible for the exact difference; underpayments remain due.','Insurance invoices issue on business day 7 while the app is running, with restart catch-up. Demo clock controls are explicitly simulated.'],
    lastTestedAt:evidence?.last??null,
    missingRequirement:connected?null:'Run demo setup, then inspect Billing & Payments. Live staff provisioning and payment processing remain separate deployment work.',
    safeErrorMessage:!auditValid||!evidence?'Demo billing evidence could not be verified.':null,
  };
};
const scheduler=globalThis as typeof globalThis&{demoInsuranceTimer?:ReturnType<typeof setInterval>};
export const startDemoInsuranceScheduler = () => {
  if(!demoBillingEnabled()||scheduler.demoInsuranceTimer)return;
  const run=()=>{try{processDueDemoInsuranceInvoices();}catch{console.error('Demo insurance invoice processing failed; the scheduler will retry.');}};
  run(); scheduler.demoInsuranceTimer=setInterval(run,60_000); scheduler.demoInsuranceTimer.unref();
};
export const seedDemoBilling = () => {
  if(!demoBillingEnabled())fail('Demo billing is disabled.');
  const patientId=seedBillingPatient();const actor:BillingActor={role:'admin',sessionId:'demo-billing-setup'};
  for(const phase of ['initial','followup'] as const){
    const marker=db().prepare('SELECT visit_id FROM demo_billing_seed_runs WHERE id=?').get(phase) as {visit_id:string}|undefined;
    const id=marker?.visit_id??randomUUID();
    const visit=completeDemoTreatment(actor,patientId,'auto',false,false,id);
    if(!marker)db().prepare('INSERT INTO demo_billing_seed_runs VALUES (?,?)').run(phase,id);
    if(visit.invoice_id){
      const payment=db().prepare('SELECT id FROM demo_clinic_payments WHERE invoice_id=? ORDER BY rowid LIMIT 1').get(visit.invoice_id) as {id:string}|undefined;
      recordDemoPayment(actor,visit.invoice_id,'credit_card',payment?.id??randomUUID(),18000);
      if(phase==='followup'){
        const refund=db().prepare('SELECT id FROM demo_clinic_refunds WHERE invoice_id=? ORDER BY rowid LIMIT 1').get(visit.invoice_id) as {id:string}|undefined;
        approveDemoRefund(actor,visit.invoice_id,'Fictional overpayment: paid $180 for a $120 follow-up',refund?.id??randomUUID());
      }
    }
  }
  return {patientId,staffEmail:'billing.staff@example.invalid',staffPassword:'DemoBilling!2026'};
};
