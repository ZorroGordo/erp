import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useState } from 'react';
import {
  Plus, UserCheck, Edit2, Clock, Calendar, ChevronDown, ChevronRight,
  CheckCircle, DollarSign, Mail, Trash2, X, AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';

// ── Constants ──────────────────────────────────────────────────────────────────
const AFP_OPTIONS   = ['AFP Integra', 'Prima AFP', 'Profuturo AFP', 'Habitat AFP'];
const CONTRACT_OPTS = [
  { value: 'INDEFINIDO',  label: 'Indefinido' },
  { value: 'PLAZO_FIJO',  label: 'Plazo Fijo' },
  { value: 'PART_TIME',   label: 'Part Time' },
];
const MONTH_NAMES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

const EMPTY_EMP_FORM = {
  fullName: '', dni: '', position: '', department: '',
  employmentType: 'PLANILLA', contractType: 'INDEFINIDO',
  hireDate: '', baseSalary: '', pensionSystem: 'AFP', afpName: '',
  cuspp: '', email: '', bankAccount: '', bankName: '',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtS(n: any) { return `S/ ${Number(n ?? 0).toFixed(2)}`; }
function badge(label: string, cls: string) {
  return <span className={`badge text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{label}</span>;
}

function statusBadge(s: string) {
  if (s === 'PAID')      return badge('Pagado',    'bg-green-100 text-green-700');
  if (s === 'CONFIRMED') return badge('Confirmado','bg-blue-100 text-blue-700');
  return                        badge('Borrador',  'bg-gray-100 text-gray-500');
}

// ── Employee Form Modal ───────────────────────────────────────────────────────
function EmployeeModal({
  initial, onSave, onClose,
}: { initial: any; onSave: (data: any) => void; onClose: () => void }) {
  const [form, setForm] = useState<any>(initial);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const isRxH = form.employmentType === 'RXH';

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
          <h3 className="font-semibold text-lg">{initial.id ? 'Editar empleado' : 'Nuevo empleado'}</h3>
          <button onClick={onClose}><X size={20} className="text-gray-400 hover:text-gray-600" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Nombre completo *</label>
              <input className="input" value={form.fullName} onChange={e => set('fullName', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">DNI *</label>
              <input className="input" value={form.dni} onChange={e => set('dni', e.target.value)} maxLength={8} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cargo</label>
              <input className="input" value={form.position} onChange={e => set('position', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Área</label>
              <input className="input" value={form.department} onChange={e => set('department', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de empleo *</label>
              <select className="input" value={form.employmentType} onChange={e => set('employmentType', e.target.value)}>
                <option value="PLANILLA">Planilla (dependiente)</option>
                <option value="RXH">RxH (recibo por honorarios)</option>
              </select>
            </div>
            {!isRxH && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de contrato</label>
                <select className="input" value={form.contractType} onChange={e => set('contractType', e.target.value)}>
                  {CONTRACT_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de ingreso</label>
              <input className="input" type="date" value={form.hireDate} onChange={e => set('hireDate', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {isRxH ? 'Honorarios brutos (S/)' : 'Sueldo bruto (S/)'} *
              </label>
              <input className="input" type="number" step="0.01" value={form.baseSalary} onChange={e => set('baseSalary', e.target.value)} />
            </div>

            {!isRxH && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Sistema pensionario</label>
                  <select className="input" value={form.pensionSystem} onChange={e => { set('pensionSystem', e.target.value); if (e.target.value === 'ONP') set('afpName', ''); }}>
                    <option value="AFP">AFP</option>
                    <option value="ONP">ONP (SNP 13%)</option>
                  </select>
                </div>
                {form.pensionSystem === 'AFP' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">AFP</label>
                    <select className="input" value={form.afpName} onChange={e => set('afpName', e.target.value)}>
                      <option value="">— Seleccionar AFP —</option>
                      {AFP_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">CUSPP (código AFP)</label>
                  <input className="input" value={form.cuspp} onChange={e => set('cuspp', e.target.value)} placeholder="Opcional" />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email (para boletas)</label>
              <input className="input" type="email" value={form.email} onChange={e => set('email', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cuenta bancaria</label>
              <input className="input" value={form.bankAccount} onChange={e => set('bankAccount', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Banco</label>
              <input className="input" value={form.bankName} onChange={e => set('bankName', e.target.value)} />
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t flex gap-2 justify-end bg-gray-50 sticky bottom-0">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={() => onSave({ ...form, baseSalary: parseFloat(form.baseSalary) || 0 })}>
            {initial.id ? 'Guardar cambios' : 'Registrar empleado'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Overtime Modal ────────────────────────────────────────────────────────────
function OvertimeModal({ employee, onSave, onClose }: { employee: any; onSave: (d: any) => void; onClose: () => void }) {
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    isHoliday: false,
    holidayHours: '0',
    overtime25: '0',
    overtime35: '0',
    hoursWorked: '0',
    regularHours: '8',
    notes: '',
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const hourlyRate = Number(employee.baseSalary) / 30 / 8;
  const preview = form.isHoliday
    ? hourlyRate * parseFloat(form.holidayHours || '0') * 2
    : hourlyRate * parseFloat(form.overtime25 || '0') * 1.25 + hourlyRate * parseFloat(form.overtime35 || '0') * 1.35;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h3 className="font-semibold">Registrar horas extras / feriado</h3>
            <p className="text-xs text-gray-500">{employee.fullName}</p>
          </div>
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fecha</label>
            <input className="input" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="isHol" checked={form.isHoliday} onChange={e => set('isHoliday', e.target.checked)} className="rounded" />
            <label htmlFor="isHol" className="text-sm font-medium text-gray-700">Es feriado (100% recargo = pago doble)</label>
          </div>

          {form.isHoliday ? (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Horas trabajadas en feriado</label>
              <input className="input" type="number" step="0.5" min="0" value={form.holidayHours} onChange={e => set('holidayHours', e.target.value)} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Horas extras (25% recargo)</label>
                <p className="text-xs text-gray-400 mb-1">Primeras 2 horas</p>
                <input className="input" type="number" step="0.5" min="0" value={form.overtime25} onChange={e => set('overtime25', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Horas extras (35% recargo)</label>
                <p className="text-xs text-gray-400 mb-1">A partir de la 3ra hora</p>
                <input className="input" type="number" step="0.5" min="0" value={form.overtime35} onChange={e => set('overtime35', e.target.value)} />
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notas (opcional)</label>
            <input className="input" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Ej: Turno nocturno feriado nacional" />
          </div>

          <div className="mt-3 p-3 bg-brand-50 rounded-lg">
            <p className="text-xs text-gray-500">Tarifa hora: {fmtS(hourlyRate.toFixed(2))}</p>
            <p className="text-sm font-semibold text-brand-700">Monto estimado a pagar: {fmtS(preview.toFixed(2))}</p>
          </div>
        </div>
        <div className="px-6 py-4 border-t flex gap-2 justify-end bg-gray-50">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={() => onSave({
            date: form.date,
            isHoliday: form.isHoliday,
            holidayHours: parseFloat(form.holidayHours) || 0,
            overtime25: parseFloat(form.overtime25) || 0,
            overtime35: parseFloat(form.overtime35) || 0,
            hoursWorked: parseFloat(form.hoursWorked) || 0,
            regularHours: parseFloat(form.regularHours) || 0,
            notes: form.notes,
          })}>
            Registrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Payslip Row ───────────────────────────────────────────────────────────────
function PayslipRow({ ps, onConfirm, onPay }: { ps: any; onConfirm: () => void; onPay: () => void }) {
  const ded = ps.deductions as any;
  const totalDed = (ded.afpOrOnp || 0) + (ded.igv5taCategoria || 0) + (ded.irRxH || 0);
  const isRxH = ps.employee?.employmentType === 'RXH';

  return (
    <tr className="table-row-hover text-sm">
      <td className="px-4 py-3 font-medium">
        {ps.employee?.fullName}
        {ps.notes && <p className="text-xs text-gray-400 mt-0.5">{ps.notes}</p>}
      </td>
      <td className="px-4 py-3 text-center">
        {isRxH
          ? <span className="badge bg-orange-100 text-orange-700 text-xs">RxH</span>
          : <span className="badge bg-blue-100 text-blue-700 text-xs">Planilla</span>}
      </td>
      <td className="px-4 py-3 text-right font-mono">{fmtS(ps.grossSalary)}</td>
      <td className="px-4 py-3 text-right font-mono text-red-600">{fmtS(totalDed)}</td>
      <td className="px-4 py-3 text-right font-mono font-semibold text-green-700">{fmtS(ps.netSalary)}</td>
      <td className="px-4 py-3 text-center">{statusBadge(ps.status)}</td>
      <td className="px-4 py-3">
        <div className="flex gap-1.5 justify-end">
          {ps.status === 'DRAFT' && (
            <button
              onClick={onConfirm}
              className="btn-secondary py-1 px-2 text-xs flex items-center gap-1"
              title="Confirmar boleta"
            >
              <CheckCircle size={12} /> Confirmar
            </button>
          )}
          {ps.status === 'CONFIRMED' && (
            <button
              onClick={onPay}
              className="btn-primary py-1 px-2 text-xs flex items-center gap-1"
              title="Marcar como pagado y enviar email"
            >
              <DollarSign size={12} /> Pagar {ps.employee?.email && <Mail size={11} />}
            </button>
          )}
          {ps.status === 'PAID' && ps.emailSentAt && (
            <span className="text-xs text-green-600 flex items-center gap-1"><Mail size={12} /> Enviado</span>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Period Card ───────────────────────────────────────────────────────────────
function PeriodCard({ period }: { period: any }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const { data: psData, isLoading: psLoading } = useQuery({
    queryKey: ['payslips', period.id],
    queryFn: () => api.get(`/v1/payroll/periods/${period.id}/payslips`).then(r => r.data),
    enabled: expanded,
  });

  const process = useMutation({
    mutationFn: () => api.post(`/v1/payroll/periods/${period.id}/process`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['periods'] });
      qc.invalidateQueries({ queryKey: ['payslips', period.id] });
      toast.success('Boletas generadas');
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Error'),
  });

  const confirm = useMutation({
    mutationFn: (psId: string) => api.post(`/v1/payroll/payslips/${psId}/confirm`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payslips', period.id] }); toast.success('Boleta confirmada'); },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Error'),
  });

  const pay = useMutation({
    mutationFn: (psId: string) => api.post(`/v1/payroll/payslips/${psId}/pay`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payslips', period.id] }); toast.success('Pagado y correo enviado'); },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Error al pagar'),
  });

  const payslips: any[] = psData?.data ?? [];
  const monthLabel = `${MONTH_NAMES[period.month - 1]} ${period.year}`;

  const totalNet = payslips.reduce((s: number, p: any) => s + Number(p.netSalary || 0), 0);
  const countPaid = payslips.filter((p: any) => p.status === 'PAID').length;
  const countConf = payslips.filter((p: any) => p.status === 'CONFIRMED').length;

  const periodStatusBadge = (s: string) => {
    if (s === 'PAID')      return badge('Pagado',    'bg-green-100 text-green-700');
    if (s === 'PROCESSED') return badge('Procesado', 'bg-blue-100 text-blue-700');
    return                        badge('Abierto',   'bg-yellow-100 text-yellow-700');
  };

  return (
    <div className="card overflow-hidden">
      <div
        className="px-5 py-4 flex items-center gap-3 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="text-gray-400">
          {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </div>
        <Calendar size={18} className="text-brand-500" />
        <div className="flex-1">
          <p className="font-semibold text-gray-900">{monthLabel}</p>
          <p className="text-xs text-gray-500">
            {period._count?.payslips ?? 0} empleados
            {countPaid > 0 && ` · ${countPaid} pagados`}
            {countConf > 0 && ` · ${countConf} confirmados`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {expanded && payslips.length > 0 && (
            <span className="text-sm font-semibold text-gray-700">{fmtS(totalNet)}</span>
          )}
          {periodStatusBadge(period.status)}
          {(period.status === 'OPEN' || period.status === 'PROCESSED') && (
            <button
              className="btn-secondary py-1 px-3 text-xs"
              onClick={e => { e.stopPropagation(); process.mutate(); }}
              disabled={process.isPending}
            >
              {process.isPending ? 'Generando...' : period.status === 'OPEN' ? 'Generar boletas' : 'Regenerar'}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100">
          {psLoading ? (
            <p className="text-center py-6 text-gray-400">Cargando boletas...</p>
          ) : payslips.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <AlertCircle size={24} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm">Sin boletas. Haz clic en "Generar boletas" para calcular.</p>
            </div>
          ) : (
            <div className="table-container">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-2 text-left">Empleado</th>
                    <th className="px-4 py-2 text-center">Tipo</th>
                    <th className="px-4 py-2 text-right">Bruto</th>
                    <th className="px-4 py-2 text-right">Descuentos</th>
                    <th className="px-4 py-2 text-right">Neto</th>
                    <th className="px-4 py-2 text-center">Estado</th>
                    <th className="px-4 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {payslips.map((ps: any) => (
                    <PayslipRow
                      key={ps.id}
                      ps={ps}
                      onConfirm={() => confirm.mutate(ps.id)}
                      onPay={() => pay.mutate(ps.id)}
                    />
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 text-sm font-semibold">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-right text-gray-600">Total neto a pagar:</td>
                    <td className="px-4 py-3 text-right text-green-700 font-mono">{fmtS(totalNet)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Payroll Page ─────────────────────────────────────────────────────────
export default function Payroll() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'employees' | 'pagos'>('employees');

  // Employee state
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [editingEmp, setEditingEmp] = useState<any>(null);
  const [overtimeEmp, setOvertimeEmp] = useState<any>(null);

  // Period creation
  const [showPeriodForm, setShowPeriodForm] = useState(false);
  const [periodForm, setPeriodForm] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 });

  // ── Queries ──
  const { data: empData, isLoading: empLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.get('/v1/payroll/employees').then(r => r.data),
  });
  const employees: any[] = empData?.data ?? [];

  const { data: periodsData, isLoading: periodsLoading } = useQuery({
    queryKey: ['periods'],
    queryFn: () => api.get('/v1/payroll/periods').then(r => r.data),
  });
  const periods: any[] = periodsData?.data ?? [];

  // ── Mutations ──
  const createEmp = useMutation({
    mutationFn: (b: any) => api.post('/v1/payroll/employees', b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Empleado registrado');
      setShowEmpModal(false);
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Error al registrar'),
  });

  const updateEmp = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.patch(`/v1/payroll/employees/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Empleado actualizado');
      setEditingEmp(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Error'),
  });

  const addOvertime = useMutation({
    mutationFn: ({ empId, data }: { empId: string; data: any }) =>
      api.post(`/v1/payroll/employees/${empId}/overtime`, data),
    onSuccess: () => {
      toast.success('Horas registradas');
      setOvertimeEmp(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Error'),
  });

  const createPeriod = useMutation({
    mutationFn: (b: any) => api.post('/v1/payroll/periods', b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['periods'] });
      toast.success('Periodo creado');
      setShowPeriodForm(false);
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Error'),
  });

  const handleEmpSave = (data: any) => {
    if (editingEmp?.id) {
      updateEmp.mutate({ id: editingEmp.id, data });
    } else {
      createEmp.mutate(data);
    }
  };

  const openEdit = (emp: any) => {
    setEditingEmp(emp);
    setShowEmpModal(true);
  };

  const openNew = () => {
    setEditingEmp(null);
    setShowEmpModal(true);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Planilla</h1>
          <p className="text-gray-500 text-sm">Empleados, AFP/ONP · Pagos mensuales</p>
        </div>
        <div className="flex gap-2">
          {tab === 'employees' && (
            <button className="btn-primary flex items-center gap-2" onClick={openNew}>
              <Plus size={16} /> Nuevo empleado
            </button>
          )}
          {tab === 'pagos' && (
            <button className="btn-primary flex items-center gap-2" onClick={() => setShowPeriodForm(v => !v)}>
              <Plus size={16} /> Nuevo periodo
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${tab === 'employees' ? 'bg-white shadow text-brand-700' : 'text-gray-500 hover:text-gray-700'}`}
          onClick={() => setTab('employees')}
        >
          <UserCheck size={14} className="inline mr-1.5" />Empleados
        </button>
        <button
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${tab === 'pagos' ? 'bg-white shadow text-brand-700' : 'text-gray-500 hover:text-gray-700'}`}
          onClick={() => setTab('pagos')}
        >
          <DollarSign size={14} className="inline mr-1.5" />Pagos de Planilla
        </button>
      </div>

      {/* ── EMPLOYEES TAB ─────────────────────────────────────────────────────── */}
      {tab === 'employees' && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <UserCheck size={18} className="text-gray-400" />
            <h2 className="font-semibold">Empleados</h2>
            <span className="ml-auto text-sm text-gray-400">{employees.length}</span>
          </div>

          {empLoading ? (
            <div className="p-8 text-center text-gray-400">Cargando...</div>
          ) : employees.length === 0 ? (
            <p className="text-center text-gray-400 py-8">Sin empleados registrados</p>
          ) : (
            <div className="table-container">
              <table className="w-full text-sm">
                <thead className="bg-brand-50 text-brand-600 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-5 py-3 text-left">Nombre</th>
                    <th className="px-5 py-3 text-left">Tipo</th>
                    <th className="px-5 py-3 text-left">Cargo / Área</th>
                    <th className="px-5 py-3 text-right">★ Sueldo bruto (S/)</th>
                    <th className="px-5 py-3 text-left">Pensión</th>
                    <th className="px-5 py-3 text-left">Estado</th>
                    <th className="px-5 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {employees.map((e: any) => (
                    <tr key={e.id} className="table-row-hover">
                      <td className="px-5 py-3 font-medium">
                        {e.fullName}
                        {e.email && <p className="text-xs text-gray-400">{e.email}</p>}
                      </td>
                      <td className="px-5 py-3">
                        {e.employmentType === 'RXH'
                          ? <span className="badge bg-orange-100 text-orange-700 text-xs">RxH</span>
                          : <span className="badge bg-blue-100 text-blue-700 text-xs">Planilla</span>}
                      </td>
                      <td className="px-5 py-3 text-gray-600">
                        {e.position}
                        {e.department && <span className="text-gray-400"> · {e.department}</span>}
                      </td>
                      <td className="px-5 py-3 text-right font-mono font-semibold">
                        {fmtS(e.baseSalary)}
                      </td>
                      <td className="px-5 py-3">
                        {e.employmentType === 'RXH'
                          ? <span className="text-gray-400 text-xs">N/A</span>
                          : (
                            <div>
                              <span className="badge bg-indigo-100 text-indigo-700 text-xs">
                                {e.pensionSystem}
                              </span>
                              {e.afpName && <p className="text-xs text-gray-400 mt-0.5">{e.afpName}</p>}
                            </div>
                          )}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`badge text-xs ${e.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {e.isActive ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex gap-1.5 justify-end">
                          <button
                            onClick={() => openEdit(e)}
                            className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-brand-600 transition-colors"
                            title="Editar empleado"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => setOvertimeEmp(e)}
                            className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-yellow-600 transition-colors"
                            title="Registrar horas extras / feriado"
                          >
                            <Clock size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── PAGOS DE PLANILLA TAB ─────────────────────────────────────────────── */}
      {tab === 'pagos' && (
        <div className="space-y-4">
          {/* New period form */}
          {showPeriodForm && (
            <div className="card p-5">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Calendar size={16} className="text-brand-500" /> Crear nuevo periodo de pago
              </h3>
              <div className="flex gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Año</label>
                  <input
                    className="input w-28"
                    type="number"
                    value={periodForm.year}
                    onChange={e => setPeriodForm(f => ({ ...f, year: parseInt(e.target.value) }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Mes</label>
                  <select
                    className="input w-40"
                    value={periodForm.month}
                    onChange={e => setPeriodForm(f => ({ ...f, month: parseInt(e.target.value) }))}
                  >
                    {MONTH_NAMES.map((m, i) => (
                      <option key={i} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </div>
                <button
                  className="btn-primary"
                  onClick={() => createPeriod.mutate(periodForm)}
                  disabled={createPeriod.isPending}
                >
                  Crear periodo
                </button>
                <button className="btn-secondary" onClick={() => setShowPeriodForm(false)}>Cancelar</button>
              </div>
            </div>
          )}

          {/* Periods list */}
          {periodsLoading ? (
            <div className="card p-8 text-center text-gray-400">Cargando periodos...</div>
          ) : periods.length === 0 ? (
            <div className="card p-10 text-center text-gray-400">
              <Calendar size={32} className="mx-auto mb-3 text-gray-300" />
              <p className="font-medium text-gray-600">Sin periodos de pago</p>
              <p className="text-sm mt-1">Crea el primer periodo para comenzar a generar boletas.</p>
            </div>
          ) : (
            periods.map((p: any) => <PeriodCard key={p.id} period={p} />)
          )}
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────────── */}
      {showEmpModal && (
        <EmployeeModal
          initial={editingEmp
            ? {
                ...editingEmp,
                baseSalary: Number(editingEmp.baseSalary).toFixed(2),
                hireDate: editingEmp.hireDate ? editingEmp.hireDate.split('T')[0] : '',
                afpName: editingEmp.afpName ?? '',
                cuspp: editingEmp.cuspp ?? '',
                email: editingEmp.email ?? '',
                bankAccount: editingEmp.bankAccount ?? '',
                bankName: editingEmp.bankName ?? '',
                department: editingEmp.department ?? '',
              }
            : { ...EMPTY_EMP_FORM }}
          onSave={handleEmpSave}
          onClose={() => { setShowEmpModal(false); setEditingEmp(null); }}
        />
      )}

      {overtimeEmp && (
        <OvertimeModal
          employee={overtimeEmp}
          onSave={data => addOvertime.mutate({ empId: overtimeEmp.id, data })}
          onClose={() => setOvertimeEmp(null)}
        />
      )}
    </div>
  );
}
