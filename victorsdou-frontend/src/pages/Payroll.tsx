import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useState } from "react";
import {
  Plus, UserCheck, Edit2, Clock, Calendar, ChevronLeft, ChevronRight,
  CheckCircle, DollarSign, Mail, X, AlertCircle, RefreshCw, Star
} from "lucide-react";
import toast from "react-hot-toast";
import { fmtMoney } from '../lib/fmt';

const AFP_OPTIONS   = ["AFP Integra", "Prima AFP", "Profuturo AFP", "Habitat AFP"];
const CONTRACT_OPTS = [
  { value: "INDEFINIDO", label: "Indefinido" },
  { value: "PLAZO_FIJO",  label: "Plazo Fijo" },
  { value: "PART_TIME",   label: "Part Time" },
];
const MONTH_NAMES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const MONTH_SHORT = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
const GRATIF_MONTHS = [7, 12];
const EMPTY_EMP_FORM = {
  fullName: "", dni: "", position: "", department: "",
  employmentType: "PLANILLA", contractType: "INDEFINIDO",
  hireDate: "", baseSalary: "", pensionSystem: "AFP", afpName: "",
  cuspp: "", email: "", bankAccount: "", bankName: "",
};

const fmtS = fmtMoney;

function statusBadge(s: string) {
  if (s === "PAID")      return <span className="badge bg-green-100 text-green-700 text-xs">Pagado</span>;
  if (s === "CONFIRMED") return <span className="badge bg-blue-100 text-blue-700 text-xs">Confirmado</span>;
  return                        <span className="badge bg-gray-100 text-gray-500 text-xs">Borrador</span>;
}

