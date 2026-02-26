import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useState, useRef, type ChangeEvent } from "react";
import {
  Plus, UserCheck, Edit2, Clock, Calendar, ChevronLeft, ChevronRight,
  CheckCircle, DollarSign, Mail, X, AlertCircle, RefreshCw, Star, Pencil, Trash2, Save, Check,
  RotateCcw, Upload, FileText
} from "lucide-react";
import toast from "react-hot-toast";
import { fmtMoney } from '../lib/fmt';

const AFP_OPTIONS    = ["AFP Integra", "Prima AFP", "Profuturo AFP", "Habitat AFP"];
const SEGURO_OPTIONS = [
  { value: "ESSALUD",      label: "EsSalud (9%)"              },
  { value: "EPS",          label: "EPS (privado)"             },
  { value: "ESSALUD_EPS",  label: "EsSalud + EPS"             },
  { value: "SIS",          label: "SIS"                       },
  { value: "SCTR",         label: "SCTR (trabajo de riesgo)"  },
];
const CONTRACT_OPTS = [
  { value: "INDEFINIDO", label: "Indefinido" },
  { value: "PLAZO_FIJO",  label: "Plazo Fijo" },
  { value: "PART_TIME",   label: "Part Time" },
];
const MONTH_NAMES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const MONTH_SHORT = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
const GRATIF_MONTHS = [7, 12];
const EMPTY_EMP_FORM = {
  fullName: "", nombres: "", apellidoPaterno: "", apellidoMaterno: "",
  dni: "", birthDate: "", position: "", department: "",
  employmentType: "PLANILLA", contractType: "INDEFINIDO",
  hireDate: "", contractEndDate: "", contractFileUrl: "",
  baseSalary: "", pensionSystem: "AFP", afpName: "",
  seguroSalud: "ESSALUD",
  cuspp: "", email: "", bankAccount: "", bankName: "",
};

const fmtS = fmtMoney;

function statusBadge(s: string) {
  if (s === "PAID")      return <span className="badge bg-green-100 text-green-700 text-xs">Pagado</span>;
  if (s === "CONFIRMED") return <span className="badge bg-blue-100 text-blue-700 text-xs">Confirmado</span>;
  return                        <span className="badge bg-gray-100 text-gray-500 text-xs">Borrador</span>;
}

