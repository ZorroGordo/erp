import type { FastifyInstance } from 'fastify';
import { requireAnyOf } from '../../middleware/auth';
import { prisma } from '../../lib/prisma';
import { sendEmail } from '../../lib/email';
import * as PayrollService from './service';

const AFP_NAMES = ['AFP Integra', 'Prima AFP', 'Profuturo AFP', 'Habitat AFP'] as const;
const CONTRACT_TYPES = ['INDEFINIDO', 'PLAZO_FIJO', 'PART_TIME'] as const;
const PENSION_SYSTEMS = ['AFP', 'ONP'] as const;
const EMPLOYMENT_TYPES = ['PLANILLA', 'RXH'] as const;

const CC_EMAIL = 'contabilidad@victorsdou.pe';

// ── Email helper ──────────────────────────────────────────────────────────────
function buildPayslipEmail(employee: any, payslip: any, period: any) {
  const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const periodLabel = `${monthNames[period.month - 1]} ${period.year}`;
  const gross   = Number(payslip.grossSalary).toFixed(2);
  const net     = Number(payslip.netSalary).toFixed(2);
  const ded     = payslip.deductions as any;
  const adds    = payslip.additions as any;

  const isRxH = employee.employmentType === 'RXH';

  const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">
  <div style="background:#1e3a5f;padding:20px 24px;color:#fff">
    <h2 style="margin:0;font-size:18px">Boleta de ${isRxH ? 'Honorarios' : 'Pago'} — ${periodLabel}</h2>
    <p style="margin:4px 0 0;opacity:.8;font-size:14px">VictorOS ERP · victorsdou.pe</p>
  </div>
  <div style="padding:24px">
    <p style="margin:0 0 16px;color:#374151">Estimado/a <strong>${employee.fullName}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151">Adjuntamos el detalle de su ${isRxH ? 'recibo por honorarios' : 'boleta de pago'} correspondiente al periodo <strong>${periodLabel}</strong>.</p>

    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead>
        <tr style="background:#f3f4f6">
          <th style="text-align:left;padding:8px 12px;color:#6b7280;font-weight:600">Concepto</th>
          <th style="text-align:right;padding:8px 12px;color:#6b7280;font-weight:600">S/</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-top:1px solid #e5e7eb">
          <td style="padding:8px 12px;color:#111827">${isRxH ? 'Honorarios brutos' : 'Sueldo bruto'}</td>
          <td style="text-align:right;padding:8px 12px;font-family:monospace;color:#111827">${gross}</td>
        </tr>
        ${adds.overtime25 > 0 ? `<tr style="border-top:1px solid #e5e7eb"><td style="padding:8px 12px;color:#374151">Horas extras (25%)</td><td style="text-align:right;padding:8px 12px;font-family:monospace">${Number(adds.overtime25).toFixed(2)}</td></tr>` : ''}
        ${adds.overtime35 > 0 ? `<tr style="border-top:1px solid #e5e7eb"><td style="padding:8px 12px;color:#374151">Horas extras (35%)</td><td style="text-align:right;padding:8px 12px;font-family:monospace">${Number(adds.overtime35).toFixed(2)}</td></tr>` : ''}
        ${adds.holidayPay > 0 ? `<tr style="border-top:1px solid #e5e7eb"><td style="padding:8px 12px;color:#374151">Trabajo en feriado (100%)</td><td style="text-align:right;padding:8px 12px;font-family:monospace">${Number(adds.holidayPay).toFixed(2)}</td></tr>` : ''}
        ${ded.afpOrOnp > 0 ? `<tr style="border-top:1px solid #e5e7eb"><td style="padding:8px 12px;color:#dc2626">Descuento AFP/ONP</td><td style="text-align:right;padding:8px 12px;font-family:monospace;color:#dc2626">(${Number(ded.afpOrOnp).toFixed(2)})</td></tr>` : ''}
        ${ded.igv5taCategoria > 0 ? `<tr style="border-top:1px solid #e5e7eb"><td style="padding:8px 12px;color:#dc2626">Renta 5ta categoría</td><td style="text-align:right;padding:8px 12px;font-family:monospace;color:#dc2626">(${Number(ded.igv5taCategoria).toFixed(2)})</td></tr>` : ''}
        ${ded.irRxH > 0 ? `<tr style="border-top:1px solid #e5e7eb"><td style="padding:8px 12px;color:#dc2626">Retención IR (8%)</td><td style="text-align:right;padding:8px 12px;font-family:monospace;color:#dc2626">(${Number(ded.irRxH).toFixed(2)})</td></tr>` : ''}
        <tr style="border-top:2px solid #1e3a5f;background:#eff6ff">
          <td style="padding:10px 12px;font-weight:700;color:#1e3a5f">NETO A PAGAR</td>
          <td style="text-align:right;padding:10px 12px;font-family:monospace;font-weight:700;font-size:16px;color:#1e3a5f">S/ ${net}</td>
        </tr>
      </tbody>
    </table>

    ${!isRxH ? `
    <div style="margin-top:16px;padding:12px;background:#f9fafb;border-radius:6px;font-size:12px;color:#6b7280">
      <strong>Provisiones empleador (no afectan neto):</strong>
      EsSalud S/ ${Number(payslip.essaludEmployer).toFixed(2)} ·
      CTS S/ ${Number(payslip.ctsProvision).toFixed(2)} ·
      Vacaciones S/ ${Number(payslip.vacationProvision).toFixed(2)} ·
      Gratificación S/ ${Number(payslip.gratificacionProv).toFixed(2)}
    </div>` : ''}

    <p style="margin:20px 0 0;font-size:12px;color:#9ca3af">
      Este comprobante fue generado automáticamente por VictorOS ERP.<br>
      Para consultas: ${CC_EMAIL}
    </p>
  </div>
</div>`;

  return {
    subject: `Boleta de ${isRxH ? 'Honorarios' : 'Pago'} — ${periodLabel} — ${employee.fullName}`,
    html,
  };
}

export async function payrollRoutes(app: FastifyInstance) {

  // ══════════════════════════════════════════════════════════════════════════
  //  EMPLOYEES
  // ══════════════════════════════════════════════════════════════════════════

  // ── GET /v1/payroll/employees ─────────────────────────────────────────────
  app.get('/employees', {
    preHandler: [requireAnyOf('FINANCE_MGR', 'SUPER_ADMIN', 'OPS_MGR')],
  }, async (_req, reply) => {
    const employees = await prisma.employee.findMany({
      where: { isActive: true },
      orderBy: { fullName: 'asc' },
    });
    return reply.send({ data: employees });
  });

  // ── POST /v1/payroll/employees ────────────────────────────────────────────
  app.post('/employees', {
    preHandler: [requireAnyOf('FINANCE_MGR', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const body = req.body as {
      fullName:       string;
      dni:            string;
      position:       string;
      department?:    string;
      employmentType?: string;
      contractType?:  string;
      hireDate?:      string;
      baseSalary:     number;
      pensionSystem?: string;
      afpName?:       string;
      cuspp?:         string;
      email?:         string;
      bankAccount?:   string;
      bankName?:      string;
    };

    if (!body.fullName?.trim()) return reply.code(400).send({ error: 'fullName is required' });
    if (!body.dni?.trim())      return reply.code(400).send({ error: 'dni is required' });
    if (!body.baseSalary)       return reply.code(400).send({ error: 'baseSalary is required' });

    const employee = await prisma.employee.create({
      data: {
        fullName:       body.fullName.trim(),
        dni:            body.dni.trim(),
        position:       body.position?.trim() ?? '',
        department:     body.department?.trim() ?? null,
        employmentType: (body.employmentType as any) ?? 'PLANILLA',
        contractType:   (body.contractType as any) ?? 'INDEFINIDO',
        hireDate:       body.hireDate ? new Date(body.hireDate) : new Date(),
        baseSalary:     body.baseSalary,
        pensionSystem:  (body.pensionSystem as any) ?? 'AFP',
        afpName:        body.afpName?.trim() ?? null,
        cuspp:          body.cuspp?.trim() ?? null,
        email:          body.email?.trim() ?? null,
        bankAccount:    body.bankAccount?.trim() ?? null,
        bankName:       body.bankName?.trim() ?? null,
      },
    });
    return reply.code(201).send({ data: employee });
  });

  // ── PATCH /v1/payroll/employees/:id ──────────────────────────────────────
  app.patch('/employees/:id', {
    preHandler: [requireAnyOf('FINANCE_MGR', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      fullName?:       string;
      position?:       string;
      department?:     string;
      employmentType?: string;
      contractType?:   string;
      hireDate?:       string;
      baseSalary?:     number;
      pensionSystem?:  string;
      afpName?:        string;
      cuspp?:          string;
      email?:          string;
      bankAccount?:    string;
      bankName?:       string;
      isActive?:       boolean;
    };

    const existing = await prisma.employee.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: 'NOT_FOUND' });

    const employee = await prisma.employee.update({
      where: { id },
      data: {
        ...(body.fullName       !== undefined ? { fullName:       body.fullName.trim() }        : {}),
        ...(body.position       !== undefined ? { position:       body.position.trim() }        : {}),
        ...(body.department     !== undefined ? { department:     body.department?.trim() ?? null } : {}),
        ...(body.employmentType !== undefined ? { employmentType: body.employmentType as any }  : {}),
        ...(body.contractType   !== undefined ? { contractType:   body.contractType as any }    : {}),
        ...(body.hireDate       !== undefined ? { hireDate:       new Date(body.hireDate) }     : {}),
        ...(body.baseSalary     !== undefined ? { baseSalary:     body.baseSalary }             : {}),
        ...(body.pensionSystem  !== undefined ? { pensionSystem:  body.pensionSystem as any }   : {}),
        ...(body.afpName        !== undefined ? { afpName:        body.afpName?.trim() ?? null }: {}),
        ...(body.cuspp          !== undefined ? { cuspp:          body.cuspp?.trim() ?? null }  : {}),
        ...(body.email          !== undefined ? { email:          body.email?.trim() ?? null }  : {}),
        ...(body.bankAccount    !== undefined ? { bankAccount:    body.bankAccount?.trim() ?? null } : {}),
        ...(body.bankName       !== undefined ? { bankName:       body.bankName?.trim() ?? null } : {}),
        ...(body.isActive       !== undefined ? { isActive:       body.isActive }               : {}),
      },
    });
    return reply.send({ data: employee });
  });

  // ══════════════════════════════════════════════════════════════════════════
  //  OVERTIME RECORDS
  // ══════════════════════════════════════════════════════════════════════════

  // ── GET /v1/payroll/employees/:id/overtime ────────────────────────────────
  app.get('/employees/:id/overtime', {
    preHandler: [requireAnyOf('FINANCE_MGR', 'SUPER_ADMIN', 'OPS_MGR')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const q = req.query as { year?: string; month?: string };
    const where: any = { employeeId: id };
    if (q.year && q.month) {
      const start = new Date(parseInt(q.year), parseInt(q.month) - 1, 1);
      const end   = new Date(parseInt(q.year), parseInt(q.month), 1);
      where.date = { gte: start, lt: end };
    }
    const records = await prisma.overtimeRecord.findMany({ where, orderBy: { date: 'asc' } });
    return reply.send({ data: records });
  });

  // ── POST /v1/payroll/employees/:id/overtime ───────────────────────────────
  app.post('/employees/:id/overtime', {
    preHandler: [requireAnyOf('FINANCE_MGR', 'SUPER_ADMIN', 'OPS_MGR')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      date:          string;
      hoursWorked?:  number;
      regularHours?: number;
      overtime25?:   number;
      overtime35?:   number;
      isHoliday?:    boolean;
      holidayHours?: number;
      notes?:        string;
    };

    if (!body.date) return reply.code(400).send({ error: 'date is required' });

    const employee = await prisma.employee.findUnique({ where: { id } });
    if (!employee) return reply.code(404).send({ error: 'Employee NOT_FOUND' });

    const record = await prisma.overtimeRecord.create({
      data: {
        employeeId:   id,
        date:         new Date(body.date),
        hoursWorked:  body.hoursWorked  ?? 0,
        regularHours: body.regularHours ?? 0,
        overtime25:   body.overtime25   ?? 0,
        overtime35:   body.overtime35   ?? 0,
        isHoliday:    body.isHoliday    ?? false,
        holidayHours: body.holidayHours ?? 0,
        notes:        body.notes        ?? null,
      },
    });
    return reply.code(201).send({ data: record });
  });

  // ── DELETE /v1/payroll/overtime/:recordId ─────────────────────────────────
  app.delete('/overtime/:recordId', {
    preHandler: [requireAnyOf('FINANCE_MGR', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const { recordId } = req.params as { recordId: string };
    const existing = await prisma.overtimeRecord.findUnique({ where: { id: recordId } });
    if (!existing) return reply.code(404).send({ error: 'NOT_FOUND' });
    await prisma.overtimeRecord.delete({ where: { id: recordId } });
    return reply.code(204).send();
  });

  // ══════════════════════════════════════════════════════════════════════════
  //  PAY PERIODS
  // ══════════════════════════════════════════════════════════════════════════

  // ── GET /v1/payroll/periods ───────────────────────────────────────────────
  app.get('/periods', {
    preHandler: [requireAnyOf('FINANCE_MGR', 'SUPER_ADMIN', 'OPS_MGR')],
  }, async (req, reply) => {
    const periods = await prisma.payPeriod.findMany({
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: {
        _count: { select: { payslips: true } },
      },
    });
    return reply.send({ data: periods });
  });

  // ── POST /v1/payroll/periods ──────────────────────────────────────────────
  app.post('/periods', {
    preHandler: [requireAnyOf('FINANCE_MGR', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const body = req.body as {
      year:       number;
      month:      number;
      periodType?: string;
    };

    if (!body.year || !body.month) return reply.code(400).send({ error: 'year and month are required' });
    if (body.month < 1 || body.month > 12) return reply.code(400).send({ error: 'month must be 1-12' });

    // Check for existing period
    const existing = await prisma.payPeriod.findFirst({
      where: { year: body.year, month: body.month, periodType: (body.periodType as any) ?? 'MONTHLY', fortnight: null },
    });
    if (existing) return reply.code(409).send({ error: 'PERIOD_EXISTS', message: 'A period for this month already exists' });

    const period = await prisma.payPeriod.create({
      data: {
        year:       body.year,
        month:      body.month,
        periodType: (body.periodType as any) ?? 'MONTHLY',
        status:     'OPEN',
      },
    });
    return reply.code(201).send({ data: period });
  });

  // ── POST /v1/payroll/periods/:id/process ─────────────────────────────────
  app.post('/periods/:id/process', {
    preHandler: [requireAnyOf('FINANCE_MGR', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const period = await prisma.payPeriod.findUnique({ where: { id } });
    if (!period) return reply.code(404).send({ error: 'NOT_FOUND' });
    if (period.status === 'PAID') return reply.code(400).send({ error: 'Period already PAID' });

    const employees = await prisma.employee.findMany({ where: { isActive: true } });
    const payslips = await Promise.all(
      employees.map(async (emp) => {
        const calc = await PayrollService.calculatePayslip(emp.id, id);
        return prisma.payslip.upsert({
          where:  { employeeId_periodId: { employeeId: emp.id, periodId: id } },
          create: {
            employeeId:       emp.id,
            periodId:         id,
            grossSalary:      calc.grossSalary,
            additions:        calc.additions,
            deductions:       calc.deductions,
            netSalary:        calc.netSalary,
            igv5taWithheld:   calc.deductions.igv5taCategoria,
            essaludEmployer:  calc.employerContributions.essalud,
            ctsProvision:     calc.provisions.cts,
            vacationProvision: calc.provisions.vacaciones,
            gratificacionProv: calc.provisions.gratificacion,
            employerTotalCost: calc.employerTotalCost,
            status:           'DRAFT',
          },
          update: {
            grossSalary:      calc.grossSalary,
            additions:        calc.additions,
            deductions:       calc.deductions,
            netSalary:        calc.netSalary,
            igv5taWithheld:   calc.deductions.igv5taCategoria,
            essaludEmployer:  calc.employerContributions.essalud,
            ctsProvision:     calc.provisions.cts,
            vacationProvision: calc.provisions.vacaciones,
            gratificacionProv: calc.provisions.gratificacion,
            employerTotalCost: calc.employerTotalCost,
          },
        });
      })
    );

    await prisma.payPeriod.update({
      where: { id },
      data: { status: 'PROCESSED', processedAt: new Date(), processedBy: req.actor!.sub },
    });
    return reply.send({ data: { processed: payslips.length } });
  });

  // ── GET /v1/payroll/periods/:id/payslips ──────────────────────────────────
  app.get('/periods/:id/payslips', {
    preHandler: [requireAnyOf('FINANCE_MGR', 'SUPER_ADMIN', 'OPS_MGR')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const payslips = await prisma.payslip.findMany({
      where: { periodId: id },
      include: { employee: true },
      orderBy: { employee: { fullName: 'asc' } },
    });
    return reply.send({ data: payslips });
  });

  // ══════════════════════════════════════════════════════════════════════════
  //  PAYSLIP ACTIONS
  // ══════════════════════════════════════════════════════════════════════════

  // ── PATCH /v1/payroll/payslips/:id ────────────────────────────────────────
  app.patch('/payslips/:id', {
    preHandler: [requireAnyOf('FINANCE_MGR', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      notes?:            string;
      netSalary?:        number;
      additions?:        Record<string, number>;
      deductions?:       Record<string, number>;
      manualBonuses?:    number;
      manualDeductions?: number;
    };

    const existing = await prisma.payslip.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: 'NOT_FOUND' });
    if (existing.status === 'PAID') return reply.code(400).send({ error: 'Cannot edit a PAID payslip' });

    const payslip = await prisma.payslip.update({
      where: { id },
      data: {
        ...(body.notes            !== undefined ? { notes:            body.notes }            : {}),
        ...(body.netSalary        !== undefined ? { netSalary:        body.netSalary }        : {}),
        ...(body.additions        !== undefined ? { additions:        body.additions }        : {}),
        ...(body.deductions       !== undefined ? { deductions:       body.deductions }       : {}),
        ...(body.manualBonuses    !== undefined ? { manualBonuses:    body.manualBonuses }    : {}),
        ...(body.manualDeductions !== undefined ? { manualDeductions: body.manualDeductions } : {}),
        status: 'DRAFT' as const, // reset to draft on edit (PAID payslips blocked above)
      },
    });
    return reply.send({ data: payslip });
  });

  // ── POST /v1/payroll/payslips/:id/confirm ─────────────────────────────────
  app.post('/payslips/:id/confirm', {
    preHandler: [requireAnyOf('FINANCE_MGR', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.payslip.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: 'NOT_FOUND' });
    if (existing.status === 'PAID') return reply.code(400).send({ error: 'Already PAID' });

    const payslip = await prisma.payslip.update({
      where: { id },
      data: { status: 'CONFIRMED', confirmedAt: new Date(), confirmedBy: req.actor!.sub },
    });
    return reply.send({ data: payslip });
  });

  // ── POST /v1/payroll/payslips/:id/pay ─────────────────────────────────────
  // Mark payslip as paid and send boleta email to employee
  app.post('/payslips/:id/pay', {
    preHandler: [requireAnyOf('FINANCE_MGR', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const payslip = await prisma.payslip.findUnique({
      where: { id },
      include: { employee: true, period: true },
    });
    if (!payslip) return reply.code(404).send({ error: 'NOT_FOUND' });
    if (payslip.status === 'PAID') return reply.code(400).send({ error: 'Already PAID' });

    const updated = await prisma.payslip.update({
      where: { id },
      data: { status: 'PAID', paidAt: new Date(), paidBy: req.actor!.sub },
    });

    // Send email if employee has an email address
    const emailSentAt = payslip.employee.email ? new Date() : null;
    if (payslip.employee.email) {
      const { subject, html } = buildPayslipEmail(payslip.employee, payslip, payslip.period);
      await sendEmail({
        to:      [payslip.employee.email, CC_EMAIL],
        subject,
        html,
      });
      await prisma.payslip.update({ where: { id }, data: { emailSentAt } });
    }

    return reply.send({ data: { ...updated, emailSentAt } });
  });
}
