"""
Adds PayslipDetailModal to Payroll.tsx and makes rows clickable.
The modal shows:
  - Full income/deduction breakdown table
  - Overtime records for the period (list + delete + add)
  - Manual bonus / manual deduction fields
  - Notes textarea
  - Recalculate (PATCH + refresh), Confirm, Pay actions
Also adds the payroll email info banner (contabilidad@ CC note).
"""

path = '/Users/victordyrnes/Desktop/victorsdou ERP/victorsdou-frontend/src/pages/Payroll.tsx'
with open(path) as f: src = f.read()

# ── 1. Add Pencil icon import ────────────────────────────────────────────────
src = src.replace(
    'import { Star, RefreshCw, Plus, ChevronLeft, ChevronRight,',
    'import { Star, RefreshCw, Plus, ChevronLeft, ChevronRight, Pencil,'
)

# ── 2. Make PayslipRow accept onClick ────────────────────────────────────────
src = src.replace(
    'function PayslipRow({ ps, onConfirm, onPay }: { ps: any; onConfirm: () => void; onPay: () => void }) {',
    'function PayslipRow({ ps, onConfirm, onPay, onClick }: { ps: any; onConfirm: () => void; onPay: () => void; onClick: () => void }) {'
)

# Make the row <tr> clickable
src = src.replace(
    '  return (\n    <tr className="table-row-hover text-sm">\n      <td className="px-4 py-3">',
    '  return (\n    <tr className="table-row-hover text-sm cursor-pointer" onClick={onClick}>\n      <td className="px-4 py-3">'
)

# Prevent action buttons from bubbling to row click
src = src.replace(
    '          {ps.status === "DRAFT" && (\n            <button onClick={onConfirm}',
    '          {ps.status === "DRAFT" && (\n            <button onClick={e => { e.stopPropagation(); onConfirm(); }}'
)
src = src.replace(
    '          {ps.status === "CONFIRMED" && (\n            <button onClick={onPay}',
    '          {ps.status === "CONFIRMED" && (\n            <button onClick={e => { e.stopPropagation(); onPay(); }}'
)

# ── 3. Add selectedPayslip state to MonthView ────────────────────────────────
src = src.replace(
    'function MonthView({ year, month, periods }: { year: number; month: number; periods: any[] }) {\n  const qc = useQueryClient();',
    'function MonthView({ year, month, periods }: { year: number; month: number; periods: any[] }) {\n  const qc = useQueryClient();\n  const [selectedPayslip, setSelectedPayslip] = useState<any>(null);'
)

# Pass onClick to PayslipRow
src = src.replace(
    '                {payslips.map((ps: any) => (\n                  <PayslipRow key={ps.id} ps={ps}\n                    onConfirm={() => confirm.mutate(ps.id)}\n                    onPay={() => pay.mutate(ps.id)} />',
    '                {payslips.map((ps: any) => (\n                  <PayslipRow key={ps.id} ps={ps}\n                    onClick={() => setSelectedPayslip(ps)}\n                    onConfirm={() => confirm.mutate(ps.id)}\n                    onPay={() => pay.mutate(ps.id)} />'
)

# Add PayslipDetailModal + email info below the table, before closing MonthView div
src = src.replace(
    '    </div>\n  );\n}\nexport default function Payroll()',
    '''    {/* PayslipDetailModal */}
    {selectedPayslip && period && (
      <PayslipDetailModal
        ps={selectedPayslip}
        period={period}
        onClose={() => setSelectedPayslip(null)}
        onConfirm={() => { confirm.mutate(selectedPayslip.id); setSelectedPayslip(null); }}
        onPay={() => { pay.mutate(selectedPayslip.id); setSelectedPayslip(null); }}
        onRecalculated={() => {
          qc.invalidateQueries({ queryKey: ["payslips", period.id] });
          setSelectedPayslip(null);
        }}
      />
    )}
  </div>
);
}
export default function Payroll()'''
)

# ── 4. Insert PayslipDetailModal component before MonthView ──────────────────
modal_component = '''
// ── PayslipDetailModal ────────────────────────────────────────────────────────
function PayslipDetailModal({
  ps, period, onClose, onConfirm, onPay, onRecalculated,
}: {
  ps: any; period: any;
  onClose: () => void; onConfirm: () => void; onPay: () => void; onRecalculated: () => void;
}) {
  const qc  = useQueryClient();
  const ded = ps.deductions as any ?? {};
  const adds = ps.additions as any ?? {};
  const isRxH = ps.employee?.employmentType === "RXH";
  const isPaid = ps.status === "PAID";

  const [manualBonus, setManualBonus] = useState(Number(ps.manualBonuses ?? 0));
  const [manualDed,   setManualDed]   = useState(Number(ps.manualDeductions ?? 0));
  const [notes,       setNotes]       = useState(ps.notes ?? "");
  const [showOTForm,  setShowOTForm]  = useState(false);
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
        <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-2 flex-wrap">
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
          {ps.status === "CONFIRMED" && (
            <button onClick={onPay} className="btn-secondary flex items-center gap-1.5 text-sm text-green-600 border-green-200 hover:bg-green-50">
              <DollarSign size={14} /> Pagar{ps.employee?.email && <Mail size={12} />}
            </button>
          )}
          {ps.status === "PAID" && (
            <span className="text-sm text-green-600 flex items-center gap-1.5 font-medium">
              <CheckCircle size={14} /> Pagado{ps.emailSentAt ? " · Email enviado" : ""}
            </span>
          )}
          <button onClick={onClose} className="ml-auto btn-secondary text-sm">Cerrar</button>
        </div>
      </div>
    </div>
  );
}

'''

src = src.replace(
    'function MonthView({ year, month, periods }',
    modal_component + 'function MonthView({ year, month, periods }'
)

with open(path, 'w') as f: f.write(src)
print("Payroll.tsx updated with PayslipDetailModal")
