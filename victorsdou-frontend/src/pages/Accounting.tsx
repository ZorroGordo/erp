import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useState, useRef, useCallback, Fragment } from 'react';
import {
  Calculator, Building2, FileText, Plus, Trash2, Download, Upload,
  Loader2, Sparkles, AlertTriangle, X, Link2, Receipt, ShoppingCart,
  CheckCircle2, Clock, ChevronRight, Lock, ChevronLeft, ChevronDown,
  BarChart3, TrendingUp, Activity, BookOpen, ArrowUpRight, ArrowDownRight,
  Minus, Scale,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { fmtMoney, fmtNum } from '../lib/fmt';

// ─── Types ────────────────────────────────────────────────────────────────────

type TopTab = 'financials' | 'entries' | 'reconciliation';
type FinancialView = 'pl' | 'balance' | 'cashflow';
type PeriodMode = 'monthly' | 'ytd' | 'annual';

interface BankAccount {
  id: string;
  bank: 'BCP' | 'Interbank' | 'ScotiaBank' | 'BBVA' | 'Otro';
  bankCustom?: string;
  alias: string;
  accountNumber: string;
  currency: 'PEN' | 'USD';
  accountType: 'Corriente' | 'Ahorros';
  isMain: boolean;
  createdAt: string;
}

interface Consolidation {
  id: string;
  accountId: string;
  period: string;
  openingBalance: number;
  closingBalance: number;
  pdfName?: string;
  notes?: string;
  createdAt: string;
}

interface ParsedStatement {
  openingBalance: number | null;
  closingBalance: number | null;
  currency: 'PEN' | 'USD';
  transactionCount: number;
  transactions: { date: string; description: string; debit: number | null; credit: number | null; balance: number | null }[];
  rawTextSnippet: string;
}

interface LinkedDoc {
  type: 'invoice' | 'purchase_order' | 'upload';
  displayName: string;
  id?: string;
  amount?: number;
  docType?: string;
  filename?: string;
}

interface BankTransaction {
  id: string;
  date: string;
  description: string;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  linkedDoc: LinkedDoc | null;
}

interface LineItem { code: string; name: string; balance: number; }

// ─── localStorage helpers ─────────────────────────────────────────────────────
const ACCOUNTS_KEY   = 'victoros_bank_accounts';
const CONSOL_KEY     = 'victoros_consolidations';
const TXNS_KEY       = 'victoros_bank_txns';
const PASSWORDS_KEY  = 'victoros_pdf_passwords';

function loadJSON<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? '') as T; }
  catch { return fallback; }
}

const BLANK_ACCOUNT = {
  bank: 'BCP' as BankAccount['bank'], bankCustom: '',
  alias: '', accountNumber: '',
  currency: 'PEN' as 'PEN' | 'USD',
  accountType: 'Corriente' as 'Corriente' | 'Ahorros',
  isMain: false,
};

// ─── Formatting helpers ───────────────────────────────────────────────────────
const fmtAmt = (v: number, opts?: { parens?: boolean; sign?: boolean }) => {
  const abs = Math.abs(v);
  const formatted = `S/ ${abs.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (opts?.parens && v < 0) return `(${formatted})`;
  if (opts?.sign && v > 0) return `+${formatted}`;
  return v < 0 ? `(${formatted})` : formatted;
};
const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
const varPct = (curr: number, prior: number) =>
  prior === 0 ? null : ((curr - prior) / Math.abs(prior)) * 100;

const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ label, indent = 0 }: { label: string; indent?: number }) {
  return (
    <tr className="bg-brand-50/60">
      <td colSpan={4} className="px-5 py-2" style={{ paddingLeft: `${20 + indent * 16}px` }}>
        <span className="text-xs font-bold uppercase tracking-wider text-brand-700">{label}</span>
      </td>
    </tr>
  );
}

function DataRow({
  label, current, prior, indent = 1, bold = false, green = false, red = false, italic = false,
  negate = false, isPercent = false, parens = false,
}: {
  label: string; current: number; prior?: number; indent?: number; bold?: boolean;
  green?: boolean; red?: boolean; italic?: boolean; negate?: boolean;
  isPercent?: boolean; parens?: boolean;
}) {
  const dispCurr = negate ? -current : current;
  const dispPrior = prior !== undefined ? (negate ? -prior : prior) : undefined;
  const pct = dispPrior !== undefined ? varPct(dispCurr, dispPrior) : null;
  const colorCls = green ? 'text-green-700' : red ? 'text-red-600' : 'text-gray-800';
  const boldCls  = bold ? 'font-semibold' : 'font-normal';
  const italicCls = italic ? 'italic' : '';
  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
      <td className={`px-5 py-2 text-sm ${boldCls} ${italicCls} ${colorCls}`}
          style={{ paddingLeft: `${20 + indent * 16}px` }}>
        {label}
      </td>
      <td className={`px-5 py-2 text-right text-sm font-mono ${boldCls} ${colorCls}`}>
        {isPercent ? `${dispCurr.toFixed(1)}%` : fmtAmt(dispCurr, { parens })}
      </td>
      <td className={`px-5 py-2 text-right text-sm font-mono text-gray-400 ${dispPrior === undefined ? 'text-transparent' : ''}`}>
        {dispPrior !== undefined
          ? (isPercent ? `${dispPrior.toFixed(1)}%` : fmtAmt(dispPrior, { parens }))
          : '—'}
      </td>
      <td className="px-5 py-2 text-right text-xs font-medium w-20">
        {pct !== null ? (
          <span className={`inline-flex items-center gap-0.5 ${
            pct > 0 ? 'text-green-600' : pct < 0 ? 'text-red-500' : 'text-gray-400'
          }`}>
            {pct > 0 ? <ArrowUpRight size={11} /> : pct < 0 ? <ArrowDownRight size={11} /> : <Minus size={11} />}
            {Math.abs(pct).toFixed(0)}%
          </span>
        ) : null}
      </td>
    </tr>
  );
}

function SubtotalRow({ label, current, prior, color = 'gray', double = false }: {
  label: string; current: number; prior?: number; color?: 'green' | 'red' | 'gray' | 'brand'; double?: boolean;
}) {
  const pct = prior !== undefined ? varPct(current, prior) : null;
  const colorMap = { green: 'text-green-700 bg-green-50', red: 'text-red-700 bg-red-50', gray: 'text-gray-800 bg-gray-100', brand: 'text-brand-800 bg-brand-100' };
  const cls = colorMap[color];
  return (
    <tr className={`${cls} ${double ? 'border-t-2 border-b-2' : 'border-t border-b'} border-current/20`}>
      <td className="px-5 py-2.5 text-sm font-bold pl-5">{label}</td>
      <td className="px-5 py-2.5 text-right text-sm font-bold font-mono">{fmtAmt(current)}</td>
      <td className="px-5 py-2.5 text-right text-sm font-mono text-gray-500">{prior !== undefined ? fmtAmt(prior) : '—'}</td>
      <td className="px-5 py-2.5 text-right text-xs font-medium w-20">
        {pct !== null ? (
          <span className={`inline-flex items-center gap-0.5 ${pct > 0 ? 'text-green-600' : pct < 0 ? 'text-red-500' : 'text-gray-400'}`}>
            {pct > 0 ? <ArrowUpRight size={11} /> : pct < 0 ? <ArrowDownRight size={11} /> : <Minus size={11} />}
            {Math.abs(pct).toFixed(0)}%
          </span>
        ) : null}
      </td>
    </tr>
  );
}

function StatTable({ children, periodLabel, priorLabel }: {
  children: React.ReactNode; periodLabel: string; priorLabel: string;
}) {
  return (
    <table className="w-full">
      <thead>
        <tr className="border-b-2 border-brand-200">
          <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-1/2">Concepto</th>
          <th className="px-5 py-3 text-right text-xs font-semibold text-brand-700 uppercase tracking-wide w-[22%]">{periodLabel}</th>
          <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wide w-[22%]">{priorLabel}</th>
          <th className="px-5 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wide w-[10%]">Var.</th>
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

function Spacer() {
  return <tr><td colSpan={4} className="py-1" /></tr>;
}

// ─── P&L Statement ────────────────────────────────────────────────────────────
function PLStatement({ year, month, mode }: { year: number; month: number; mode: PeriodMode }) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const toggle = (s: string) => setExpandedSections(prev => {
    const next = new Set(prev);
    next.has(s) ? next.delete(s) : next.add(s);
    return next;
  });

  const { data, isLoading } = useQuery({
    queryKey: ['pl-v2', year, month, mode],
    queryFn: () => api.get(`/v1/accounting/reports/pl-v2?year=${year}&month=${month}&mode=${mode}`).then(r => r.data.data),
    staleTime: 60_000,
  });

  const periodLabel = mode === 'monthly' ? `${MONTHS_ES[month-1]} ${year}`
                    : mode === 'ytd'     ? `Ene–${MONTHS_ES[month-1]} ${year}`
                    :                     `Año ${year}`;
  const priorLabel  = mode === 'monthly' ? `${MONTHS_ES[month-1]} ${year-1}`
                    : mode === 'ytd'     ? `Ene–${MONTHS_ES[month-1]} ${year-1}`
                    :                     `Año ${year-1}`;

  if (isLoading) return <div className="py-16 text-center text-gray-400"><Loader2 size={24} className="animate-spin mx-auto" /></div>;

  if (!data) return null;

  const d = data;
  const ventas   = d.ventas.total;
  const utilNeta = d.utilidadNeta.total;
  const margenBruto = ventas > 0 ? (d.utilidadBruta.total / ventas) * 100 : 0;
  const margenOp    = ventas > 0 ? (d.utilidadOperativa.total / ventas) * 100 : 0;
  const margenNeto  = ventas > 0 ? (utilNeta / ventas) * 100 : 0;

  return (
    <div>
      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Ventas Netas',      value: ventas,                   prior: d.ventas.prior,             color: 'blue'  },
          { label: 'Utilidad Bruta',    value: d.utilidadBruta.total,   prior: d.utilidadBruta.prior,      color: 'teal'  },
          { label: 'Utilidad Op.',      value: d.utilidadOperativa.total, prior: d.utilidadOperativa.prior, color: 'brand' },
          { label: 'Utilidad Neta',     value: utilNeta,                  prior: d.utilidadNeta.prior,      color: 'green' },
        ].map(({ label, value, prior, color }) => {
          const pct = varPct(value, prior);
          const colorMap: Record<string, string> = {
            blue: 'bg-blue-50 text-blue-700 border-blue-200',
            teal: 'bg-teal-50 text-teal-700 border-teal-200',
            brand: 'bg-brand-50 text-brand-700 border-brand-200',
            green: value >= 0 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200',
          };
          return (
            <div key={label} className={`rounded-xl border p-4 ${colorMap[color]}`}>
              <p className="text-xs font-medium uppercase tracking-wide opacity-70 mb-1">{label}</p>
              <p className="text-xl font-bold font-mono">{fmtAmt(value)}</p>
              {pct !== null && (
                <p className={`text-xs mt-1 flex items-center gap-0.5 ${pct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {pct >= 0 ? <ArrowUpRight size={11}/> : <ArrowDownRight size={11}/>}
                  {Math.abs(pct).toFixed(0)}% vs año anterior
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Statement */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <StatTable periodLabel={periodLabel} priorLabel={priorLabel}>

          <SectionHeader label="Ingresos Operativos" />
          {d.ventas.items.map((i: LineItem) => (
            <DataRow key={i.code} label={`${i.code} — ${i.name}`} current={i.balance} indent={2} />
          ))}
          {d.ventas.items.length === 0 && (
            <tr><td colSpan={4} className="px-12 py-2 text-xs text-gray-400 italic">Sin movimientos en ventas</td></tr>
          )}
          {d.otrosIngresos.items.length > 0 && (
            <>
              <DataRow label="Otros ingresos operativos" current={d.otrosIngresos.total} indent={2} italic />
            </>
          )}
          <SubtotalRow label="TOTAL INGRESOS" current={d.ventas.total + d.otrosIngresos.total} prior={d.ventas.prior} color="brand" />

          <Spacer />
          <SectionHeader label="Costo de Ventas" />
          {d.costoVentas.items.map((i: LineItem) => (
            <DataRow key={i.code} label={`${i.code} — ${i.name}`} current={i.balance} negate indent={2} parens />
          ))}
          {d.costoVentas.items.length === 0 && (
            <tr><td colSpan={4} className="px-12 py-2 text-xs text-gray-400 italic">Sin costo de ventas</td></tr>
          )}
          <DataRow label="(−) Total costo de ventas" current={d.costoVentas.total} prior={d.costoVentas.prior} indent={1} bold negate parens red />

          <Spacer />
          <SubtotalRow
            label="UTILIDAD BRUTA"
            current={d.utilidadBruta.total}
            prior={d.utilidadBruta.prior}
            color={d.utilidadBruta.total >= 0 ? 'green' : 'red'}
          />
          <DataRow label="% Margen Bruto" current={margenBruto} indent={1} italic isPercent green={margenBruto >= 0} />

          <Spacer />
          <SectionHeader label="Gastos Operativos (por naturaleza)" />
          {d.gastosPersonal.items.map((i: LineItem) => (
            <DataRow key={i.code} label={`${i.code} — ${i.name}`} current={i.balance} indent={2} parens red />
          ))}
          {d.gastosDiversos.items.map((i: LineItem) => (
            <DataRow key={i.code} label={`${i.code} — ${i.name}`} current={i.balance} indent={2} parens />
          ))}
          {d.deprecAmort.items.map((i: LineItem) => (
            <DataRow key={i.code} label={`${i.code} — ${i.name}`} current={i.balance} indent={2} parens italic />
          ))}
          {(d.gastosPersonal.total + d.gastosDiversos.total + d.deprecAmort.total) === 0 && (
            <tr><td colSpan={4} className="px-12 py-2 text-xs text-gray-400 italic">Sin gastos operativos</td></tr>
          )}
          <DataRow label="(−) Total gastos operativos" current={d.totalGastosOperativos.total} indent={1} bold negate parens red />

          <Spacer />
          <SubtotalRow
            label="UTILIDAD OPERATIVA (EBIT)"
            current={d.utilidadOperativa.total}
            prior={d.utilidadOperativa.prior}
            color={d.utilidadOperativa.total >= 0 ? 'green' : 'red'}
          />
          <DataRow label="% Margen Operativo" current={margenOp} indent={1} italic isPercent green={margenOp >= 0} />

          <Spacer />
          <SectionHeader label="Resultado Financiero" />
          {d.ingresosFinancieros.items.map((i: LineItem) => (
            <DataRow key={i.code} label={`(+) ${i.code} — ${i.name}`} current={i.balance} indent={2} green />
          ))}
          {d.gastosFinancieros.items.map((i: LineItem) => (
            <DataRow key={i.code} label={`(−) ${i.code} — ${i.name}`} current={i.balance} indent={2} negate parens red />
          ))}
          {d.ingresosFinancieros.total === 0 && d.gastosFinancieros.total === 0 && (
            <tr><td colSpan={4} className="px-12 py-2 text-xs text-gray-400 italic">Sin resultados financieros</td></tr>
          )}

          <Spacer />
          <DataRow label="Utilidad antes de Impuestos" current={d.utilidadAntesIR.total} indent={1} bold />

          <SectionHeader label="Impuesto a la Renta" />
          {d.impuestoRenta.items.map((i: LineItem) => (
            <DataRow key={i.code} label={`${i.code} — ${i.name}`} current={i.balance} indent={2} negate parens red />
          ))}
          {d.impuestoRenta.items.length === 0 && (
            <tr><td colSpan={4} className="px-12 py-2 text-xs text-gray-400 italic">Sin impuesto a la renta registrado</td></tr>
          )}

          <Spacer />
          <SubtotalRow
            label="UTILIDAD NETA DEL PERÍODO"
            current={d.utilidadNeta.total}
            prior={d.utilidadNeta.prior}
            color={d.utilidadNeta.total >= 0 ? 'green' : 'red'}
            double
          />
          <DataRow label="% Margen Neto" current={margenNeto} indent={1} italic isPercent green={margenNeto >= 0} />

        </StatTable>
      </div>
    </div>
  );
}