function EmployeeModal({ initial, onSave, onClose }: { initial: any; onSave: (data: any) => void; onClose: () => void }) {
  const [form, setForm] = useState<any>(initial);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const isRxH = form.employmentType === "RXH";
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
          <h3 className="font-semibold text-lg">{initial.id ? "Editar empleado" : "Nuevo empleado"}</h3>
          <button onClick={onClose}><X size={20} className="text-gray-400 hover:text-gray-600" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Nombre completo *</label>
              <input className="input" value={form.fullName} onChange={e => set("fullName", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">DNI *</label>
              <input className="input" value={form.dni} onChange={e => set("dni", e.target.value)} maxLength={8} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cargo</label>
              <input className="input" value={form.position} onChange={e => set("position", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Area</label>
              <input className="input" value={form.department} onChange={e => set("department", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de empleo *</label>
              <select className="input" value={form.employmentType} onChange={e => set("employmentType", e.target.value)}>
                <option value="PLANILLA">Planilla (dependiente)</option>
                <option value="RXH">RxH (recibo por honorarios)</option>
              </select>
            </div>
            {!isRxH && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de contrato</label>
                <select className="input" value={form.contractType} onChange={e => set("contractType", e.target.value)}>
                  {CONTRACT_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de ingreso</label>
              <input className="input" type="date" value={form.hireDate} onChange={e => set("hireDate", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isRxH ? "Honorarios brutos (S/)" : "Sueldo bruto (S/)"} *</label>
              <input className="input" type="number" step="0.01" value={form.baseSalary} onChange={e => set("baseSalary", e.target.value)} />
            </div>
            {!isRxH && (<>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Sistema pensionario</label>
                <select className="input" value={form.pensionSystem} onChange={e => { set("pensionSystem", e.target.value); if (e.target.value === "ONP") set("afpName", ""); }}>
                  <option value="AFP">AFP</option>
                  <option value="ONP">ONP (SNP 13%)</option>
                </select>
              </div>
              {form.pensionSystem === "AFP" && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">AFP</label>
                  <select className="input" value={form.afpName} onChange={e => set("afpName", e.target.value)}>
                    <option value="">-- Seleccionar AFP --</option>
                    {AFP_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">CUSPP (codigo AFP)</label>
                <input className="input" value={form.cuspp} onChange={e => set("cuspp", e.target.value)} placeholder="Opcional" />
              </div>
            </>)}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email (para boletas)</label>
              <input className="input" type="email" value={form.email} onChange={e => set("email", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cuenta bancaria</label>
              <input className="input" value={form.bankAccount} onChange={e => set("bankAccount", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Banco</label>
              <input className="input" value={form.bankName} onChange={e => set("bankName", e.target.value)} />
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t flex gap-2 justify-end bg-gray-50 sticky bottom-0">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={() => onSave({ ...form, baseSalary: parseFloat(form.baseSalary) || 0 })}>
            {initial.id ? "Guardar cambios" : "Registrar empleado"}
          </button>
        </div>
      </div>
    </div>
  );
}

function OvertimeModal({ employee, onSave, onClose }: { employee: any; onSave: (d: any) => void; onClose: () => void }) {
  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    isHoliday: false, holidayHours: "0",
    overtime25: "0", overtime35: "0",
    hoursWorked: "0", regularHours: "8", notes: "",
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const hourlyRate = Number(employee.baseSalary) / 30 / 8;
  const preview = form.isHoliday
    ? hourlyRate * parseFloat(form.holidayHours || "0") * 2
    : hourlyRate * parseFloat(form.overtime25 || "0") * 1.25 + hourlyRate * parseFloat(form.overtime35 || "0") * 1.35;
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div><h3 className="font-semibold">Horas extras / feriado</h3><p className="text-xs text-gray-500">{employee.fullName}</p></div>
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Fecha</label>
            <input className="input" type="date" value={form.date} onChange={e => set("date", e.target.value)} /></div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="isHol" checked={form.isHoliday} onChange={e => set("isHoliday", e.target.checked)} className="rounded" />
            <label htmlFor="isHol" className="text-sm font-medium text-gray-700">Feriado (100% recargo = pago doble)</label>
          </div>
          {form.isHoliday ? (
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Horas en feriado</label>
              <input className="input" type="number" step="0.5" min="0" value={form.holidayHours} onChange={e => set("holidayHours", e.target.value)} /></div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium text-gray-600 mb-1">HE 25% (primeras 2h)</label>
                <input className="input" type="number" step="0.5" min="0" value={form.overtime25} onChange={e => set("overtime25", e.target.value)} /></div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">HE 35% (desde 3ra hora)</label>
                <input className="input" type="number" step="0.5" min="0" value={form.overtime35} onChange={e => set("overtime35", e.target.value)} /></div>
            </div>
          )}
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
            <input className="input" value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Ej: feriado nacional" /></div>
          <div className="p-3 bg-brand-50 rounded-lg">
            <p className="text-xs text-gray-500">Tarifa hora: {fmtS(hourlyRate.toFixed(2))}</p>
            <p className="text-sm font-semibold text-brand-700">Estimado: {fmtS(preview.toFixed(2))}</p>
          </div>
        </div>
        <div className="px-6 py-4 border-t flex gap-2 justify-end bg-gray-50">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={() => onSave({
            date: form.date, isHoliday: form.isHoliday,
            holidayHours: parseFloat(form.holidayHours) || 0,
            overtime25: parseFloat(form.overtime25) || 0,
            overtime35: parseFloat(form.overtime35) || 0,
            hoursWorked: parseFloat(form.hoursWorked) || 0,
            regularHours: parseFloat(form.regularHours) || 0,
            notes: form.notes,
          })}>Registrar</button>
        </div>
      </div>
    </div>
  );
}

function PayslipRow({ ps, onConfirm, onPay }: { ps: any; onConfirm: () => void; onPay: () => void }) {
  const ded  = ps.deductions as any;
  const adds = ps.additions as any;
  const totalDed = (ded.afpOrOnp || 0) + (ded.igv5taCategoria || 0) + (ded.irRxH || 0);
  const hasOT    = (adds.overtime25 || 0) + (adds.overtime35 || 0) + (adds.holidayPay || 0) > 0;
  const isRxH    = ps.employee?.employmentType === "RXH";
  return (
    <tr className="table-row-hover text-sm">
      <td className="px-4 py-3">
        <p className="font-medium">{ps.employee?.fullName}</p>
        {hasOT && <p className="text-xs text-amber-600 mt-0.5">
          {adds.holidayPay > 0 && "+ Feriado " + fmtS(Number(adds.holidayPay).toFixed(0)) + " "}
          {(adds.overtime25 + adds.overtime35) > 0 && "+ HE " + fmtS((adds.overtime25 + adds.overtime35).toFixed(0))}
        </p>}
        {ps.notes && <p className="text-xs text-gray-400 italic">{ps.notes}</p>}
      </td>
      <td className="px-4 py-3 text-center">
        {isRxH ? <span className="badge bg-orange-100 text-orange-700 text-xs">RxH</span>
               : <span className="badge bg-blue-100 text-blue-700 text-xs">Planilla</span>}
      </td>
      <td className="px-4 py-3 text-right font-mono">{fmtS(ps.grossSalary)}</td>
      <td className="px-4 py-3 text-right font-mono text-red-600">({fmtS(totalDed)})</td>
      <td className="px-4 py-3 text-right font-mono font-semibold text-green-700">{fmtS(ps.netSalary)}</td>
      <td className="px-4 py-3 text-center">{statusBadge(ps.status)}</td>
      <td className="px-4 py-3">
        <div className="flex gap-1.5 justify-end">
          {ps.status === "DRAFT" && (
            <button onClick={onConfirm} className="btn-secondary py-1 px-2 text-xs flex items-center gap-1">
              <CheckCircle size={12} /> Confirmar
            </button>
          )}
          {ps.status === "CONFIRMED" && (
            <button onClick={onPay} className="btn-primary py-1 px-2 text-xs flex items-center gap-1">
              <DollarSign size={12} /> Pagar{ps.employee?.email && <Mail size={11} className="ml-0.5" />}
            </button>
          )}
          {ps.status === "PAID" && (
            <span className="text-xs text-green-600 flex items-center gap-1">
              <CheckCircle size={12} />{ps.emailSentAt ? "Pagado · Email ok" : "Pagado"}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

function MonthView({ year, month, periods }: { year: number; month: number; periods: any[] }) {
  const qc = useQueryClient();
  const period  = periods.find((p: any) => p.year === year && p.month === month) ?? null;
  const isGratif = GRATIF_MONTHS.includes(month);

  const { data: psData, isLoading: psLoading } = useQuery({
    queryKey: ["payslips", period?.id],
    queryFn: () => api.get("/v1/payroll/periods/" + period!.id + "/payslips").then(r => r.data),
    enabled: !!period?.id,
  });
  const payslips: any[] = psData?.data ?? [];

  const generate = useMutation({
    mutationFn: async () => {
      let pid = period?.id;
      if (!pid) {
        const res = await api.post("/v1/payroll/periods", { year, month });
        pid = res.data.data.id;
        qc.invalidateQueries({ queryKey: ["periods"] });
      }
      await api.post("/v1/payroll/periods/" + pid + "/process", {});
      qc.invalidateQueries({ queryKey: ["periods"] });
      qc.invalidateQueries({ queryKey: ["payslips", pid] });
    },
    onSuccess: () => toast.success("Boletas generadas"),
    onError:   (e: any) => toast.error(e.response?.data?.message ?? "Error"),
  });

  const confirm = useMutation({
    mutationFn: (id: string) => api.post("/v1/payroll/payslips/" + id + "/confirm", {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payslips", period?.id] }); toast.success("Boleta confirmada"); },
    onError:   (e: any) => toast.error(e.response?.data?.message ?? "Error"),
  });

  const pay = useMutation({
    mutationFn: (id: string) => api.post("/v1/payroll/payslips/" + id + "/pay", {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payslips", period?.id] }); toast.success("Pagado y correo enviado"); },
    onError:   (e: any) => toast.error(e.response?.data?.message ?? "Error al pagar"),
  });

  const totalNet   = payslips.reduce((s: number, p: any) => s + Number(p.netSalary || 0), 0);
  const totalCost  = payslips.reduce((s: number, p: any) => s + Number(p.employerTotalCost || 0), 0);
  const countPaid  = payslips.filter((p: any) => p.status === "PAID").length;
  const countConf  = payslips.filter((p: any) => p.status === "CONFIRMED").length;
  const countDraft = payslips.filter((p: any) => p.status === "DRAFT").length;
  const allPaid    = payslips.length > 0 && countPaid === payslips.length;

  return (
    <div className="space-y-4">
      {isGratif && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 flex gap-3 items-start">
          <Star size={20} className="text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-amber-800">Mes de Gratificacion -- {MONTH_NAMES[month - 1]}</p>
            <p className="text-sm text-amber-700 mt-0.5">
              {month === 7
                ? "Gratificacion de Julio (Fiestas Patrias): 1 sueldo mensual por empleado en planilla. Emite la boleta de gratificacion adicional."
                : "Gratificacion de Diciembre (Navidad): 1 sueldo mensual por empleado en planilla. Emite la boleta de gratificacion adicional."}
            </p>
          </div>
        </div>
      )}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar size={18} className="text-brand-500" />
            <div>
              <p className="font-semibold">{MONTH_NAMES[month - 1]} {year}</p>
              {payslips.length > 0 && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {countPaid > 0 && <span className="text-green-600">{countPaid} pagados </span>}
                  {countConf > 0 && <span className="text-blue-600">{countConf} confirmados </span>}
                  {countDraft > 0 && <span className="text-gray-400">{countDraft} borradores</span>}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {payslips.length > 0 && (
              <div className="text-right mr-2">
                <p className="text-xs text-gray-400">Neto a pagar</p>
                <p className="font-semibold text-gray-900">{fmtS(totalNet)}</p>
              </div>
            )}
            {allPaid ? (
              <span className="badge bg-green-100 text-green-700 text-xs">Todo pagado</span>
            ) : (
              <button
                className="btn-primary flex items-center gap-2 text-sm py-1.5 px-3"
                onClick={() => generate.mutate()}
                disabled={generate.isPending}
              >
                {generate.isPending
                  ? <><RefreshCw size={14} className="animate-spin" /> Generando...</>
                  : period
                    ? <><RefreshCw size={14} /> Regenerar boletas</>
                    : <><Plus size={14} /> Generar boletas</>}
              </button>
            )}
          </div>
        </div>
        {!period ? (
          <div className="py-12 text-center text-gray-400">
            <AlertCircle size={28} className="mx-auto mb-3 text-gray-300" />
            <p className="font-medium text-gray-500">Sin boletas para {MONTH_NAMES[month - 1]} {year}</p>
            <p className="text-sm mt-1">Haz clic en &ldquo;Generar boletas&rdquo; para calcular los pagos de este mes.</p>
          </div>
        ) : psLoading ? (
          <div className="py-10 text-center text-gray-400">Cargando boletas...</div>
        ) : payslips.length === 0 ? (
          <div className="py-10 text-center text-gray-400">Periodo creado. Haz clic en Regenerar para calcular.</div>
        ) : (
          <div className="table-container">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2.5 text-left">Empleado</th>
                  <th className="px-4 py-2.5 text-center">Tipo</th>
                  <th className="px-4 py-2.5 text-right">Bruto</th>
                  <th className="px-4 py-2.5 text-right">Descuentos</th>
                  <th className="px-4 py-2.5 text-right">Neto</th>
                  <th className="px-4 py-2.5 text-center">Estado</th>
                  <th className="px-4 py-2.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payslips.map((ps: any) => (
                  <PayslipRow key={ps.id} ps={ps}
                    onConfirm={() => confirm.mutate(ps.id)}
                    onPay={() => pay.mutate(ps.id)} />
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-200 text-sm">
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-right text-gray-500 font-medium">Total neto empleados:</td>
                  <td className="px-4 py-3 text-right font-semibold text-green-700 font-mono">{fmtS(totalNet)}</td>
                  <td colSpan={2}></td>
                </tr>
                <tr>
                  <td colSpan={4} className="px-4 py-2 text-right text-gray-400 text-xs">Costo total empleador (EsSalud + provisiones):</td>
                  <td className="px-4 py-2 text-right text-gray-400 text-xs font-mono">{fmtS(totalCost)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Payroll() {
  const qc  = useQueryClient();
  const now = new Date();
  const [tab,       setTab]      = useState<"employees" | "pagos">("employees");
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [editingEmp,   setEditingEmp]   = useState<any>(null);
  const [overtimeEmp,  setOvertimeEmp]  = useState<any>(null);
  const [selYear,  setSelYear]  = useState(now.getFullYear());
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1);

  const { data: empData, isLoading: empLoading } = useQuery({
    queryKey: ["employees"],
    queryFn: () => api.get("/v1/payroll/employees").then(r => r.data),
  });
  const employees: any[] = empData?.data ?? [];

  const { data: periodsData } = useQuery({
    queryKey: ["periods"],
    queryFn: () => api.get("/v1/payroll/periods").then(r => r.data),
  });
  const periods: any[] = periodsData?.data ?? [];

  const createEmp = useMutation({
    mutationFn: (b: any) => api.post("/v1/payroll/employees", b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employees"] }); toast.success("Empleado registrado"); setShowEmpModal(false); },
    onError: (e: any) => toast.error(e.response?.data?.message ?? "Error"),
  });
  const updateEmp = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.patch("/v1/payroll/employees/" + id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employees"] }); toast.success("Empleado actualizado"); setEditingEmp(null); setShowEmpModal(false); },
    onError: (e: any) => toast.error(e.response?.data?.message ?? "Error"),
  });
  const addOvertime = useMutation({
    mutationFn: ({ empId, data }: { empId: string; data: any }) => api.post("/v1/payroll/employees/" + empId + "/overtime", data),
    onSuccess: () => { toast.success("Horas registradas"); setOvertimeEmp(null); },
    onError: (e: any) => toast.error(e.response?.data?.message ?? "Error"),
  });

  const handleEmpSave = (data: any) => {
    if (editingEmp?.id) updateEmp.mutate({ id: editingEmp.id, data });
    else createEmp.mutate(data);
  };

  const monthPillStatus = (m: number) => {
    const p = periods.find((pp: any) => pp.year === selYear && pp.month === m);
    if (!p) return "none";
    if (p.status === "PAID") return "paid";
    if (p.status === "PROCESSED") return "processed";
    return "open";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Planilla</h1>
          <p className="text-gray-500 text-sm">Empleados AFP/ONP - Pagos mensuales</p>
        </div>
        {tab === "employees" && (
          <button className="btn-primary flex items-center gap-2" onClick={() => { setEditingEmp(null); setShowEmpModal(true); }}>
            <Plus size={16} /> Nuevo empleado
          </button>
        )}
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button className={"px-4 py-2 rounded-md text-sm font-medium transition-all " + (tab === "employees" ? "bg-white shadow text-brand-700" : "text-gray-500 hover:text-gray-700")} onClick={() => setTab("employees")}>
          <UserCheck size={14} className="inline mr-1.5" />Empleados
        </button>
        <button className={"px-4 py-2 rounded-md text-sm font-medium transition-all " + (tab === "pagos" ? "bg-white shadow text-brand-700" : "text-gray-500 hover:text-gray-700")} onClick={() => setTab("pagos")}>
          <DollarSign size={14} className="inline mr-1.5" />Pagos de Planilla
        </button>
      </div>

      {tab === "employees" && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <UserCheck size={18} className="text-gray-400" />
            <h2 className="font-semibold">Empleados</h2>
            <span className="ml-auto text-sm text-gray-400">{employees.length}</span>
          </div>
          {empLoading ? (<div className="p-8 text-center text-gray-400">Cargando...</div>
          ) : employees.length === 0 ? (<p className="text-center text-gray-400 py-8">Sin empleados registrados</p>
          ) : (
            <div className="table-container">
              <table className="w-full text-sm">
                <thead className="bg-brand-50 text-brand-600 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-5 py-3 text-left">Nombre</th>
                    <th className="px-5 py-3 text-left">Tipo</th>
                    <th className="px-5 py-3 text-left">Cargo / Area</th>
                    <th className="px-5 py-3 text-right">Sueldo bruto</th>
                    <th className="px-5 py-3 text-left">Pension</th>
                    <th className="px-5 py-3 text-left">Estado</th>
                    <th className="px-5 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {employees.map((e: any) => (
                    <tr key={e.id} className="table-row-hover">
                      <td className="px-5 py-3 font-medium">{e.fullName}{e.email && <p className="text-xs text-gray-400">{e.email}</p>}</td>
                      <td className="px-5 py-3">
                        {e.employmentType === "RXH"
                          ? <span className="badge bg-orange-100 text-orange-700 text-xs">RxH</span>
                          : <span className="badge bg-blue-100 text-blue-700 text-xs">Planilla</span>}
                      </td>
                      <td className="px-5 py-3 text-gray-600">{e.position}{e.department && <span className="text-gray-400"> - {e.department}</span>}</td>
                      <td className="px-5 py-3 text-right font-mono font-semibold">{fmtS(e.baseSalary)}</td>
                      <td className="px-5 py-3">
                        {e.employmentType === "RXH" ? <span className="text-gray-400 text-xs">N/A</span>
                          : <div><span className="badge bg-indigo-100 text-indigo-700 text-xs">{e.pensionSystem}</span>
                              {e.afpName && <p className="text-xs text-gray-400 mt-0.5">{e.afpName}</p>}</div>}
                      </td>
                      <td className="px-5 py-3">
                        <span className={"badge text-xs " + (e.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500")}>
                          {e.isActive ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex gap-1.5 justify-end">
                          <button onClick={() => { setEditingEmp(e); setShowEmpModal(true); }} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-brand-600" title="Editar"><Edit2 size={14} /></button>
                          <button onClick={() => setOvertimeEmp(e)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-yellow-600" title="Horas extras"><Clock size={14} /></button>
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

      {tab === "pagos" && (
        <div className="space-y-4">
          {/* Month/Year Navigator */}
          <div className="card px-5 py-4">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setSelYear(y => y - 1)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500">
                <ChevronLeft size={16} />
              </button>
              <span className="font-semibold text-gray-700">{selYear}</span>
              <button onClick={() => setSelYear(y => y + 1)} disabled={selYear >= new Date().getFullYear()} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-30">
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {MONTH_SHORT.map((label, idx) => {
                const m = idx + 1;
                const isFuture = selYear > new Date().getFullYear() || (selYear === new Date().getFullYear() && m > new Date().getMonth() + 1);
                const isGratif = GRATIF_MONTHS.includes(m);
                const period = periods.find((p: any) => {
                  const d = new Date(p.startDate);
                  return d.getFullYear() === selYear && d.getMonth() + 1 === m;
                });
                const isSelected = selYear === selYear && m === selMonth;
                let pillCls = "relative flex flex-col items-center justify-center py-2 rounded-lg text-xs font-medium border transition-all cursor-pointer ";
                if (isSelected) {
                  pillCls += "border-brand-500 bg-brand-50 text-brand-700 shadow-sm ";
                } else if (period?.status === 'PAID') {
                  pillCls += "border-green-200 bg-green-50 text-green-700 ";
                } else if (period?.status === 'CONFIRMED') {
                  pillCls += "border-blue-200 bg-blue-50 text-blue-700 ";
                } else if (period) {
                  pillCls += "border-yellow-200 bg-yellow-50 text-yellow-700 ";
                } else if (isFuture) {
                  pillCls += "border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed ";
                } else {
                  pillCls += "border-gray-200 bg-white text-gray-500 hover:border-brand-300 hover:bg-brand-50 ";
                }
                const isCurrentMonth = selYear === new Date().getFullYear() && m === new Date().getMonth() + 1;
                return (
                  <button key={m} disabled={isFuture} onClick={() => !isFuture && setSelMonth(m)} className={pillCls}>
                    {isGratif && <Star size={8} className="absolute top-1 right-1 text-amber-400 fill-amber-400" />}
                    {label}
                    {isCurrentMonth && <span className="mt-0.5 w-1 h-1 rounded-full bg-current"></span>}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400"></span>Pagado</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400"></span>Confirmado</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400"></span>Abierto</span>
              <span className="flex items-center gap-1"><Star size={8} className="text-amber-400 fill-amber-400" />Gratificación</span>
            </div>
          </div>
          {/* MonthView for selected month */}
          <MonthView year={selYear} month={selMonth} periods={periods} />
        </div>
      )}
      {/* Employee Modal */}
      {showEmpModal && (
        <EmployeeModal
          initial={editingEmp}
          onSave={handleEmpSave}
          onClose={() => { setShowEmpModal(false); setEditingEmp(null); }}
        />
      )}
      {/* Overtime Modal */}
      {overtimeEmp && (
        <OvertimeModal
          employee={overtimeEmp}
          onSave={(d) => addOvertime.mutate({ empId: overtimeEmp.id, data: d })}
          onClose={() => setOvertimeEmp(null)}
        />
      )}
    </div>
  );
}