// ── ContractsManager ─────────────────────────────────────────────────────────
interface ContractEntry {
  id: string; type: string; signDate: string; startDate: string; endDate: string;
  fileName: string; dataUrl?: string;
}
function ContractsManager({
  contractsJson, onChange,
}: {
  contractsJson: string;
  onChange: (json: string, latestEndDate: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setFormC] = useState<Omit<ContractEntry, 'id' | 'fileName' | 'dataUrl'>>({
    type: 'PLAZO_FIJO', signDate: '', startDate: '', endDate: '',
  });
  const [pendingFile, setPendingFile] = useState<{ name: string; dataUrl: string } | null>(null);

  const contracts: ContractEntry[] = (() => {
    try { if (contractsJson?.startsWith('[')) return JSON.parse(contractsJson); } catch {}
    return [];
  })();

  const save = (next: ContractEntry[]) => {
    const latestEnd = next
      .map(c => c.endDate)
      .filter(Boolean)
      .sort()
      .at(-1) ?? '';
    onChange(JSON.stringify(next), latestEnd);
  };

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setPendingFile({ name: file.name, dataUrl: ev.target?.result as string });
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const addContract = () => {
    const entry: ContractEntry = {
      id: Date.now().toString(),
      type: form.type, signDate: form.signDate, startDate: form.startDate, endDate: form.endDate,
      fileName: pendingFile?.name ?? '', dataUrl: pendingFile?.dataUrl,
    };
    save([...contracts, entry]);
    setFormC({ type: 'PLAZO_FIJO', signDate: '', startDate: '', endDate: '' });
    setPendingFile(null);
    setShowForm(false);
  };

  const remove = (id: string) => save(contracts.filter(c => c.id !== id));

  const CONTRACT_LABELS: Record<string, string> = {
    INDEFINIDO: 'Indefinido', PLAZO_FIJO: 'Plazo Fijo', PART_TIME: 'Part Time',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Contratos</h4>
        <button type="button" className="text-xs text-brand-600 hover:underline flex items-center gap-1"
          onClick={() => setShowForm(v => !v)}>
          <Plus size={12} /> Agregar contrato
        </button>
      </div>

      {/* Existing contracts */}
      {contracts.length > 0 && (
        <div className="space-y-2 mb-3">
          {contracts.map(c => {
            const daysLeft = c.endDate
              ? Math.ceil((new Date(c.endDate).getTime() - Date.now()) / 86400000)
              : null;
            const isUrgent = daysLeft !== null && daysLeft < 60;
            return (
              <div key={c.id} className="flex items-start justify-between gap-3 p-2.5 rounded-lg bg-gray-50 border border-gray-200">
                <div className="flex items-start gap-2 min-w-0">
                  <FileText size={16} className="text-brand-500 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-700">{CONTRACT_LABELS[c.type] ?? c.type}</p>
                    {c.signDate && <p className="text-xs text-gray-400">Firma: {c.signDate}</p>}
                    <p className="text-xs text-gray-400">
                      {c.startDate && `Inicio: ${c.startDate}`}
                      {c.startDate && c.endDate && ' · '}
                      {c.endDate && (
                        <span className={isUrgent ? 'text-red-600 font-medium' : ''}>
                          Vence: {c.endDate}{isUrgent && ` (${daysLeft}d)`}
                        </span>
                      )}
                    </p>
                    {c.fileName && (
                      c.dataUrl
                        ? <a href={c.dataUrl} download={c.fileName} className="text-xs text-brand-600 hover:underline">📄 {c.fileName}</a>
                        : <p className="text-xs text-gray-400">📄 {c.fileName}</p>
                    )}
                  </div>
                </div>
                <button type="button" onClick={() => remove(c.id)} className="text-gray-300 hover:text-red-500 flex-shrink-0">
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {contracts.length === 0 && !showForm && (
        <p className="text-xs text-gray-400 mb-3">Sin contratos registrados</p>
      )}

      {/* Add contract form */}
      {showForm && (
        <div className="p-3 rounded-lg border border-brand-200 bg-brand-50/50 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
              <select className="input text-sm" value={form.type} onChange={e => setFormC(f => ({ ...f, type: e.target.value }))}>
                {CONTRACT_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de firma</label>
              <input className="input text-sm" type="date" value={form.signDate} onChange={e => setFormC(f => ({ ...f, signDate: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de inicio</label>
              <input className="input text-sm" type="date" value={form.startDate} onChange={e => setFormC(f => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de expiración</label>
              <input className="input text-sm" type="date" value={form.endDate} onChange={e => setFormC(f => ({ ...f, endDate: e.target.value }))} />
            </div>
          </div>
          {/* File upload */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Contrato PDF (opcional)</label>
            <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleFile} />
            {pendingFile ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-brand-600">📄 {pendingFile.name}</span>
                <button type="button" onClick={() => setPendingFile(null)} className="text-gray-400 hover:text-red-500"><X size={12} /></button>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 text-xs text-brand-600 border border-brand-300 rounded-lg px-3 py-1.5 hover:bg-brand-50">
                <Upload size={12} /> Subir PDF
              </button>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" className="btn-primary text-xs py-1.5 px-3" onClick={addContract}>Guardar contrato</button>
            <button type="button" className="btn-secondary text-xs py-1.5 px-3" onClick={() => { setShowForm(false); setPendingFile(null); }}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function EmployeeModal({ initial, onSave, onClose }: { initial: any; onSave: (data: any) => void; onClose: () => void }) {
  const [form, setForm] = useState<any>(() => {
    // Back-fill name parts from fullName if not separately stored
    const f = { ...initial };
    if (!f.nombres && !f.apellidoPaterno && f.fullName) {
      const parts = f.fullName.trim().split(/\s+/);
      if (parts.length >= 3) {
        f.apellidoMaterno = parts[parts.length - 1];
        f.apellidoPaterno = parts[parts.length - 2];
        f.nombres         = parts.slice(0, parts.length - 2).join(' ');
      } else if (parts.length === 2) {
        f.apellidoPaterno = parts[1];
        f.nombres         = parts[0];
        f.apellidoMaterno = '';
      } else {
        f.nombres = f.fullName;
        f.apellidoPaterno = '';
        f.apellidoMaterno = '';
      }
    }
    if (!f.seguroSalud) f.seguroSalud = 'ESSALUD';
    if (!f.birthDate && f.birthDate !== '') {
      const bd = initial.birthDate;
      f.birthDate = bd ? new Date(bd).toISOString().split('T')[0] : '';
    }
    return f;
  });
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
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nombres *</label>
              <input className="input" placeholder="Ej: María del Carmen" value={form.nombres}
                onChange={e => { set("nombres", e.target.value); set("fullName", [e.target.value, form.apellidoPaterno, form.apellidoMaterno].filter(Boolean).join(" ")); }} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Apellido Paterno *</label>
              <input className="input" placeholder="Ej: García" value={form.apellidoPaterno}
                onChange={e => { set("apellidoPaterno", e.target.value); set("fullName", [form.nombres, e.target.value, form.apellidoMaterno].filter(Boolean).join(" ")); }} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Apellido Materno</label>
              <input className="input" placeholder="Ej: López" value={form.apellidoMaterno}
                onChange={e => { set("apellidoMaterno", e.target.value); set("fullName", [form.nombres, form.apellidoPaterno, e.target.value].filter(Boolean).join(" ")); }} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">DNI *</label>
              <input className="input" value={form.dni} onChange={e => set("dni", e.target.value)} maxLength={8} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de nacimiento</label>
              <input className="input" type="date" value={form.birthDate} onChange={e => set("birthDate", e.target.value)} />
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
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Seguro de salud</label>
                <select className="input" value={form.seguroSalud} onChange={e => set("seguroSalud", e.target.value)}>
                  {SEGURO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
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

          {/* ── Contratos ── */}
          <div className="border-t border-gray-100 pt-4">
            <ContractsManager
              contractsJson={form.contractFileUrl ?? ''}
              onChange={(json, latestEndDate) => {
                set("contractFileUrl", json);
                if (latestEndDate) set("contractEndDate", latestEndDate);
              }}
            />
            {/* Keep contractEndDate hidden but derived from latest contract */}
            <div className="hidden">
              <input type="hidden" value={form.contractEndDate ?? ''} />
            </div>
            {false && (
              <div className="mt-2">
                <a href={form.contractFileUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-brand-600 hover:underline">
                  <span>📄</span> Ver contrato adjunto
                </a>
              </div>
            )}
          </div>
        </div>
        <div className="px-6 py-4 border-t flex gap-2 justify-end bg-gray-50 sticky bottom-0">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={() => onSave({ ...form, baseSalary: parseFloat(form.baseSalary) || 0, birthDate: form.birthDate || undefined })}>
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

function PayslipRow({ ps, onConfirm, onPay, onClick }: { ps: any; onConfirm: () => void; onPay: () => void; onClick: () => void }) {
  const ded  = ps.deductions as any;
  const adds = ps.additions as any;
  const totalDed = (ded.afpOrOnp || 0) + (ded.igv5taCategoria || 0) + (ded.irRxH || 0);
  const hasOT    = (adds.overtime25 || 0) + (adds.overtime35 || 0) + (adds.holidayPay || 0) > 0;
  const isRxH    = ps.employee?.employmentType === "RXH";
  return (
    <tr className="table-row-hover text-sm cursor-pointer" onClick={onClick}>
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
            <button onClick={e => { e.stopPropagation(); onConfirm(); }} className="btn-secondary py-1 px-2 text-xs flex items-center gap-1">
              <CheckCircle size={12} /> Confirmar
            </button>
          )}
          {ps.status === "CONFIRMED" && (
            <button onClick={e => { e.stopPropagation(); onPay(); }} className="btn-primary py-1 px-2 text-xs flex items-center gap-1">
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


// ── PayslipDetailModal ────────────────────────────────────────────────────────
function PayslipDetailModal({
  ps, period, onClose, onConfirm, onUnconfirm, onPay, onUnpay, onRecalculated,
}: {
  ps: any; period: any;
  onClose: () => void; onConfirm: () => void; onUnconfirm: () => void; onPay: () => void; onUnpay: () => void; onRecalculated: () => void;
}) {
  const qc  = useQueryClient();
  const ded = ps.deductions as any ?? {};
  const adds = ps.additions as any ?? {};
  const isRxH = ps.employee?.employmentType === "RXH";
  const isPaid = ps.status === "PAID";

  const [manualBonus, setManualBonus] = useState(Number(ps.manualBonuses ?? 0));
  const [manualDed,   setManualDed]   = useState(Number(ps.manualDeductions ?? 0));
  const [notes,       setNotes]       = useState(ps.notes ?? "");
  const [showOTForm,       setShowOTForm]       = useState(false);
  const [showUnpayConfirm, setShowUnpayConfirm] = useState(false);
  const [otForm, setOtForm] = useState({
    date: new Date().toISOString().split("T")[0],
    isHoliday: false, holidayHours: "0",
    overtime25: "0", overtime35: "0", notes: "",
  });

  // Fetch overtime records for this employee
  const { data: otData, refetch: refetchOT } = useQuery({
    queryKey: ["overtime-emp", ps.employee?.id],
    queryFn: () => api.get("/v1/payroll/employees/" + ps.employee?.id + "/overtime").then(r => r.data),
    enabled: !!ps.employee?.id,
  });
  const allOT: any[] = otData?.data ?? [];
  // Filter to this period
  const periodStart = new Date(period.year, period.month - 1, 1);
  const periodEnd   = new Date(period.year, period.month, 0);
  const periodOT = allOT.filter(r => {
    const d = new Date(r.date);
    return d >= periodStart && d <= periodEnd;
  });

  const deleteOT = useMutation({
    mutationFn: (id: string) => api.delete("/v1/payroll/overtime/" + id),
    onSuccess: () => { refetchOT(); toast.success("Registro eliminado"); },
    onError: () => toast.error("Error al eliminar"),
  });

  const addOT = useMutation({
    mutationFn: (d: any) => api.post("/v1/payroll/employees/" + ps.employee?.id + "/overtime", d),
    onSuccess: () => { refetchOT(); setShowOTForm(false); setOtForm({ date: new Date().toISOString().split("T")[0], isHoliday: false, holidayHours: "0", overtime25: "0", overtime35: "0", notes: "" }); toast.success("Registrado"); },
    onError: (e: any) => toast.error(e.response?.data?.message ?? "Error"),
  });

  const saveAndRecalc = useMutation({
    mutationFn: () => api.patch("/v1/payroll/payslips/" + ps.id, {
      manualBonuses: manualBonus, manualDeductions: manualDed, notes,
    }),
    onSuccess: () => { onRecalculated(); toast.success("Ajustes guardados"); },
    onError: (e: any) => toast.error(e.response?.data?.message ?? "Error"),
  });

  const hourlyRate = Number(ps.employee?.baseSalary ?? 0) / 30 / 8;
  const otPreview = otForm.isHoliday
    ? hourlyRate * parseFloat(otForm.holidayHours || "0") * 2
    : hourlyRate * parseFloat(otForm.overtime25 || "0") * 1.25 + hourlyRate * parseFloat(otForm.overtime35 || "0") * 1.35;

  const MONTH_NAMES_FULL = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

  const totalDed = (ded.afpOrOnp||0)+(ded.afpCommission||0)+(ded.afpInsurance||0)+(ded.igv5taCategoria||0)+(ded.irRxH||0)+(ded.otherDeductions||0);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-900">{ps.employee?.fullName}</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {MONTH_NAMES_FULL[period.month - 1]} {period.year} &nbsp;·&nbsp;
              {isRxH ? <span className="text-orange-600">RxH</span> : <span className="text-blue-600">Planilla</span>}
              &nbsp;·&nbsp;{statusBadge(ps.status)}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {/* ── Calculation breakdown ─────────────────────────────────── */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Desglose de cálculo</p>
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-green-50">
                  <tr><th className="px-4 py-2 text-left text-xs font-semibold text-green-700 uppercase tracking-wide">Ingresos</th><th className="px-4 py-2 text-right text-xs font-semibold text-green-700"></th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr className="bg-white"><td className="px-4 py-2 text-gray-700">{isRxH ? "Honorarios brutos" : "Sueldo base"}</td><td className="px-4 py-2 text-right font-mono">{fmtS(ps.employee?.baseSalary)}</td></tr>
                  {(adds.overtime25||0) > 0 && <tr className="bg-white"><td className="px-4 py-2 text-amber-700">+ Horas extras 25%</td><td className="px-4 py-2 text-right font-mono text-amber-700">{fmtS(adds.overtime25)}</td></tr>}
                  {(adds.overtime35||0) > 0 && <tr className="bg-white"><td className="px-4 py-2 text-amber-700">+ Horas extras 35%</td><td className="px-4 py-2 text-right font-mono text-amber-700">{fmtS(adds.overtime35)}</td></tr>}
                  {(adds.holidayPay||0) > 0 && <tr className="bg-white"><td className="px-4 py-2 text-amber-700">+ Trabajo en feriado (×2)</td><td className="px-4 py-2 text-right font-mono text-amber-700">{fmtS(adds.holidayPay)}</td></tr>}
                  {(adds.bonuses||0) > 0 && <tr className="bg-white"><td className="px-4 py-2 text-purple-700">+ Bonificaciones</td><td className="px-4 py-2 text-right font-mono text-purple-700">{fmtS(adds.bonuses)}</td></tr>}
                  <tr className="bg-green-50 font-semibold">
                    <td className="px-4 py-2.5 text-green-800">Total bruto</td>
                    <td className="px-4 py-2.5 text-right font-mono text-green-800">{fmtS(ps.grossSalary)}</td>
                  </tr>
                </tbody>
                <thead className="bg-red-50">
                  <tr><th className="px-4 py-2 text-left text-xs font-semibold text-red-700 uppercase tracking-wide">Descuentos</th><th></th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(ded.afpOrOnp||0) > 0 && <tr className="bg-white"><td className="px-4 py-2 text-gray-700">{ps.employee?.pensionSystem === "AFP" ? `AFP fondo (10%)` : `ONP (13%)`}</td><td className="px-4 py-2 text-right font-mono text-red-600">({fmtS(ded.afpOrOnp)})</td></tr>}
                  {(ded.afpCommission||0) > 0 && <tr className="bg-white"><td className="px-4 py-2 text-gray-700">Comisión AFP</td><td className="px-4 py-2 text-right font-mono text-red-600">({fmtS(ded.afpCommission)})</td></tr>}
                  {(ded.afpInsurance||0) > 0 && <tr className="bg-white"><td className="px-4 py-2 text-gray-700">Prima seguro AFP</td><td className="px-4 py-2 text-right font-mono text-red-600">({fmtS(ded.afpInsurance)})</td></tr>}
                  {(ded.igv5taCategoria||0) > 0 && <tr className="bg-white"><td className="px-4 py-2 text-gray-700">Renta 5ta categoría</td><td className="px-4 py-2 text-right font-mono text-red-600">({fmtS(ded.igv5taCategoria)})</td></tr>}
                  {(ded.irRxH||0) > 0 && <tr className="bg-white"><td className="px-4 py-2 text-gray-700">Retención IR RxH (8%)</td><td className="px-4 py-2 text-right font-mono text-red-600">({fmtS(ded.irRxH)})</td></tr>}
                  {(ded.otherDeductions||0) > 0 && <tr className="bg-white"><td className="px-4 py-2 text-gray-700">Otros descuentos</td><td className="px-4 py-2 text-right font-mono text-red-600">({fmtS(ded.otherDeductions)})</td></tr>}
                  <tr className="bg-red-50 font-semibold">
                    <td className="px-4 py-2.5 text-red-700">Total descuentos</td>
                    <td className="px-4 py-2.5 text-right font-mono text-red-700">({fmtS(totalDed)})</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="bg-brand-50">
                    <td className="px-4 py-3 font-bold text-brand-900 text-base">NETO A PAGAR</td>
                    <td className="px-4 py-3 text-right font-bold font-mono text-brand-900 text-base">{fmtS(ps.netSalary)}</td>
                  </tr>
                  {(Number(ps.employerTotalCost||0)) > 0 && (
                    <tr className="bg-gray-50">
                      <td className="px-4 py-2 text-xs text-gray-500">Costo total empleador (EsSalud + provisiones)</td>
                      <td className="px-4 py-2 text-right text-xs text-gray-500 font-mono">{fmtS(ps.employerTotalCost)}</td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          </div>

          {/* ── Overtime records ──────────────────────────────────────── */}
          {!isPaid && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Horas extras / Feriados del período</p>
              <button onClick={() => setShowOTForm(v => !v)}
                className="text-xs text-brand-600 hover:text-brand-800 flex items-center gap-1 font-medium">
                <Plus size={12} /> Agregar
              </button>
            </div>
            {showOTForm && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Fecha</label>
                    <input className="input" type="date" value={otForm.date} onChange={e => setOtForm(f => ({...f, date: e.target.value}))} />
                  </div>
                  <div className="flex items-center gap-2 mt-5">
                    <input type="checkbox" id="isHolMod" checked={otForm.isHoliday} onChange={e => setOtForm(f => ({...f, isHoliday: e.target.checked}))} className="rounded" />
                    <label htmlFor="isHolMod" className="text-sm text-gray-700">Trabajo en feriado (×2)</label>
                  </div>
                </div>
                {otForm.isHoliday ? (
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">Horas en feriado</label>
                    <input className="input" type="number" step="0.5" min="0" value={otForm.holidayHours} onChange={e => setOtForm(f => ({...f, holidayHours: e.target.value}))} /></div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs font-medium text-gray-600 mb-1">HE 25% (primeras 2h)</label>
                      <input className="input" type="number" step="0.5" min="0" value={otForm.overtime25} onChange={e => setOtForm(f => ({...f, overtime25: e.target.value}))} /></div>
                    <div><label className="block text-xs font-medium text-gray-600 mb-1">HE 35% (desde 3ra hora)</label>
                      <input className="input" type="number" step="0.5" min="0" value={otForm.overtime35} onChange={e => setOtForm(f => ({...f, overtime35: e.target.value}))} /></div>
                  </div>
                )}
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
                  <input className="input" value={otForm.notes} onChange={e => setOtForm(f => ({...f, notes: e.target.value}))} placeholder="Ej: feriado 28 julio" /></div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-amber-700">Estimado: <strong>{fmtS(otPreview.toFixed(2))}</strong></p>
                  <div className="flex gap-2">
                    <button className="btn-secondary text-xs py-1 px-2" onClick={() => setShowOTForm(false)}>Cancelar</button>
                    <button className="btn-primary text-xs py-1 px-2" onClick={() => addOT.mutate({
                      date: otForm.date, isHoliday: otForm.isHoliday,
                      holidayHours: parseFloat(otForm.holidayHours)||0,
                      overtime25: parseFloat(otForm.overtime25)||0,
                      overtime35: parseFloat(otForm.overtime35)||0,
                      hoursWorked: 0, regularHours: 8, notes: otForm.notes,
                    })}>Guardar</button>
                  </div>
                </div>
              </div>
            )}
            {periodOT.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">Sin registros de horas extras / feriados para este período.</p>
            ) : (
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-500 font-semibold">Fecha</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-semibold">Tipo</th>
                      <th className="px-3 py-2 text-right text-gray-500 font-semibold">Horas</th>
                      <th className="px-3 py-2 text-right text-gray-500 font-semibold">Importe</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {periodOT.map((r: any) => {
                      const hrs = r.isHoliday ? r.holidayHours : (r.overtime25 + r.overtime35);
                      const hr  = Number(ps.employee?.baseSalary||0) / 30 / 8;
                      const amt = r.isHoliday ? hr * r.holidayHours * 2 : hr * r.overtime25 * 1.25 + hr * r.overtime35 * 1.35;
                      return (
                        <tr key={r.id} className="bg-white hover:bg-gray-50">
                          <td className="px-3 py-2">{new Date(r.date).toLocaleDateString('es-PE')}</td>
                          <td className="px-3 py-2">
                            {r.isHoliday ? <span className="badge bg-red-100 text-red-700">Feriado</span>
                              : <span className="badge bg-amber-100 text-amber-700">HE {r.overtime25 > 0 ? "25%" : "35%"}</span>}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">{hrs}h</td>
                          <td className="px-3 py-2 text-right font-mono text-amber-700">{fmtS(amt.toFixed(2))}</td>
                          <td className="px-3 py-2 text-right">
                            <button onClick={() => deleteOT.mutate(r.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                              <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          )}

          {/* ── Manual adjustments ───────────────────────────────────── */}
          {!isPaid && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Ajustes manuales</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Bonificación adicional (S/)</label>
                <input className="input" type="number" step="0.01" min="0" value={manualBonus}
                  onChange={e => setManualBonus(parseFloat(e.target.value)||0)} />
                <p className="text-xs text-gray-400 mt-0.5">Se suma al bruto y al neto</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Descuento adicional (S/)</label>
                <input className="input" type="number" step="0.01" min="0" value={manualDed}
                  onChange={e => setManualDed(parseFloat(e.target.value)||0)} />
                <p className="text-xs text-gray-400 mt-0.5">Se resta del neto</p>
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notas internas</label>
              <textarea className="input resize-none w-full" rows={2} value={notes}
                onChange={e => setNotes(e.target.value)} placeholder="Ej: Bono por rendimiento, adelanto de sueldo, etc." />
            </div>
            {(manualBonus > 0 || manualDed > 0) && (
              <div className="mt-2 p-3 bg-brand-50 rounded-lg text-xs text-brand-700">
                Neto estimado con ajustes: <strong>{fmtS(Math.max(0, Number(ps.netSalary) + manualBonus - manualDed).toFixed(2))}</strong>
              </div>
            )}
          </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 space-y-3">
          {/* State machine stepper */}
          <div className="flex items-center gap-1">
            {(["DRAFT", "CONFIRMED", "PAID"] as const).map((step, i, arr) => {
              const idx     = ["DRAFT", "CONFIRMED", "PAID"].indexOf(ps.status);
              const stepIdx = i;
              const isDone   = stepIdx < idx;
              const isActive = stepIdx === idx;
              const labels   = ["Borrador", "Confirmado", "Pagado"];
              const icons    = [Edit2, CheckCircle, DollarSign];
              const Icon     = icons[i];
              return (
                <div key={step} className="flex items-center gap-1">
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all
                    ${isActive  ? 'bg-brand-100 text-brand-700 ring-2 ring-brand-300'
                    : isDone    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-400'}`}>
                    <Icon size={12} />
                    {labels[i]}
                  </div>
                  {i < arr.length - 1 && (
                    <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {!isPaid && (
              <button
                onClick={() => saveAndRecalc.mutate()}
                disabled={saveAndRecalc.isPending}
                className="btn-primary flex items-center gap-1.5 text-sm"
              >
                {saveAndRecalc.isPending ? <><RefreshCw size={14} className="animate-spin" /> Guardando...</> : <><Pencil size={14} /> Guardar ajustes</>}
              </button>
            )}
            {ps.status === "DRAFT" && (
              <button onClick={onConfirm} className="btn-secondary flex items-center gap-1.5 text-sm text-blue-600 border-blue-200 hover:bg-blue-50">
                <CheckCircle size={14} /> Confirmar boleta
              </button>
            )}
            {ps.status === "CONFIRMED" && (<>
              <button onClick={onUnconfirm} className="btn-secondary flex items-center gap-1.5 text-sm text-amber-600 border-amber-200 hover:bg-amber-50">
                <RotateCcw size={14} /> Revertir a borrador
              </button>
              <button onClick={onPay} className="btn-secondary flex items-center gap-1.5 text-sm text-green-600 border-green-200 hover:bg-green-50">
                <DollarSign size={14} /> Pagar{ps.employee?.email && <Mail size={12} className="ml-0.5" />}
              </button>
            </>)}
            {ps.status === "PAID" && (<>
              <span className="text-sm text-green-600 flex items-center gap-1.5 font-medium">
                <CheckCircle size={14} /> Pagado{ps.emailSentAt ? " · Email enviado" : ""}
              </span>
              <button onClick={() => setShowUnpayConfirm(true)} className="btn-secondary flex items-center gap-1.5 text-sm text-amber-600 border-amber-200 hover:bg-amber-50">
                <RotateCcw size={14} /> Revertir pago
              </button>
            </>)}
            <button onClick={onClose} className="ml-auto btn-secondary text-sm">Cerrar</button>
          </div>
        </div>
      </div>

      {/* Confirmation dialog — Revertir pago */}
      {showUnpayConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowUnpayConfirm(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <RotateCcw size={18} className="text-amber-600" />
              </div>
              <h3 className="font-semibold text-gray-900 text-lg">¿Revertir pago?</h3>
            </div>
            <p className="text-sm text-gray-500 mb-5">
              La boleta de <strong className="text-gray-800">{ps.employee?.fullName}</strong> volverá al estado <span className="font-medium text-blue-700">Confirmado</span>. Deberás volver a marcarla como pagada cuando corresponda.
            </p>
            <div className="flex gap-3 justify-end">
              <button className="btn-secondary text-sm" onClick={() => setShowUnpayConfirm(false)}>Cancelar</button>
              <button
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors"
                onClick={() => { setShowUnpayConfirm(false); onUnpay(); }}
              >
                <RotateCcw size={14} /> Sí, revertir pago
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MonthView({ year, month, periods }: { year: number; month: number; periods: any[] }) {
  const qc = useQueryClient();
  const [selectedPayslip, setSelectedPayslip] = useState<any>(null);
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payslips", period?.id] });
      // Refresh modal data
      setSelectedPayslip((cur: any) => cur ? { ...cur, status: "CONFIRMED", confirmedAt: new Date().toISOString() } : null);
      toast.success("Boleta confirmada");
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? "Error"),
  });

  const unconfirm = useMutation({
    mutationFn: (id: string) => api.post("/v1/payroll/payslips/" + id + "/unconfirm", {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payslips", period?.id] });
      setSelectedPayslip((cur: any) => cur ? { ...cur, status: "DRAFT", confirmedAt: null } : null);
      toast.success("Boleta revertida a borrador");
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? "Error"),
  });

  const pay = useMutation({
    mutationFn: (id: string) => api.post("/v1/payroll/payslips/" + id + "/pay", {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payslips", period?.id] }); toast.success("Pagado y correo enviado"); },
    onError:   (e: any) => toast.error(e.response?.data?.message ?? "Error al pagar"),
  });

  const unpay = useMutation({
    mutationFn: (id: string) => api.post("/v1/payroll/payslips/" + id + "/unpay", {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payslips", period?.id] });
      setSelectedPayslip((cur: any) => cur ? { ...cur, status: "CONFIRMED", paidAt: null } : null);
      toast.success("Pago revertido — boleta vuelve a Confirmada");
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? "Error al revertir pago"),
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
                    onClick={() => setSelectedPayslip(ps)}
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
    {selectedPayslip && (
      <PayslipDetailModal
        ps={selectedPayslip}
        period={{ year, month }}
        onClose={() => setSelectedPayslip(null)}
        onConfirm={() => confirm.mutate(selectedPayslip.id)}
        onUnconfirm={() => unconfirm.mutate(selectedPayslip.id)}
        onPay={() => pay.mutate(selectedPayslip.id)}
        onUnpay={() => unpay.mutate(selectedPayslip.id)}
        onRecalculated={() => {
          qc.invalidateQueries({ queryKey: ["payslips", period?.id] });
          setSelectedPayslip(null);
        }}
      />
    )}
    </div>
  );
}

import { ExcelDownloadButton } from '../components/ExcelDownloadButton';
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
          <h1 className="text-2xl font-bold">Trabajadores</h1>
          <p className="text-gray-500 text-sm">Empleados AFP/ONP - Pagos mensuales</p>
        </div>
        {tab === "employees" && (
          <div className="flex items-center gap-2">
            <ExcelDownloadButton
              filename="empleados"
              sheetName="Empleados"
              data={employees}
              columns={[
                { header: 'Nombre completo', key: 'fullName', width: 28 },
                { header: 'Documento', key: 'docNumber', width: 14 },
                { header: 'Cargo', key: 'position', width: 22 },
                { header: 'Departamento', key: 'department', width: 20 },
                { header: 'Sueldo base S/', key: 'baseSalary', width: 16, format: (v: any) => v != null ? Number(v) : 0 },
                { header: 'Pension', key: 'pensionSystem', width: 10 },
                { header: 'Fecha ingreso', key: 'startDate', width: 16, format: (v: any) => v ? new Date(v).toLocaleDateString('es-PE') : '' },
                { header: 'Email', key: 'email', width: 28 },
                { header: 'Telefono', key: 'phone', width: 14 },
              ]}
              extraFilters={[
                { key: 'pensionSystem', label: 'Sistema pension', type: 'select', options: [{ value: 'AFP', label: 'AFP' }, { value: 'ONP', label: 'ONP' }] },
                { key: 'department', label: 'Departamento', type: 'text' },
              ]}
            />
            <button className="btn-primary flex items-center gap-2" onClick={() => { setEditingEmp(null); setShowEmpModal(true); }}>
              <Plus size={16} /> Nuevo empleado
            </button>
          </div>
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
                    <th className="px-5 py-3 text-left">Exp. contrato</th>
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
                        {e.contractEndDate ? (() => {
                          const daysLeft = Math.ceil((new Date(e.contractEndDate).getTime() - Date.now()) / 86400000);
                          const isUrgent = daysLeft < 60;
                          return (
                            <span className={"text-xs font-medium " + (isUrgent ? "text-red-600" : "text-gray-600")}>
                              {new Date(e.contractEndDate).toLocaleDateString('es-PE')}
                              {isUrgent && <span className="ml-1 badge bg-red-100 text-red-600">{daysLeft}d</span>}
                            </span>
                          );
                        })() : <span className="text-xs text-gray-400">—</span>}
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