// ─── Balance Sheet Statement ──────────────────────────────────────────────────
function BalanceSheet({ year, month }: { year: number; month: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['balance-sheet', year, month],
    queryFn: () => api.get(`/v1/accounting/reports/balance-sheet?year=${year}&month=${month}`).then(r => r.data.data),
    staleTime: 60_000,
  });

  const periodLabel = `Al ${new Date(Date.UTC(year, month - 1, 28)).toLocaleDateString('es-PE', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}`;

  if (isLoading) return <div className="py-16 text-center text-gray-400"><Loader2 size={24} className="animate-spin mx-auto" /></div>;
  if (!data) return null;

  const d = data;
  const isBalanced = d.ecuacionContable.balanced;

  return (
    <div>
      {/* Balance check pill */}
      <div className="flex items-center gap-3 mb-6">
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium ${isBalanced ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          <Scale size={15} />
          {isBalanced
            ? `Ecuación contable cuadrada · Activo = Pasivo + Patrimonio = ${fmtAmt(d.ecuacionContable.activo)}`
            : `⚠️ Desbalance: Activo ${fmtAmt(d.ecuacionContable.activo)} ≠ Pasivo+Pat. ${fmtAmt(d.ecuacionContable.pasivoPatrimonio)}`}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* ACTIVO */}
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <div className="px-5 py-3 bg-blue-50 border-b border-blue-200">
            <h3 className="font-bold text-blue-800 text-sm uppercase tracking-wide">ACTIVO</h3>
            <p className="text-xs text-blue-600 font-mono mt-0.5">{periodLabel}</p>
          </div>
          <table className="w-full">
            <tbody>
              <SectionHeader label="Activo Corriente" />
              <DataRow label="Efectivo y equivalentes" current={d.activo.corriente.efectivo.total} indent={2} />
              {d.activo.corriente.efectivo.items.map((i: LineItem) => (
                <DataRow key={i.code} label={`${i.code} ${i.name}`} current={i.balance} indent={3} italic />
              ))}
              <DataRow label="Cuentas por cobrar" current={d.activo.corriente.cuentasCobrar.total} indent={2} />
              {d.activo.corriente.cuentasCobrar.items.map((i: LineItem) => (
                <DataRow key={i.code} label={`${i.code} ${i.name}`} current={i.balance} indent={3} italic />
              ))}
              <DataRow label="Existencias" current={d.activo.corriente.existencias.total} indent={2} />
              {d.activo.corriente.existencias.items.map((i: LineItem) => (
                <DataRow key={i.code} label={`${i.code} ${i.name}`} current={i.balance} indent={3} italic />
              ))}
              {d.activo.corriente.otros.total !== 0 && (
                <DataRow label="Otros activos corrientes" current={d.activo.corriente.otros.total} indent={2} italic />
              )}
              <SubtotalRow label="TOTAL ACTIVO CORRIENTE" current={d.activo.corriente.total} color="brand" />
              <Spacer />
              <SectionHeader label="Activo No Corriente" />
              <DataRow label="Inmuebles, maquinaria y equipo" current={d.activo.noCorriente.activoFijo.total} indent={2} />
              {d.activo.noCorriente.activoFijo.items.map((i: LineItem) => (
                <DataRow key={i.code} label={`${i.code} ${i.name}`} current={i.balance} indent={3} italic />
              ))}
              {d.activo.noCorriente.intangibles.total !== 0 && (
                <DataRow label="Intangibles" current={d.activo.noCorriente.intangibles.total} indent={2} />
              )}
              {d.activo.noCorriente.depreciacion.total !== 0 && (
                <DataRow label="(−) Depreciación acumulada" current={d.activo.noCorriente.depreciacion.total} indent={2} parens red />
              )}
              <SubtotalRow label="TOTAL ACTIVO NO CORRIENTE" current={d.activo.noCorriente.total} color="brand" />
              <Spacer />
              <SubtotalRow label="TOTAL ACTIVO" current={d.activo.total} color="gray" double />
            </tbody>
          </table>
        </div>

        {/* PASIVO + PATRIMONIO */}
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <div className="px-5 py-3 bg-orange-50 border-b border-orange-200">
            <h3 className="font-bold text-orange-800 text-sm uppercase tracking-wide">PASIVO Y PATRIMONIO</h3>
            <p className="text-xs text-orange-600 font-mono mt-0.5">{periodLabel}</p>
          </div>
          <table className="w-full">
            <tbody>
              <SectionHeader label="Pasivo Corriente" />
              {d.pasivo.corriente.cuentasPagar.total !== 0 && (
                <DataRow label="Cuentas por pagar comerciales" current={d.pasivo.corriente.cuentasPagar.total} indent={2} />
              )}
              {d.pasivo.corriente.tributos.total !== 0 && (
                <DataRow label="Tributos por pagar" current={d.pasivo.corriente.tributos.total} indent={2} />
              )}
              {d.pasivo.corriente.remuneraciones.total !== 0 && (
                <DataRow label="Remuneraciones por pagar" current={d.pasivo.corriente.remuneraciones.total} indent={2} />
              )}
              {d.pasivo.corriente.otros.total !== 0 && (
                <DataRow label="Otras cuentas por pagar" current={d.pasivo.corriente.otros.total} indent={2} />
              )}
              {d.pasivo.corriente.total === 0 && (
                <tr><td colSpan={4} className="px-12 py-2 text-xs text-gray-400 italic">Sin pasivos corrientes</td></tr>
              )}
              <SubtotalRow label="TOTAL PASIVO CORRIENTE" current={d.pasivo.corriente.total} color="brand" />
              <Spacer />
              <SectionHeader label="Pasivo No Corriente" />
              {d.pasivo.noCorriente.obligacionesFinancieras.total !== 0 && (
                <DataRow label="Obligaciones financieras LP" current={d.pasivo.noCorriente.obligacionesFinancieras.total} indent={2} />
              )}
              {d.pasivo.noCorriente.total === 0 && (
                <tr><td colSpan={4} className="px-12 py-2 text-xs text-gray-400 italic">Sin pasivos no corrientes</td></tr>
              )}
              <SubtotalRow label="TOTAL PASIVO NO CORRIENTE" current={d.pasivo.noCorriente.total} color="brand" />
              <Spacer />
              <SubtotalRow label="TOTAL PASIVO" current={d.pasivo.total} color="red" />
              <Spacer />
              <SectionHeader label="Patrimonio" />
              {d.patrimonio.capital.total !== 0 && (
                <DataRow label="Capital social" current={d.patrimonio.capital.total} indent={2} />
              )}
              {d.patrimonio.reservas.total !== 0 && (
                <DataRow label="Reservas" current={d.patrimonio.reservas.total} indent={2} />
              )}
              {d.patrimonio.resultadosAcumulados.total !== 0 && (
                <DataRow label="Resultados acumulados" current={d.patrimonio.resultadosAcumulados.total} indent={2} />
              )}
              <DataRow
                label="Resultado del ejercicio"
                current={d.patrimonio.resultadoPeriodo.total}
                indent={2}
                bold
                green={d.patrimonio.resultadoPeriodo.total >= 0}
                red={d.patrimonio.resultadoPeriodo.total < 0}
              />
              <Spacer />
              <SubtotalRow label="TOTAL PATRIMONIO" current={d.patrimonio.total} color="green" />
              <Spacer />
              <SubtotalRow label="TOTAL PASIVO Y PATRIMONIO" current={d.totalPasivoPatrimonio} color="gray" double />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Cash Flow Statement ──────────────────────────────────────────────────────
function CashFlow({ year, month, mode }: { year: number; month: number; mode: PeriodMode }) {
  const { data, isLoading } = useQuery({
    queryKey: ['cash-flow', year, month, mode],
    queryFn: () => api.get(`/v1/accounting/reports/cash-flow?year=${year}&month=${month}&mode=${mode}`).then(r => r.data.data),
    staleTime: 60_000,
  });

  const periodLabel = mode === 'monthly' ? `${MONTHS_ES[month-1]} ${year}`
                    : mode === 'ytd'     ? `Ene–${MONTHS_ES[month-1]} ${year}`
                    :                     `Año ${year}`;

  if (isLoading) return <div className="py-16 text-center text-gray-400"><Loader2 size={24} className="animate-spin mx-auto" /></div>;
  if (!data) return null;

  const d = data;
  const ct = d.operaciones.capitalTrabajo;

  return (
    <div>
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Flujo Operaciones',     value: d.operaciones.total,    icon: Activity },
          { label: 'Flujo Inversiones',     value: d.inversion.total,      icon: TrendingUp },
          { label: 'Flujo Financiamiento',  value: d.financiamiento.total, icon: BarChart3 },
          { label: 'Variación Neta Caja',   value: d.variacionNeta,        icon: CheckCircle2 },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className={`rounded-xl border p-4 ${value >= 0 ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
            <div className="flex items-center gap-2 mb-1">
              <Icon size={14} className="opacity-70" />
              <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
            </div>
            <p className="text-xl font-bold font-mono">{fmtAmt(value)}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <div className="px-5 py-3 bg-brand-50 border-b border-brand-200">
          <h3 className="font-bold text-brand-800 text-sm">ESTADO DE FLUJOS DE EFECTIVO</h3>
          <p className="text-xs text-brand-600">Método Indirecto — NIC 7 — {periodLabel}</p>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-brand-200">
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Concepto</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-brand-700 uppercase tracking-wide w-48">{periodLabel}</th>
            </tr>
          </thead>
          <tbody>
            {/* A. Operaciones */}
            <SectionHeader label="A. Actividades de Operación" />
            <tr className="border-b border-gray-50 hover:bg-gray-50/50">
              <td className="px-5 py-2 text-sm pl-12">Utilidad neta del período</td>
              <td className="px-5 py-2 text-right text-sm font-mono">{fmtAmt(d.operaciones.utilidadNeta)}</td>
            </tr>
            <SectionHeader label="Ajustes por partidas no monetarias" indent={1} />
            <tr className="border-b border-gray-50 hover:bg-gray-50/50">
              <td className="px-5 py-2 text-sm pl-16 italic">Depreciación y amortización</td>
              <td className="px-5 py-2 text-right text-sm font-mono">{fmtAmt(d.operaciones.ajustes.depreciacionAmortizacion)}</td>
            </tr>
            <SectionHeader label="Cambios en capital de trabajo" indent={1} />
            {[
              { k: 'cuentasCobrar',   l: 'Cuentas por cobrar' },
              { k: 'inventarios',     l: 'Existencias' },
              { k: 'otrosActivosCte', l: 'Otros activos corrientes' },
              { k: 'cuentasPagar',    l: 'Cuentas por pagar' },
              { k: 'tributosXPagar',  l: 'Tributos por pagar' },
              { k: 'remuneraciones',  l: 'Remuneraciones por pagar' },
              { k: 'otrosPasivos',    l: 'Otros pasivos corrientes' },
            ].filter(({ k }) => Math.abs((ct as any)[k]) > 0.01).map(({ k, l }) => (
              <tr key={k} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="px-5 py-2 text-sm pl-16">{l}</td>
                <td className={`px-5 py-2 text-right text-sm font-mono ${(ct as any)[k] >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {fmtAmt((ct as any)[k])}
                </td>
              </tr>
            ))}
            <tr className={`border-t border-b-2 font-semibold ${d.operaciones.total >= 0 ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              <td className="px-5 py-2.5 text-sm font-bold pl-5">FLUJO NETO — OPERACIONES</td>
              <td className="px-5 py-2.5 text-right text-sm font-bold font-mono">{fmtAmt(d.operaciones.total)}</td>
            </tr>
            <Spacer />

            {/* B. Inversión */}
            <SectionHeader label="B. Actividades de Inversión" />
            {d.inversion.activoFijo !== 0 && (
              <tr className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="px-5 py-2 text-sm pl-12">Adquisición / Venta de activo fijo</td>
                <td className={`px-5 py-2 text-right text-sm font-mono ${d.inversion.activoFijo >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {fmtAmt(d.inversion.activoFijo)}
                </td>
              </tr>
            )}
            {d.inversion.activoFijo === 0 && (
              <tr><td colSpan={2} className="px-12 py-2 text-xs text-gray-400 italic">Sin actividades de inversión</td></tr>
            )}
            <tr className={`border-t border-b-2 font-semibold ${d.inversion.total >= 0 ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              <td className="px-5 py-2.5 text-sm font-bold pl-5">FLUJO NETO — INVERSIÓN</td>
              <td className="px-5 py-2.5 text-right text-sm font-bold font-mono">{fmtAmt(d.inversion.total)}</td>
            </tr>
            <Spacer />

            {/* C. Financiamiento */}
            <SectionHeader label="C. Actividades de Financiamiento" />
            {d.financiamiento.deudas !== 0 && (
              <tr className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="px-5 py-2 text-sm pl-12">Préstamos / Amortización deudas</td>
                <td className={`px-5 py-2 text-right text-sm font-mono ${d.financiamiento.deudas >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {fmtAmt(d.financiamiento.deudas)}
                </td>
              </tr>
            )}
            {d.financiamiento.aporteCapital !== 0 && (
              <tr className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="px-5 py-2 text-sm pl-12">Aportes de capital</td>
                <td className="px-5 py-2 text-right text-sm font-mono text-green-700">{fmtAmt(d.financiamiento.aporteCapital)}</td>
              </tr>
            )}
            {d.financiamiento.resultados !== 0 && (
              <tr className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="px-5 py-2 text-sm pl-12">Dividendos / Resultados acumulados</td>
                <td className={`px-5 py-2 text-right text-sm font-mono ${d.financiamiento.resultados >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {fmtAmt(d.financiamiento.resultados)}
                </td>
              </tr>
            )}
            {d.financiamiento.deudas === 0 && d.financiamiento.aporteCapital === 0 && d.financiamiento.resultados === 0 && (
              <tr><td colSpan={2} className="px-12 py-2 text-xs text-gray-400 italic">Sin actividades de financiamiento</td></tr>
            )}
            <tr className={`border-t border-b-2 font-semibold ${d.financiamiento.total >= 0 ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              <td className="px-5 py-2.5 text-sm font-bold pl-5">FLUJO NETO — FINANCIAMIENTO</td>
              <td className="px-5 py-2.5 text-right text-sm font-bold font-mono">{fmtAmt(d.financiamiento.total)}</td>
            </tr>
            <Spacer />

            {/* Reconciliation */}
            <tr className="bg-brand-800 text-white border-t-2 border-brand-900">
              <td className="px-5 py-3 text-sm font-bold pl-5">VARIACIÓN NETA DE EFECTIVO</td>
              <td className="px-5 py-3 text-right text-sm font-bold font-mono">{fmtAmt(d.variacionNeta)}</td>
            </tr>
            <tr className="bg-gray-50 text-gray-600">
              <td className="px-5 py-2 text-sm pl-12">Saldo inicial de efectivo</td>
              <td className="px-5 py-2 text-right text-sm font-mono">{fmtAmt(d.efectivoInicial)}</td>
            </tr>
            <tr className="bg-gray-50 text-gray-800 border-t border-gray-200">
              <td className="px-5 py-2.5 text-sm font-semibold pl-12">Saldo final de efectivo</td>
              <td className={`px-5 py-2.5 text-right text-sm font-bold font-mono ${d.efectivoFinal >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {fmtAmt(d.efectivoFinal)}
              </td>
            </tr>
            {!d.conciliacion && (
              <tr className="bg-amber-50">
                <td colSpan={2} className="px-5 py-2 text-xs text-amber-700">
                  ⚠️ El saldo final no concilia. Verifique que todos los asientos estén correctamente registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Journal Entries Tab ──────────────────────────────────────────────────────
function JournalEntriesTab({ year, month }: { year: number; month: number }) {
  const [selectedEntry, setSelectedEntry] = useState<any | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['journal-entries', year, month],
    queryFn: () => api.get(`/v1/accounting/journal-entries?year=${year}&month=${month}&limit=100`).then(r => r.data),
    staleTime: 30_000,
  });

  const entries = data?.data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          {data?.total ?? 0} asientos contables en {MONTHS_ES[month-1]} {year}
        </p>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-gray-400"><Loader2 size={24} className="animate-spin mx-auto" /></div>
      ) : entries.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <BookOpen size={36} className="mx-auto mb-3 text-gray-300" />
          <p className="font-medium">No hay asientos contables</p>
          <p className="text-sm mt-1">Los asientos se generan automáticamente al procesar ventas, compras, planilla y otros módulos.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-brand-50 text-brand-700 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-5 py-3 text-left">N° Asiento</th>
                <th className="px-5 py-3 text-left">Fecha</th>
                <th className="px-5 py-3 text-left">Descripción</th>
                <th className="px-5 py-3 text-left">Módulo</th>
                <th className="px-5 py-3 text-right">Débito</th>
                <th className="px-5 py-3 text-right">Crédito</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((e: any) => (
                <tr
                  key={e.id}
                  className="hover:bg-brand-50/40 cursor-pointer transition-colors"
                  onClick={() => setSelectedEntry(e)}
                >
                  <td className="px-5 py-3 font-mono text-xs text-gray-500">{e.entryNumber}</td>
                  <td className="px-5 py-3 text-gray-600">{new Date(e.entryDate).toLocaleDateString('es-PE')}</td>
                  <td className="px-5 py-3 text-gray-800 max-w-xs truncate">{e.description}</td>
                  <td className="px-5 py-3">
                    <span className="badge bg-gray-100 text-gray-600 text-xs">{e.sourceModule}</span>
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-gray-600">{fmtAmt(Number(e.totalDebit))}</td>
                  <td className="px-5 py-3 text-right font-mono text-gray-600">{fmtAmt(Number(e.totalCredit))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Entry detail drawer */}
      {selectedEntry && (
        <>
          <div className="fixed inset-0 bg-black/20 z-30 backdrop-blur-[1px]" onClick={() => setSelectedEntry(null)} />
          <div className="fixed top-0 right-0 bottom-0 w-[600px] bg-white shadow-2xl z-40 flex flex-col">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200">
              <button onClick={() => setSelectedEntry(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
                <X size={18} />
              </button>
              <div>
                <h2 className="font-semibold">{selectedEntry.entryNumber}</h2>
                <p className="text-xs text-gray-400">{new Date(selectedEntry.entryDate).toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} · {selectedEntry.description}</p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <table className="w-full text-sm">
                <thead className="bg-brand-50 text-brand-700 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-2 text-left">Cuenta</th>
                    <th className="px-4 py-2 text-right">Débito</th>
                    <th className="px-4 py-2 text-right">Crédito</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(selectedEntry.lines ?? []).map((l: any, i: number) => (
                    <tr key={i} className={Number(l.debit) > 0 ? '' : 'text-gray-500'}>
                      <td className="px-4 py-2">
                        <span className="font-mono text-xs mr-2 text-brand-600">{l.account?.code}</span>
                        <span className={Number(l.credit) > 0 ? 'pl-4' : ''}>{l.account?.name}</span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono">{Number(l.debit) > 0 ? fmtAmt(Number(l.debit)) : '—'}</td>
                      <td className="px-4 py-2 text-right font-mono">{Number(l.credit) > 0 ? fmtAmt(Number(l.credit)) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 font-semibold text-sm">
                  <tr>
                    <td className="px-4 py-2">Total</td>
                    <td className="px-4 py-2 text-right font-mono">{fmtAmt(Number(selectedEntry.totalDebit))}</td>
                    <td className="px-4 py-2 text-right font-mono">{fmtAmt(Number(selectedEntry.totalCredit))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Accounting Component ────────────────────────────────────────────────
export default function Accounting() {
  const [activeTab, setActiveTab] = useState<TopTab>('financials');
  const [financialView, setFinancialView] = useState<FinancialView>('pl');
  const [periodMode, setPeriodMode] = useState<PeriodMode>('monthly');

  // Period navigation
  const now = new Date();
  const [selYear,  setSelYear]  = useState(now.getFullYear());
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1);

  const prevPeriod = () => {
    if (periodMode === 'annual') { setSelYear(y => y - 1); return; }
    if (selMonth === 1) { setSelMonth(12); setSelYear(y => y - 1); }
    else setSelMonth(m => m - 1);
  };
  const nextPeriod = () => {
    if (periodMode === 'annual') { setSelYear(y => y + 1); return; }
    if (selMonth === 12) { setSelMonth(1); setSelYear(y => y + 1); }
    else setSelMonth(m => m + 1);
  };

  // ── Bank accounts state ────────────────────────────────────────────────────
  const [accounts, setAccounts]               = useState<BankAccount[]>(() => loadJSON(ACCOUNTS_KEY, []));
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [accountForm, setAccountForm]         = useState(BLANK_ACCOUNT);

  // ── Consolidations state ──────────────────────────────────────────────────
  const [consolidations, setConsolidations]   = useState<Consolidation[]>(() => loadJSON(CONSOL_KEY, []));
  const [showConsolForm, setShowConsolForm]    = useState(false);
  const pdfFiles = useRef<Map<string, File>>(new Map());
  const [consolForm, setConsolForm] = useState({
    accountId: '', period: new Date().toISOString().slice(0, 7),
    openingBalance: '', closingBalance: '', notes: '',
  });
  const [selectedPdf, setSelectedPdf] = useState<File | null>(null);
  const [isParsing, setIsParsing]     = useState(false);
  const [parseResult, setParseResult] = useState<ParsedStatement | null>(null);
  const [showTxns, setShowTxns]       = useState(false);

  // ── PDF password ───────────────────────────────────────────────────────────
  const [pdfPasswords, setPdfPasswords] = useState<Record<string, string>>(() => loadJSON(PASSWORDS_KEY, {}));
  const [pwdModal, setPwdModal]         = useState(false);
  const [pwdInput, setPwdInput]         = useState('');
  const [pwdWrong, setPwdWrong]         = useState(false);
  const [pwdLoading, setPwdLoading]     = useState(false);
  const pendingPdfB64 = useRef<string>('');

  // ── Transaction drawer ─────────────────────────────────────────────────────
  const [bankTxns, setBankTxns]             = useState<Record<string, BankTransaction[]>>(() => loadJSON(TXNS_KEY, {}));
  const [drawerConsolId, setDrawerConsolId] = useState<string | null>(null);
  const [txnFilter, setTxnFilter]           = useState<'all' | 'pending' | 'linked'>('all');
  const [linkingTxnId, setLinkingTxnId]     = useState<string | null>(null);
  const [linkingMode, setLinkingMode]       = useState<'invoice' | 'purchase' | 'upload' | null>(null);

  // ── Linking queries ────────────────────────────────────────────────────────
  const { data: invoicesData, isLoading: loadInvoices } = useQuery({
    queryKey: ['invoices-for-link'],
    queryFn: () => api.get('/v1/invoices/').then(r => r.data),
    enabled: linkingMode === 'invoice',
    staleTime: 30_000,
  });
  const { data: posData, isLoading: loadPOs } = useQuery({
    queryKey: ['pos-for-link'],
    queryFn: () => api.get('/v1/procurement/purchase-orders').then(r => r.data),
    enabled: linkingMode === 'purchase',
    staleTime: 30_000,
  });

  // ── Persist helpers ────────────────────────────────────────────────────────
  const saveAccounts = useCallback((next: BankAccount[]) => {
    setAccounts(next); localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(next));
  }, []);
  const saveConsolidations = useCallback((next: Consolidation[]) => {
    setConsolidations(next); localStorage.setItem(CONSOL_KEY, JSON.stringify(next));
  }, []);
  const saveTxns = useCallback((next: Record<string, BankTransaction[]>) => {
    setBankTxns(next); localStorage.setItem(TXNS_KEY, JSON.stringify(next));
  }, []);
  const savePdfPassword = useCallback((accountId: string, pwd: string) => {
    const next = { ...pdfPasswords, [accountId]: pwd };
    setPdfPasswords(next); localStorage.setItem(PASSWORDS_KEY, JSON.stringify(next));
  }, [pdfPasswords]);

  // ── Bank account handlers ──────────────────────────────────────────────────
  const handleAddAccount = () => {
    if (!accountForm.alias || !accountForm.accountNumber) {
      toast.error('Alias y número de cuenta son requeridos'); return;
    }
    saveAccounts([...accounts, { id: crypto.randomUUID(), ...accountForm, createdAt: new Date().toISOString() }]);
    toast.success('Cuenta registrada');
    setShowAccountForm(false); setAccountForm(BLANK_ACCOUNT);
  };
  const handleDeleteAccount = (id: string) => { saveAccounts(accounts.filter(a => a.id !== id)); toast.success('Cuenta eliminada'); };

  // ── Consolidation handlers ─────────────────────────────────────────────────
  const handleAddConsolidation = () => {
    if (!consolForm.accountId || !consolForm.period) { toast.error('Selecciona cuenta y período'); return; }
    const id = crypto.randomUUID();
    const newConsol: Consolidation = {
      id, accountId: consolForm.accountId, period: consolForm.period,
      openingBalance: Number(consolForm.openingBalance) || 0,
      closingBalance: Number(consolForm.closingBalance) || 0,
      pdfName: selectedPdf?.name, notes: consolForm.notes || undefined,
      createdAt: new Date().toISOString(),
    };
    if (selectedPdf) pdfFiles.current.set(id, selectedPdf);
    if (parseResult && parseResult.transactions.length > 0) {
      saveTxns({ ...bankTxns, [id]: parseResult.transactions.map(t => ({ id: crypto.randomUUID(), date: t.date, description: t.description, debit: t.debit, credit: t.credit, balance: t.balance, linkedDoc: null })) });
    }
    saveConsolidations([...consolidations, newConsol]);
    toast.success('Consolidación registrada');
    setShowConsolForm(false); setSelectedPdf(null); setParseResult(null); setShowTxns(false);
    setConsolForm({ accountId: '', period: new Date().toISOString().slice(0, 7), openingBalance: '', closingBalance: '', notes: '' });
  };
  const handleDeleteConsolidation = (id: string) => {
    saveConsolidations(consolidations.filter(c => c.id !== id));
    pdfFiles.current.delete(id);
    const { [id]: _r, ...rest } = bankTxns; saveTxns(rest);
    toast.success('Registro eliminado');
  };
  const handleDownloadPdf = (id: string, name: string) => {
    const file = pdfFiles.current.get(id);
    if (!file) { toast.error('PDF no disponible en esta sesión'); return; }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  };

  // ── Linking handlers ───────────────────────────────────────────────────────
  const handleLinkDoc = (txnId: string, doc: LinkedDoc) => {
    if (!drawerConsolId) return;
    const current = bankTxns[drawerConsolId] ?? [];
    saveTxns({ ...bankTxns, [drawerConsolId]: current.map(t => t.id === txnId ? { ...t, linkedDoc: doc } : t) });
    setLinkingTxnId(null); setLinkingMode(null); toast.success('Comprobante vinculado');
  };
  const handleUnlink = (txnId: string) => {
    if (!drawerConsolId) return;
    const current = bankTxns[drawerConsolId] ?? [];
    saveTxns({ ...bankTxns, [drawerConsolId]: current.map(t => t.id === txnId ? { ...t, linkedDoc: null } : t) });
    toast('Vínculo eliminado');
  };
  const handleLinkUpload = (txnId: string, file: File) => handleLinkDoc(txnId, { type: 'upload', displayName: file.name, filename: file.name });
  const closeDrawer = () => { setDrawerConsolId(null); setLinkingTxnId(null); setLinkingMode(null); setTxnFilter('all'); };

  // ── PDF parse ──────────────────────────────────────────────────────────────
  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res((r.result as string).split(',')[1]);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  const applyParsed = (parsed: ParsedStatement) => {
    setParseResult(parsed);
    if (parsed.openingBalance !== null) setConsolForm(f => ({ ...f, openingBalance: String(parsed.openingBalance) }));
    if (parsed.closingBalance !== null) setConsolForm(f => ({ ...f, closingBalance: String(parsed.closingBalance) }));
    const found = parsed.openingBalance !== null || parsed.closingBalance !== null;
    if (found) toast.success(`Saldos extraídos · ${parsed.transactionCount} movimientos`);
    else toast('PDF procesado, saldos no detectados', { icon: '⚠️' });
  };
  const handlePdfChange = async (file: File | null) => {
    setSelectedPdf(file); setParseResult(null); setShowTxns(false);
    if (!file) return;
    setIsParsing(true);
    let pdfBase64 = '';
    try {
      pdfBase64 = await fileToBase64(file);
      const savedPwd = consolForm.accountId ? pdfPasswords[consolForm.accountId] : undefined;
      const res = await api.post('/v1/accounting/parse-statement', { pdfBase64, ...(savedPwd ? { password: savedPwd } : {}) });
      applyParsed(res.data.data);
    } catch (err: any) {
      if (err?.response?.status === 422 && err?.response?.data?.code === 'PDF_ENCRYPTED') {
        pendingPdfB64.current = pdfBase64; setPwdModal(true); setPwdInput(''); setPwdWrong(false); return;
      }
      toast.error('Error al procesar el PDF');
    } finally { setIsParsing(false); }
  };
  const handleUnlockPdf = async () => {
    if (!pwdInput.trim()) return;
    setPwdLoading(true); setPwdWrong(false);
    try {
      const res = await api.post('/v1/accounting/parse-statement', { pdfBase64: pendingPdfB64.current, password: pwdInput });
      if (consolForm.accountId) savePdfPassword(consolForm.accountId, pwdInput);
      setPwdModal(false); setPwdInput(''); setIsParsing(false); applyParsed(res.data.data);
    } catch (err: any) {
      if (err?.response?.status === 422 && err?.response?.data?.code === 'PDF_ENCRYPTED') setPwdWrong(true);
      else { toast.error('Error al procesar el PDF'); setPwdModal(false); setIsParsing(false); }
    } finally { setPwdLoading(false); }
  };

  // ── Drawer data ────────────────────────────────────────────────────────────
  const drawerConsol   = drawerConsolId ? consolidations.find(c => c.id === drawerConsolId) : null;
  const drawerAccount  = drawerConsol   ? accounts.find(a => a.id === drawerConsol.accountId) : null;
  const allDrawerTxns  = drawerConsolId ? (bankTxns[drawerConsolId] ?? []) : [];
  const pendingCount   = allDrawerTxns.filter(t => !t.linkedDoc).length;
  const linkedCount    = allDrawerTxns.filter(t => !!t.linkedDoc).length;
  const displayTxns    = allDrawerTxns.filter(t =>
    txnFilter === 'all' ? true : txnFilter === 'pending' ? !t.linkedDoc : !!t.linkedDoc
  );

  const fmtS = (v: any, currency = 'PEN') =>
    `${currency === 'USD' ? 'US$' : 'S/'} ${Number(v ?? 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;

  // ── Render ─────────────────────────────────────────────────────────────────
  const TOP_TABS = [
    { id: 'financials' as TopTab,     label: 'Estados Financieros', icon: BarChart3  },
    { id: 'entries' as TopTab,        label: 'Asientos',             icon: BookOpen   },
    { id: 'reconciliation' as TopTab, label: 'Conciliación',         icon: Building2  },
  ];

  const FIN_VIEWS = [
    { id: 'pl' as FinancialView,       label: 'P&L',                 icon: TrendingUp },
    { id: 'balance' as FinancialView,  label: 'Balance General',     icon: Scale      },
    { id: 'cashflow' as FinancialView, label: 'Flujo de Efectivo',   icon: Activity   },
  ];

  const MODES: { id: PeriodMode; label: string }[] = [
    { id: 'monthly', label: 'Mensual' },
    { id: 'ytd',     label: 'Acumulado' },
    { id: 'annual',  label: 'Anual' },
  ];

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contabilidad</h1>
          <p className="text-sm text-gray-500">Estados financieros PCGE · NIC/NIIF · Asientos y conciliación bancaria</p>
        </div>
        <a
          href="/plantilla_contable_historicos.xlsx"
          download="Plantilla_Contable_Historicos.xlsx"
          className="flex items-center gap-2 px-4 py-2 bg-white border border-brand-200 rounded-xl text-sm font-medium text-brand-700 hover:bg-brand-50 hover:border-brand-400 transition-all shadow-sm"
          title="Descarga la plantilla Excel para importar asientos históricos de años anteriores"
        >
          <Download size={15} />
          Descargar plantilla históricos
        </a>
      </div>

      {/* Top tab bar */}
      <div className="flex gap-1 p-1 bg-brand-50 rounded-xl border border-brand-200 w-fit">
        {TOP_TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150
              ${activeTab === id ? 'bg-white shadow-sm text-brand-700 border border-brand-200' : 'text-gray-500 hover:text-gray-700'}`}>
            <Icon size={15} />{label}
          </button>
        ))}
      </div>

      {/* ── FINANCIAL STATEMENTS TAB ─────────────────────────────────────────── */}
      {activeTab === 'financials' && (
        <div className="space-y-5">
          {/* Controls row */}
          <div className="flex items-center gap-4 flex-wrap">
            {/* Period navigator */}
            <div className="flex items-center bg-white border border-brand-200 rounded-xl overflow-hidden">
              <button onClick={prevPeriod} className="px-3 py-2 hover:bg-brand-50 text-brand-600 transition-colors border-r border-brand-200">
                <ChevronLeft size={16} />
              </button>
              <div className="px-4 py-2 font-medium text-gray-800 min-w-[140px] text-center text-sm">
                {periodMode === 'annual' ? `Año ${selYear}` : `${MONTHS_ES[selMonth-1]} ${selYear}`}
              </div>
              <button onClick={nextPeriod} className="px-3 py-2 hover:bg-brand-50 text-brand-600 transition-colors border-l border-brand-200">
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Period mode */}
            <div className="flex items-center bg-white border border-brand-200 rounded-xl p-1 gap-1">
              {MODES.map(({ id, label }) => (
                <button key={id} onClick={() => setPeriodMode(id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    periodMode === id ? 'bg-brand-600 text-white' : 'text-gray-500 hover:bg-brand-50'
                  }`}>
                  {label}
                </button>
              ))}
            </div>

            {/* Financial view sub-tabs */}
            <div className="ml-auto flex items-center bg-white border border-brand-200 rounded-xl p-1 gap-1">
              {FIN_VIEWS.map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setFinancialView(id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    financialView === id ? 'bg-brand-600 text-white' : 'text-gray-500 hover:bg-brand-50'
                  }`}>
                  <Icon size={13} />{label}
                </button>
              ))}
            </div>
          </div>

          {/* Statement */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              {financialView === 'pl' && <><TrendingUp size={16} className="text-brand-600" /><h2 className="font-semibold">Estado de Resultados — PCGE por Naturaleza</h2></>}
              {financialView === 'balance' && <><Scale size={16} className="text-brand-600" /><h2 className="font-semibold">Estado de Situación Financiera</h2></>}
              {financialView === 'cashflow' && <><Activity size={16} className="text-brand-600" /><h2 className="font-semibold">Estado de Flujos de Efectivo — Método Indirecto</h2></>}
              <span className="ml-auto text-xs text-gray-400 bg-brand-50 px-2 py-0.5 rounded-full">PCGE · NIC</span>
            </div>
            <div className="p-5">
              {financialView === 'pl'       && <PLStatement year={selYear} month={selMonth} mode={periodMode} />}
              {financialView === 'balance'  && <BalanceSheet year={selYear} month={selMonth} />}
              {financialView === 'cashflow' && <CashFlow year={selYear} month={selMonth} mode={periodMode} />}
            </div>
          </div>
        </div>
      )}

      {/* ── ASIENTOS TAB ─────────────────────────────────────────────────────── */}
      {activeTab === 'entries' && (
        <div className="space-y-5">
          {/* Period nav for entries */}
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-white border border-brand-200 rounded-xl overflow-hidden">
              <button onClick={prevPeriod} className="px-3 py-2 hover:bg-brand-50 text-brand-600 transition-colors border-r border-brand-200"><ChevronLeft size={16} /></button>
              <div className="px-4 py-2 font-medium text-gray-800 min-w-[130px] text-center text-sm">{MONTHS_ES[selMonth-1]} {selYear}</div>
              <button onClick={nextPeriod} className="px-3 py-2 hover:bg-brand-50 text-brand-600 transition-colors border-l border-brand-200"><ChevronRight size={16} /></button>
            </div>
          </div>
          <JournalEntriesTab year={selYear} month={selMonth} />
        </div>
      )}

      {/* ── RECONCILIATION TAB ───────────────────────────────────────────────── */}
      {activeTab === 'reconciliation' && (
        <div className="space-y-4">
          {/* Bank accounts section */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-800">Cuentas Bancarias</h2>
              <p className="text-xs text-gray-500 mt-0.5">Registra tus cuentas en S/ y US$ para conciliación</p>
            </div>
            <button className="btn-primary flex items-center gap-2 text-sm" onClick={() => setShowAccountForm(v => !v)}>
              <Plus size={14} /> Nueva cuenta
            </button>
          </div>

          {showAccountForm && (
            <div className="card p-5 space-y-4">
              <h3 className="font-semibold text-gray-800">Registrar cuenta bancaria</h3>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Banco</label>
                  <select className="input" value={accountForm.bank} onChange={e => setAccountForm(f => ({ ...f, bank: e.target.value as any }))}>
                    {['BCP', 'Interbank', 'ScotiaBank', 'BBVA', 'Otro'].map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                {accountForm.bank === 'Otro' && (
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">Nombre del banco</label>
                    <input className="input" placeholder="Nombre del banco" value={accountForm.bankCustom} onChange={e => setAccountForm(f => ({ ...f, bankCustom: e.target.value }))} />
                  </div>
                )}
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Alias</label>
                  <input className="input" placeholder="Ej: BCP Principal PEN" value={accountForm.alias} onChange={e => setAccountForm(f => ({ ...f, alias: e.target.value }))} />
                </div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Número de cuenta</label>
                  <input className="input font-mono" placeholder="Ej: 194-000000000-0-00" value={accountForm.accountNumber} onChange={e => setAccountForm(f => ({ ...f, accountNumber: e.target.value }))} />
                </div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Moneda</label>
                  <div className="flex gap-2">
                    {(['PEN', 'USD'] as const).map(c => (
                      <button key={c} type="button" onClick={() => setAccountForm(f => ({ ...f, currency: c }))}
                        className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${accountForm.currency === c ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-brand-200 hover:bg-brand-50'}`}>
                        {c === 'PEN' ? '🇵🇪 S/' : '🇺🇸 US$'}
                      </button>
                    ))}
                  </div>
                </div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
                  <div className="flex gap-2">
                    {(['Corriente', 'Ahorros'] as const).map(t => (
                      <button key={t} type="button" onClick={() => setAccountForm(f => ({ ...f, accountType: t }))}
                        className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${accountForm.accountType === t ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-brand-200 hover:bg-brand-50'}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="rounded accent-brand-600" checked={accountForm.isMain} onChange={e => setAccountForm(f => ({ ...f, isMain: e.target.checked }))} />
                    <span className="text-sm text-gray-600">Cuenta principal</span>
                  </label>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn-primary" onClick={handleAddAccount}>Registrar cuenta</button>
                <button className="btn-secondary" onClick={() => setShowAccountForm(false)}>Cancelar</button>
              </div>
            </div>
          )}

          {(['PEN', 'USD'] as const).map(currency => {
            const currAccounts = accounts.filter(a => a.currency === currency);
            if (!currAccounts.length) return null;
            return (
              <div key={currency} className="card overflow-hidden">
                <div className="px-5 py-3 border-b border-brand-200 bg-brand-50 flex items-center gap-2">
                  <span className="font-semibold text-brand-700">{currency === 'PEN' ? '🇵🇪 Cuentas en Soles (S/)' : '🇺🇸 Cuentas en Dólares (US$)'}</span>
                  <span className="ml-auto text-xs text-gray-400">{currAccounts.length} cuenta{currAccounts.length > 1 ? 's' : ''}</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {currAccounts.map(a => {
                    const bankLabel = a.bank === 'Otro' ? (a.bankCustom || 'Otro') : a.bank;
                    return (
                      <div key={a.id} className="px-5 py-4 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-xs flex-shrink-0">{bankLabel.slice(0, 3).toUpperCase()}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-gray-800">{a.alias}</p>
                            {a.isMain && <span className="badge bg-brand-100 text-brand-700">Principal</span>}
                            <span className="badge bg-gray-100 text-gray-600">{a.accountType}</span>
                          </div>
                          <p className="text-sm text-gray-500 font-mono">{bankLabel} · {a.accountNumber}</p>
                        </div>
                        <button className="text-gray-300 hover:text-red-500 transition-colors p-1" onClick={() => handleDeleteAccount(a.id)}><Trash2 size={15} /></button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {!accounts.length && (
            <div className="card p-10 text-center text-gray-400">
              <Building2 size={36} className="mx-auto mb-3 text-gray-300" />
              <p>No hay cuentas registradas.</p>
            </div>
          )}

          {/* Consolidations section */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-200">
            <div>
              <h2 className="font-semibold text-gray-800">Consolidaciones Mensuales</h2>
              <p className="text-xs text-gray-500 mt-0.5">Saldos de apertura y cierre con estado de cuenta bancario</p>
            </div>
            {accounts.length > 0 ? (
              <button className="btn-primary flex items-center gap-2 text-sm" onClick={() => setShowConsolForm(v => !v)}>
                <Plus size={14} /> Nueva consolidación
              </button>
            ) : (
              <button className="btn-secondary text-sm" onClick={() => {}}>Registra una cuenta primero →</button>
            )}
          </div>

          {showConsolForm && accounts.length > 0 && (
            <div className="card p-5 space-y-4">
              <h3 className="font-semibold text-gray-800">Registrar consolidación mensual</h3>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Cuenta bancaria</label>
                  <select className="input" value={consolForm.accountId} onChange={e => setConsolForm(f => ({ ...f, accountId: e.target.value }))}>
                    <option value="">Seleccionar cuenta...</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.alias} ({a.currency}) — {a.bank === 'Otro' ? a.bankCustom : a.bank}</option>)}
                  </select>
                </div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Período (mes)</label>
                  <input className="input" type="month" value={consolForm.period} onChange={e => setConsolForm(f => ({ ...f, period: e.target.value }))} />
                </div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Saldo inicial</label>
                  <input className="input" type="number" step="0.01" placeholder="0.00" value={consolForm.openingBalance} onChange={e => setConsolForm(f => ({ ...f, openingBalance: e.target.value }))} />
                </div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Saldo final</label>
                  <input className="input" type="number" step="0.01" placeholder="0.00" value={consolForm.closingBalance} onChange={e => setConsolForm(f => ({ ...f, closingBalance: e.target.value }))} />
                </div>
                <div className="col-span-2 lg:col-span-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
                    Estado de cuenta (PDF)
                    {parseResult && (parseResult.openingBalance !== null || parseResult.closingBalance !== null) && <span className="inline-flex items-center gap-0.5 text-green-600 font-normal"><Sparkles size={10} /> saldos extraídos</span>}
                    {parseResult && parseResult.openingBalance === null && parseResult.closingBalance === null && <span className="inline-flex items-center gap-0.5 text-amber-600 font-normal"><AlertTriangle size={10} /> no detectados</span>}
                  </label>
                  <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors text-sm ${isParsing ? 'border-blue-300 bg-blue-50 text-blue-600' : selectedPdf && parseResult?.openingBalance !== null ? 'border-green-400 bg-green-50 text-green-700' : selectedPdf ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-brand-300 bg-white text-gray-500 hover:bg-brand-50'}`}>
                    {isParsing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    <span className="truncate flex-1">{isParsing ? 'Analizando PDF...' : selectedPdf ? selectedPdf.name : 'Adjuntar PDF...'}</span>
                    {parseResult && parseResult.transactionCount > 0 && !isParsing && (
                      <button type="button" className="text-xs underline shrink-0" onClick={e => { e.preventDefault(); setShowTxns(v => !v); }}>{showTxns ? 'Ocultar' : `${parseResult.transactionCount} movs.`}</button>
                    )}
                    <input type="file" accept=".pdf" className="hidden" onChange={e => handlePdfChange(e.target.files?.[0] ?? null)} />
                  </label>
                </div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
                  <input className="input" placeholder="Notas opcionales..." value={consolForm.notes} onChange={e => setConsolForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn-primary" onClick={handleAddConsolidation}>Guardar consolidación</button>
                <button className="btn-secondary" onClick={() => { setShowConsolForm(false); setSelectedPdf(null); setParseResult(null); setShowTxns(false); }}>Cancelar</button>
              </div>
              {showTxns && parseResult && parseResult.transactions.length > 0 && (
                <div className="border border-brand-200 rounded-xl overflow-hidden mt-2">
                  <div className="px-4 py-2 bg-brand-50 border-b border-brand-200 flex items-center justify-between">
                    <span className="text-xs font-semibold text-brand-700">Movimientos extraídos ({parseResult.transactionCount})</span>
                  </div>
                  <div className="overflow-x-auto max-h-48 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0"><tr>
                        <th className="px-3 py-2 text-left text-gray-500">Fecha</th>
                        <th className="px-3 py-2 text-left text-gray-500">Descripción</th>
                        <th className="px-3 py-2 text-right text-red-500">Cargo</th>
                        <th className="px-3 py-2 text-right text-green-600">Abono</th>
                        <th className="px-3 py-2 text-right text-gray-500">Saldo</th>
                      </tr></thead>
                      <tbody className="divide-y divide-gray-50">
                        {parseResult.transactions.map((t, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-1.5 font-mono text-gray-500">{t.date}</td>
                            <td className="px-3 py-1.5 text-gray-700 max-w-[200px] truncate">{t.description}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-red-600">{t.debit != null ? t.debit.toLocaleString('es-PE', { minimumFractionDigits: 2 }) : '—'}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-green-600">{t.credit != null ? t.credit.toLocaleString('es-PE', { minimumFractionDigits: 2 }) : '—'}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-gray-700">{t.balance != null ? t.balance.toLocaleString('es-PE', { minimumFractionDigits: 2 }) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {accounts.filter(a => consolidations.some(c => c.accountId === a.id)).map(account => {
            const accountConsols = consolidations.filter(c => c.accountId === account.id).sort((a, b) => b.period.localeCompare(a.period));
            const bankLabel = account.bank === 'Otro' ? (account.bankCustom || 'Otro') : account.bank;
            return (
              <div key={account.id} className="card overflow-hidden">
                <div className="px-5 py-3 border-b border-brand-200 bg-brand-50 flex items-center gap-2">
                  <Building2 size={15} className="text-brand-600" />
                  <span className="font-semibold text-brand-700">{account.alias}</span>
                  <span className="badge bg-brand-100 text-brand-700">{account.currency}</span>
                  <span className="text-xs text-gray-400">{bankLabel} · {account.accountNumber}</span>
                </div>
                <div className="table-container">
                  <table className="w-full text-sm">
                    <thead className="bg-brand-50 text-brand-600 text-xs uppercase tracking-wide">
                      <tr>
                        <th className="px-5 py-3 text-left">Período</th>
                        <th className="px-5 py-3 text-right">Saldo inicial</th>
                        <th className="px-5 py-3 text-right">Saldo final</th>
                        <th className="px-5 py-3 text-right">Variación</th>
                        <th className="px-5 py-3 text-left">Movimientos</th>
                        <th className="px-5 py-3 text-left">PDF</th>
                        <th className="px-5 py-3 text-left">Notas</th>
                        <th className="px-5 py-3 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {accountConsols.map(c => {
                        const variation = c.closingBalance - c.openingBalance;
                        const cTxns     = bankTxns[c.id] ?? [];
                        const cLinked   = cTxns.filter(t => !!t.linkedDoc).length;
                        const cPending  = cTxns.length - cLinked;
                        return (
                          <tr key={c.id} className="table-row-hover cursor-pointer" onClick={() => { setDrawerConsolId(c.id); setTxnFilter('all'); }}>
                            <td className="px-5 py-3 font-medium"><div className="flex items-center gap-1.5">{c.period}<ChevronRight size={13} className="text-gray-300" /></div></td>
                            <td className="px-5 py-3 text-right font-mono">{fmtS(c.openingBalance, account.currency)}</td>
                            <td className="px-5 py-3 text-right font-mono">{fmtS(c.closingBalance, account.currency)}</td>
                            <td className={`px-5 py-3 text-right font-mono font-semibold ${variation >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {variation >= 0 ? '+' : ''}{fmtS(variation, account.currency)}
                            </td>
                            <td className="px-5 py-3" onClick={e => e.stopPropagation()}>
                              {cTxns.length > 0 ? (
                                <button className="flex items-center gap-1.5 text-xs hover:text-brand-700" onClick={() => { setDrawerConsolId(c.id); setTxnFilter('all'); }}>
                                  <span className="font-medium text-gray-700">{cTxns.length} movs.</span>
                                  {cPending > 0 ? <span className="badge bg-amber-100 text-amber-700 flex items-center gap-0.5"><Clock size={9} /> {cPending}</span>
                                    : <span className="badge bg-green-100 text-green-700 flex items-center gap-0.5"><CheckCircle2 size={9} /> OK</span>}
                                </button>
                              ) : <span className="text-gray-300 text-xs">—</span>}
                            </td>
                            <td className="px-5 py-3" onClick={e => e.stopPropagation()}>
                              {c.pdfName ? (
                                <button className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-800" onClick={() => handleDownloadPdf(c.id, c.pdfName!)}>
                                  <Download size={12} /><span className="truncate max-w-[110px]">{c.pdfName}</span>
                                </button>
                              ) : <span className="text-gray-300 text-xs">—</span>}
                            </td>
                            <td className="px-5 py-3 text-gray-500 text-xs max-w-[130px] truncate">{c.notes ?? '—'}</td>
                            <td className="px-5 py-3" onClick={e => e.stopPropagation()}>
                              <button className="text-gray-300 hover:text-red-500 transition-colors" onClick={() => handleDeleteConsolidation(c.id)}><Trash2 size={13} /></button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          {!consolidations.length && (
            <div className="card p-10 text-center text-gray-400">
              <FileText size={36} className="mx-auto mb-3 text-gray-300" />
              <p>No hay consolidaciones registradas.</p>
            </div>
          )}
        </div>
      )}

      {/* ── TRANSACTION DRAWER ───────────────────────────────────────────────── */}
      {drawerConsolId && (
        <>
          <div className="fixed inset-0 bg-black/20 z-30 backdrop-blur-[1px]" onClick={closeDrawer} />
          <div className="fixed top-0 right-0 bottom-0 w-[calc(100vw-240px)] bg-white shadow-2xl z-40 flex flex-col">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
              <button onClick={closeDrawer} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><X size={18} /></button>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                  Movimientos del estado de cuenta
                  <span className="badge bg-brand-100 text-brand-700 font-normal">{drawerAccount?.alias ?? '—'}</span>
                  <span className="badge bg-gray-100 text-gray-600 font-normal">{drawerConsol?.period}</span>
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {fmtS(drawerConsol?.openingBalance ?? 0, drawerAccount?.currency)} apertura → {fmtS(drawerConsol?.closingBalance ?? 0, drawerAccount?.currency)} cierre · {allDrawerTxns.length} transacciones
                </p>
              </div>
              {allDrawerTxns.length > 0 && (
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <div className="text-xs text-gray-500 mb-1">Conciliación</div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full transition-all duration-500" style={{ width: `${allDrawerTxns.length > 0 ? (linkedCount / allDrawerTxns.length) * 100 : 0}%` }} />
                      </div>
                      <span className="text-xs font-medium text-gray-600">{linkedCount}/{allDrawerTxns.length}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-100 bg-gray-50 flex-shrink-0">
              {[{ key: 'all', label: `Todos (${allDrawerTxns.length})` }, { key: 'pending', label: `Sin comprobante (${pendingCount})` }, { key: 'linked', label: `Vinculados (${linkedCount})` }].map(({ key, label }) => (
                <button key={key} onClick={() => { setTxnFilter(key as any); setLinkingTxnId(null); setLinkingMode(null); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${txnFilter === key ? 'bg-brand-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'}`}>
                  {label}
                </button>
              ))}
            </div>
            {!allDrawerTxns.length ? (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <div className="text-center"><FileText size={40} className="mx-auto mb-3 text-gray-300" /><p>No hay movimientos guardados</p></div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-brand-50 text-brand-600 text-xs uppercase tracking-wide sticky top-0 z-10">
                    <tr>
                      <th className="px-5 py-3 text-left w-16">Fecha</th>
                      <th className="px-5 py-3 text-left">Descripción</th>
                      <th className="px-5 py-3 text-right w-28">Cargo (S/)</th>
                      <th className="px-5 py-3 text-right w-28">Abono (S/)</th>
                      <th className="px-5 py-3 text-left w-64">Comprobante</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {displayTxns.map(txn => (
                      <Fragment key={txn.id}>
                        <tr className={`transition-colors ${linkingTxnId === txn.id ? 'bg-brand-50/60' : 'hover:bg-gray-50'}`}>
                          <td className="px-5 py-3 font-mono text-gray-500 text-xs align-top pt-3.5">{txn.date}</td>
                          <td className="px-5 py-3 text-gray-700 max-w-xs align-top pt-3.5"><span className="line-clamp-2">{txn.description}</span></td>
                          <td className="px-5 py-3 text-right font-mono text-red-600 align-top pt-3.5">{txn.debit != null ? txn.debit.toLocaleString('es-PE', { minimumFractionDigits: 2 }) : <span className="text-gray-300">—</span>}</td>
                          <td className="px-5 py-3 text-right font-mono text-green-600 align-top pt-3.5">{txn.credit != null ? txn.credit.toLocaleString('es-PE', { minimumFractionDigits: 2 }) : <span className="text-gray-300">—</span>}</td>
                          <td className="px-5 py-3 align-top pt-2.5">
                            {txn.linkedDoc ? (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`badge text-xs flex items-center gap-1 ${txn.linkedDoc.type === 'invoice' ? 'bg-blue-100 text-blue-700' : txn.linkedDoc.type === 'purchase_order' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                                  {txn.linkedDoc.type === 'invoice' && <Receipt size={9} />}
                                  {txn.linkedDoc.type === 'purchase_order' && <ShoppingCart size={9} />}
                                  {txn.linkedDoc.type === 'upload' && <Upload size={9} />}
                                  {txn.linkedDoc.displayName}
                                </span>
                                <button onClick={() => handleUnlink(txn.id)} className="text-gray-300 hover:text-red-400 transition-colors ml-0.5"><X size={11} /></button>
                              </div>
                            ) : (
                              <button onClick={() => { setLinkingTxnId(linkingTxnId === txn.id ? null : txn.id); setLinkingMode(null); }}
                                className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${linkingTxnId === txn.id ? 'border-brand-400 bg-brand-600 text-white' : 'border-dashed border-gray-300 text-gray-400 hover:border-brand-300 hover:text-brand-600 hover:bg-brand-50'}`}>
                                <Link2 size={10} /> Vincular
                              </button>
                            )}
                          </td>
                        </tr>
                        {linkingTxnId === txn.id && (
                          <tr>
                            <td colSpan={5} className="bg-brand-50 border-b border-brand-200 px-0 py-0">
                              <div className="px-5 py-4 space-y-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium text-gray-500 mr-1">Vincular a:</span>
                                  {[{ mode: 'invoice', label: 'Facturas/Boletas', icon: Receipt }, { mode: 'purchase', label: 'Órdenes de Compra', icon: ShoppingCart }, { mode: 'upload', label: 'Subir comprobante', icon: Upload }].map(({ mode, label, icon: Icon }) => (
                                    <button key={mode} onClick={() => setLinkingMode(prev => prev === mode ? null : mode as any)}
                                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${linkingMode === mode ? 'border-brand-500 bg-brand-600 text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-brand-300 hover:bg-brand-50'}`}>
                                      <Icon size={11} /> {label}
                                    </button>
                                  ))}
                                  <button onClick={() => { setLinkingTxnId(null); setLinkingMode(null); }} className="ml-auto text-gray-400 hover:text-gray-600 p-1"><X size={14} /></button>
                                </div>
                                {linkingMode === 'invoice' && (
                                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                    {loadInvoices ? <div className="p-4 text-xs text-gray-400 flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Cargando...</div>
                                    : (invoicesData?.data ?? []).length === 0 ? <div className="p-4 text-xs text-gray-400">No hay facturas disponibles.</div>
                                    : <div className="max-h-52 overflow-y-auto divide-y divide-gray-100">
                                        {invoicesData.data.map((inv: any) => (
                                          <button key={inv.id} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-brand-50 transition-colors text-left" onClick={() => handleLinkDoc(txn.id, { type: 'invoice', displayName: `${inv.serie}-${String(inv.correlativo).padStart(8,'0')}`, id: inv.id, amount: inv.totalAmountPen })}>
                                            <div><span className="font-mono font-medium text-gray-800 text-xs">{inv.serie}-{String(inv.correlativo).padStart(8,'0')}</span><p className="text-xs text-gray-400 mt-0.5">{inv.customer?.businessName ?? inv.customer?.fullName ?? '—'}</p></div>
                                            <span className="text-xs font-mono text-gray-600 ml-4">{fmtS(inv.totalAmountPen)}</span>
                                          </button>
                                        ))}
                                      </div>}
                                  </div>
                                )}
                                {linkingMode === 'purchase' && (
                                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                    {loadPOs ? <div className="p-4 text-xs text-gray-400 flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Cargando...</div>
                                    : (posData?.data ?? []).length === 0 ? <div className="p-4 text-xs text-gray-400">No hay órdenes disponibles.</div>
                                    : <div className="max-h-52 overflow-y-auto divide-y divide-gray-100">
                                        {posData.data.map((po: any) => (
                                          <button key={po.id} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-brand-50 transition-colors text-left" onClick={() => handleLinkDoc(txn.id, { type: 'purchase_order', displayName: po.poNumber, id: po.id, amount: po.totalAmountPen })}>
                                            <div><span className="font-mono font-medium text-gray-800 text-xs">{po.poNumber}</span><p className="text-xs text-gray-400 mt-0.5">{po.supplier?.name ?? '—'}</p></div>
                                            <span className="text-xs font-mono text-gray-600 ml-4">{fmtS(po.totalAmountPen)}</span>
                                          </button>
                                        ))}
                                      </div>}
                                  </div>
                                )}
                                {linkingMode === 'upload' && (
                                  <label className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-brand-300 bg-white cursor-pointer hover:bg-brand-50 text-sm text-brand-600 w-fit">
                                    <Upload size={14} /><span>Seleccionar comprobante</span>
                                    <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleLinkUpload(txn.id, f); }} />
                                  </label>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
                {displayTxns.length === 0 && <div className="py-12 text-center text-gray-400 text-sm">{txnFilter === 'pending' ? 'Todas vinculadas.' : 'No hay transacciones vinculadas.'}</div>}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── PDF password modal ──────────────────────────────────────────────── */}
      {pwdModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => { if (!pwdLoading) { setPwdModal(false); setPwdInput(''); setIsParsing(false); } }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0"><Lock size={18} className="text-amber-600" /></div>
              <div><h3 className="font-semibold text-gray-900">PDF protegido</h3><p className="text-xs text-gray-500">Ingresa la contraseña del estado de cuenta</p></div>
            </div>
            <div className="space-y-1.5">
              <input className={`input w-full ${pwdWrong ? 'border-red-400 focus:ring-red-300' : ''}`} type="password" placeholder="Contraseña del PDF..." value={pwdInput} autoFocus onChange={e => { setPwdInput(e.target.value); setPwdWrong(false); }} onKeyDown={e => e.key === 'Enter' && handleUnlockPdf()} />
              {pwdWrong ? <p className="text-xs text-red-500">Contraseña incorrecta.</p> : <p className="text-xs text-gray-400">Se guardará para futuros estados de esta cuenta.</p>}
            </div>
            <div className="flex gap-2">
              <button className="btn-primary flex-1 flex items-center justify-center gap-2" onClick={handleUnlockPdf} disabled={pwdLoading || !pwdInput.trim()}>
                {pwdLoading ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />} Desbloquear
              </button>
              <button className="btn-secondary" onClick={() => { setPwdModal(false); setPwdInput(''); setPwdWrong(false); setIsParsing(false); }} disabled={pwdLoading}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
