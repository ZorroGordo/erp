import type { FastifyInstance } from 'fastify';
import { requireAnyOf } from '../../middleware/auth';
import { prisma } from '../../lib/prisma';
import * as PayrollService from './service';

export async function payrollRoutes(app: FastifyInstance) {
  app.get('/employees', { preHandler: [requireAnyOf('FINANCE_MGR')] }, async (_req, reply) => {
    const employees = await prisma.employee.findMany({ where: { isActive: true }, orderBy: { fullName: 'asc' } });
    return reply.send({ data: employees });
  });

  app.post('/employees', { preHandler: [requireAnyOf('FINANCE_MGR')] }, async (req, reply) => {
    const employee = await prisma.employee.create({ data: req.body as never });
    return reply.code(201).send({ data: employee });
  });

  app.patch('/employees/:id', { preHandler: [requireAnyOf('FINANCE_MGR', 'SUPER_ADMIN')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as never;
    const employee = await prisma.employee.update({ where: { id }, data: body });
    return reply.send({ data: employee });
  });

  app.post('/periods/:id/process', { preHandler: [requireAnyOf('FINANCE_MGR')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const employees = await prisma.employee.findMany({ where: { isActive: true } });
    const payslips = await Promise.all(
      employees.map(async (emp) => {
        const calc = await PayrollService.calculatePayslip(emp.id, id);
        return prisma.payslip.upsert({
          where: { employeeId_periodId: { employeeId: emp.id, periodId: id } },
          create: { employeeId: emp.id, periodId: id, grossSalary: calc.grossSalary, additions: calc.additions, deductions: calc.deductions, netSalary: calc.netSalary, igv5taWithheld: calc.deductions.igv5taCategoria, essaludEmployer: calc.employerContributions.essalud, ctsProvision: calc.provisions.cts, vacationProvision: calc.provisions.vacaciones, employerTotalCost: calc.employerTotalCost },
          update: {},
        });
      })
    );
    await prisma.payPeriod.update({ where: { id }, data: { status: 'PROCESSED', processedAt: new Date(), processedBy: req.actor!.sub } });
    return reply.send({ data: { processed: payslips.length } });
  });

  app.get('/periods/:id/payslips', { preHandler: [requireAnyOf('FINANCE_MGR')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const payslips = await prisma.payslip.findMany({ where: { periodId: id }, include: { employee: true } });
    return reply.send({ data: payslips });
  });
}
