import type { FastifyInstance } from 'fastify';
import { requireAnyOf } from '../../middleware/auth';
import { prisma } from '../../lib/prisma';
import * as AccountingService from './service';
import { getPLStatementV2, getBalanceSheet, getCashFlow } from './service';
import { createRequire } from 'module';
const _require = createRequire(__filename);
// pdf-parse v2 uses a class-based API (PDFParse class)
const { PDFParse } = _require('pdf-parse') as {
  PDFParse: new (opts: { data: Uint8Array; password?: string }) => { getText(): Promise<{ text: string }> }
};

export async function accountingRoutes(app: FastifyInstance) {
  app.get('/reports/pl', { preHandler: [requireAnyOf('ACCOUNTANT', 'FINANCE_MGR')] }, async (req, reply) => {
    const { periodId } = req.query as { periodId: string };
    const pl = await AccountingService.getPLStatement(periodId);
    return reply.send({ data: pl });
  });

  app.get('/ar-aging', { preHandler: [requireAnyOf('ACCOUNTANT', 'FINANCE_MGR')] }, async (_req, reply) => {
    const now = new Date();
    const invoices = await prisma.invoice.findMany({
      where: { paymentStatus: { not: 'PAID' }, entityType: 'CUSTOMER', docType: { in: ['FACTURA', 'BOLETA'] }, status: 'ACCEPTED' },
      select: { id: true, series: true, correlative: true, issueDate: true, paymentDueDate: true, totalPen: true, entityName: true, entityDocNo: true },
    });
    const aging = invoices.map((inv) => {
      const daysOustanding = inv.paymentDueDate ? Math.floor((now.getTime() - inv.paymentDueDate.getTime()) / 86400000) : 0;
      const bucket = daysOustanding <= 0 ? 'current' : daysOustanding <= 30 ? '1_30' : daysOustanding <= 60 ? '31_60' : daysOustanding <= 90 ? '61_90' : '91_plus';
      return { ...inv, daysOustanding, bucket };
    });
    return reply.send({ data: aging });
  });

  app.get('/journal-entries', { preHandler: [requireAnyOf('ACCOUNTANT', 'FINANCE_MGR')] }, async (req, reply) => {
    const { year, month, page = '1', limit = '50' } = req.query as { year?: string; month?: string; page?: string; limit?: string };
    const where: any = { status: 'POSTED' };
    if (year && month) {
      const period = await prisma.accountingPeriod.findFirst({
        where: { year: parseInt(year, 10), month: parseInt(month, 10) },
      });
      if (period) where.periodId = period.id;
      else where.periodId = 'none'; // return empty
    }
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [entries, total] = await Promise.all([
      prisma.journalEntry.findMany({
        where,
        include: { lines: { include: { account: { select: { code: true, name: true } } } }, period: true },
        orderBy: [{ entryDate: 'desc' }],
        skip,
        take: parseInt(limit, 10),
      }),
      prisma.journalEntry.count({ where }),
    ]);
    return reply.send({ data: entries, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  });

  app.post('/journal-entries', { preHandler: [requireAnyOf('ACCOUNTANT', 'FINANCE_MGR')] }, async (req, reply) => {
    const body = req.body as { entryDate: string; description: string; sourceModule: string; lines: { accountCode: string; debit?: number; credit?: number; description?: string }[] };
    const entry = await AccountingService.postJournalEntry({ ...body, entryDate: new Date(body.entryDate) }, req.actor!.sub);
    return reply.code(201).send({ data: entry });
  });

  // ── POST /v1/accounting/journal-entries/bulk-import ────────────────────────
  // Bulk-import historical journal entries (from Excel upload on the frontend)
  app.post('/journal-entries/bulk-import', { preHandler: [requireAnyOf('ACCOUNTANT', 'FINANCE_MGR')] }, async (req, reply) => {
    const { entries: rows } = req.body as {
      entries: Array<{
        entryDate: string;
        description: string;
        sourceModule?: string;
        lines: Array<{ accountCode: string; debit?: number; credit?: number; description?: string }>;
      }>;
    };
    if (!Array.isArray(rows) || rows.length === 0) {
      return reply.code(400).send({ error: 'entries array is required' });
    }
    const created: any[] = [];
    const errors: { row: number; message: string }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const entry = await AccountingService.postJournalEntry(
          { ...row, sourceModule: row.sourceModule ?? 'MANUAL_IMPORT', entryDate: new Date(row.entryDate) },
          req.actor!.sub,
        );
        created.push(entry);
      } catch (err: any) {
        errors.push({ row: i + 1, message: err?.message ?? 'Error' });
      }
    }
    return reply.code(201).send({ created: created.length, errors, total: rows.length });
  });

  app.get('/periods', { preHandler: [requireAnyOf('ACCOUNTANT', 'FINANCE_MGR')] }, async (_req, reply) => {
    const periods = await prisma.accountingPeriod.findMany({ orderBy: [{ year: 'desc' }, { month: 'desc' }] });
    return reply.send({ data: periods });
  });

  app.patch('/periods/:id/close', { preHandler: [requireAnyOf('FINANCE_MGR')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const period = await prisma.accountingPeriod.update({
      where: { id }, data: { status: 'CLOSED', closedAt: new Date(), closedBy: req.actor!.sub },
    });
    return reply.send({ data: period });
  });

  /* ── Chart of Accounts ────────────────────────────────────────────────── */

  app.get('/chart-of-accounts', { preHandler: [requireAnyOf('ACCOUNTANT', 'FINANCE_MGR')] }, async (_req, reply) => {
    const accounts = await prisma.chartOfAccount.findMany({
      where: { isActive: true },
      orderBy: [{ code: 'asc' }],
    });
    return reply.send({ data: accounts });
  });

  /* ── PCGE Financial Statements V2 ─────────────────────────────────────── */

  app.get('/reports/pl-v2', { preHandler: [requireAnyOf('ACCOUNTANT', 'FINANCE_MGR')] }, async (req, reply) => {
    const { year, month, mode } = req.query as { year?: string; month?: string; mode?: string };
    const now = new Date();
    const y = year  ? parseInt(year,  10) : now.getFullYear();
    const m = month ? parseInt(month, 10) : now.getMonth() + 1;
    const md = (mode === 'ytd' || mode === 'annual') ? mode : 'monthly';
    const data = await getPLStatementV2(y, m, md);
    return reply.send({ data });
  });

  app.get('/reports/balance-sheet', { preHandler: [requireAnyOf('ACCOUNTANT', 'FINANCE_MGR')] }, async (req, reply) => {
    const { year, month } = req.query as { year?: string; month?: string };
    const now = new Date();
    const y = year  ? parseInt(year,  10) : now.getFullYear();
    const m = month ? parseInt(month, 10) : now.getMonth() + 1;
    const data = await getBalanceSheet(y, m);
    return reply.send({ data });
  });

  app.get('/reports/cash-flow', { preHandler: [requireAnyOf('ACCOUNTANT', 'FINANCE_MGR')] }, async (req, reply) => {
    const { year, month, mode } = req.query as { year?: string; month?: string; mode?: string };
    const now = new Date();
    const y = year  ? parseInt(year,  10) : now.getFullYear();
    const m = month ? parseInt(month, 10) : now.getMonth() + 1;
    const md = (mode === 'ytd' || mode === 'annual') ? mode : 'monthly';
    const data = await getCashFlow(y, m, md);
    return reply.send({ data });
  });

  /* ── PDF Statement Parser ─────────────────────────────────────────────── */

  app.post('/parse-statement', { preHandler: [requireAnyOf('ACCOUNTANT', 'FINANCE_MGR')] }, async (req, reply) => {
    try {
      const { pdfBase64, password } = req.body as { pdfBase64: string; password?: string };
      if (!pdfBase64) return reply.code(400).send({ message: 'pdfBase64 is required' });

      const buffer = Buffer.from(pdfBase64, 'base64');
      let text: string;
      try {
        const parser = new PDFParse({ data: new Uint8Array(buffer), ...(password ? { password } : {}) });
        text = (await parser.getText()).text;
      } catch (pdfErr: any) {
        // pdf-parse/pdfjs throws PasswordException when the PDF is encrypted
        const msg: string = pdfErr?.message ?? pdfErr?.name ?? '';
        const isEncrypted = /password|Password|PasswordException|encrypted|Encrypted/i.test(msg)
          || pdfErr?.name === 'PasswordException';
        if (isEncrypted) {
          const wrongPwd = password != null;   // had a password but still got the error
          return reply.code(422).send({
            code: 'PDF_ENCRYPTED',
            message: wrongPwd
              ? 'Contraseña incorrecta. Inténtalo de nuevo.'
              : 'El PDF está protegido con contraseña.',
          });
        }
        throw pdfErr;   // re-throw non-password errors
      }

      const currency: 'PEN' | 'USD' = /USD|US\$|dólares|DÓLARES|DOLLARS/i.test(text) ? 'USD' : 'PEN';

      let openingBalance: number | null = null;
      let closingBalance: number | null = null;

      // Parse a numeric string like "12,500.00" or ".05" → number
      const parseAmt = (s: string) => parseFloat(s.replace(/,/g, ''));

      // ── Strategy 1: BCP "RESUMEN DEL MES" table ──────────────────────────
      // The summary row contains exactly 9 space-separated monetary values:
      //   [opening, 0.00, deposits, 0.00, withdrawals, 0.00, 0.00, closing, avg]
      // Example: "4,162.80 0.00 82,378.55 0.00 79,174.72 0.00 0.00 7,366.63 3,766.83"
      const amtPat = '[\\d,]+\\.\\d{2}';
      // Skip 6 intermediate values (positions 2–7) to land on position 8 = closing balance
      const nineNumRe = new RegExp(
        `^\\s*(${amtPat})(?:\\s+${amtPat}){6}\\s+(${amtPat})\\s+${amtPat}\\s*$`, 'm'
      );
      const nineMatch = text.match(nineNumRe);
      if (nineMatch) {
        openingBalance = parseAmt(nineMatch[1]);  // 1st value = SALDO CONTABLE AL inicio
        closingBalance = parseAmt(nineMatch[2]);  // 8th value = SALDO CONTABLE AL fin
      }

      // ── Strategy 2: Generic keyword patterns (Interbank, BBVA, Scotia) ──
      if (openingBalance === null) {
        const openPatterns = [
          /saldo\s+anterior\s*[:\s]+(?:S\/\s*)?([\d,]+\.\d{2})/i,
          /saldo\s+inicial\s*[:\s]+(?:S\/\s*)?([\d,]+\.\d{2})/i,
          /saldo\s+al\s+inicio[^0-9]*([\d,]+\.\d{2})/i,
          /balance\s+anterior\s*[:\s]+(?:S\/\s*)?([\d,]+\.\d{2})/i,
          /opening\s+balance\s*[:\s]+([\d,]+\.\d{2})/i,
        ];
        for (const p of openPatterns) {
          const m = text.match(p);
          if (m) { openingBalance = parseAmt(m[1]); break; }
        }
      }
      if (closingBalance === null) {
        const closePatterns = [
          /saldo\s+final\s*[:\s]+(?:S\/\s*)?([\d,]+\.\d{2})/i,
          /saldo\s+actual\s*[:\s]+(?:S\/\s*)?([\d,]+\.\d{2})/i,
          /saldo\s+al\s+cierre[^0-9]*([\d,]+\.\d{2})/i,
          /saldo\s+al\s+final[^0-9]*([\d,]+\.\d{2})/i,
          /total\s+saldo[^0-9]*([\d,]+\.\d{2})/i,
          /closing\s+balance\s*[:\s]+([\d,]+\.\d{2})/i,
        ];
        for (const p of closePatterns) {
          const m = text.match(p);
          if (m) { closingBalance = parseAmt(m[1]); break; }
        }
      }

      // ── Transaction extraction ─────────────────────────────────────────
      interface Txn { date: string; description: string; debit: number | null; credit: number | null; balance: number | null; }
      const transactions: Txn[] = [];
      const lines = text.split('\n');

      // BCP uses DD-MM (e.g. "01-06"); fallback DD/MM/YYYY for other banks
      const dateBcp     = /^(\d{2}-\d{2})\s+(.+)$/;
      const dateGeneric = /^(\d{2}\/\d{2}\/\d{4})\s+(.+)$/;

      for (const line of lines) {
        const trimmed = line.trim();
        const dm = trimmed.match(dateBcp) || trimmed.match(dateGeneric);
        if (!dm) continue;

        // Collect all monetary amounts on this line, noting trailing-dash debits
        const allAmounts: Array<{ value: number; hasDash: boolean }> = [];
        let match: RegExpExecArray | null;
        const re = /([\d,]*\.\d{2})(-?)/g;
        while ((match = re.exec(trimmed)) !== null) {
          const val = parseAmt(match[1]);
          if (isNaN(val) || val === 0 && match[1] === '.') continue;
          allAmounts.push({ value: val, hasDash: match[2] === '-' });
        }
        if (!allAmounts.length) continue;

        // Last amount = running balance; second-to-last = transaction amount
        const balance = allAmounts.length >= 2 ? allAmounts[allAmounts.length - 1].value : null;
        const txnAmt  = allAmounts.length >= 2 ? allAmounts[allAmounts.length - 2] : allAmounts[0];

        const debit  = txnAmt.hasDash ? txnAmt.value : null;
        const credit = txnAmt.hasDash ? null : txnAmt.value;

        // Strip amounts and extra whitespace from description
        const description = dm[2].replace(/([\d,]*\.\d{2})-?/g, '').replace(/\s+/g, ' ').trim().slice(0, 100);

        transactions.push({ date: dm[1], description, debit, credit, balance });
      }

      // ── Fallbacks from transaction running balances ───────────────────
      if (openingBalance === null && transactions.length > 0) {
        // For BCP, the first transaction's balance is AFTER the first movement,
        // so use it only as a last resort
        const firstWithBal = transactions.find(t => t.balance !== null);
        if (firstWithBal) openingBalance = firstWithBal.balance;
      }
      if (closingBalance === null && transactions.length > 0) {
        const last = [...transactions].reverse().find(t => t.balance !== null);
        if (last) closingBalance = last.balance;
      }

      return reply.send({
        data: {
          openingBalance,
          closingBalance,
          currency,
          transactionCount: transactions.length,
          transactions,
          rawTextSnippet: text.slice(0, 2000),
        },
      });
    } catch (err: any) {
      app.log.error(err);
      return reply.code(500).send({ message: 'Error al procesar el PDF: ' + (err?.message ?? 'unknown') });
    }
  });
}
