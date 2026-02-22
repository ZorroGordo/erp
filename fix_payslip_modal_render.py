#!/usr/bin/env python3
"""
Fix 1: Mount PayslipDetailModal inside MonthView (it was defined but never rendered).
Fix 2: Add "Revertir a borrador" button for CONFIRMED status in the modal footer.
Fix 3: Refresh selectedPayslip data after save/confirm/pay so modal reflects new state.
"""
import re

path = '/Users/victordyrnes/Desktop/victorsdou ERP/victorsdou-frontend/src/pages/Payroll.tsx'
with open(path) as f:
    src = f.read()

# ── Fix 1: Add unconfirm mutation + PayslipDetailModal render inside MonthView ──────
# Find the closing of MonthView — right before `return (` inside MonthView
# We need to:
#   a) Add unconfirm mutation
#   b) Add PayslipDetailModal render at the end of MonthView JSX

OLD_CONFIRM_MUT = """  const confirm = useMutation({
    mutationFn: (id: string) => api.post("/v1/payroll/payslips/" + id + "/confirm", {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payslips", period?.id] }); toast.success("Boleta confirmada"); },
    onError:   (e: any) => toast.error(e.response?.data?.message ?? "Error"),
  });"""

NEW_CONFIRM_MUT = """  const confirm = useMutation({
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
  });"""

src = src.replace(OLD_CONFIRM_MUT, NEW_CONFIRM_MUT)

# ── Fix 2: After setSelectedPayslip is called on row click, the modal must be rendered.
# Find the closing </div> of MonthView's return — add modal render before closing

OLD_MONTHVIEW_CLOSE = """  );
}

function MonthView"""

# This pattern doesn't exist; let's find the actual end of MonthView return
# MonthView ends with:  );
# followed by a blank line and then export default function Payroll
OLD_MONTHVIEW_END = """  );
}

export default function Payroll"""

NEW_MONTHVIEW_END = """      {selectedPayslip && (
        <PayslipDetailModal
          ps={selectedPayslip}
          period={{ year, month }}
          onClose={() => setSelectedPayslip(null)}
          onConfirm={() => confirm.mutate(selectedPayslip.id)}
          onUnconfirm={() => unconfirm.mutate(selectedPayslip.id)}
          onPay={() => pay.mutate(selectedPayslip.id)}
          onRecalculated={() => {
            qc.invalidateQueries({ queryKey: ["payslips", period?.id] });
            setSelectedPayslip(null);
          }}
        />
      )}
    </div>
  );
}

export default function Payroll"""

src = src.replace(OLD_MONTHVIEW_END, NEW_MONTHVIEW_END)

# ── Fix 3: Add onUnconfirm prop to PayslipDetailModal ───────────────────────
OLD_MODAL_PROPS = """function PayslipDetailModal({
  ps, period, onClose, onConfirm, onPay, onRecalculated,
}: {
  ps: any; period: any;
  onClose: () => void; onConfirm: () => void; onPay: () => void; onRecalculated: () => void;
}) {"""

NEW_MODAL_PROPS = """function PayslipDetailModal({
  ps, period, onClose, onConfirm, onUnconfirm, onPay, onRecalculated,
}: {
  ps: any; period: any;
  onClose: () => void; onConfirm: () => void; onUnconfirm: () => void; onPay: () => void; onRecalculated: () => void;
}) {"""

src = src.replace(OLD_MODAL_PROPS, NEW_MODAL_PROPS)

# ── Fix 4: Add RotateCcw to lucide imports ───────────────────────────────────
OLD_IMPORTS = """import {
  Plus, UserCheck, Edit2, Clock, Calendar, ChevronLeft, ChevronRight,
  CheckCircle, DollarSign, Mail, X, AlertCircle, RefreshCw, Star, Pencil, Trash2, Save, Check
} from "lucide-react";"""

NEW_IMPORTS = """import {
  Plus, UserCheck, Edit2, Clock, Calendar, ChevronLeft, ChevronRight,
  CheckCircle, DollarSign, Mail, X, AlertCircle, RefreshCw, Star, Pencil, Trash2, Save, Check,
  RotateCcw
} from "lucide-react";"""

src = src.replace(OLD_IMPORTS, NEW_IMPORTS)

# ── Fix 5: Add "Revertir a borrador" button in modal footer for CONFIRMED status ──
OLD_FOOTER = """          {ps.status === "CONFIRMED" && (
            <button onClick={onPay} className="btn-secondary flex items-center gap-1.5 text-sm text-green-600 border-green-200 hover:bg-green-50">
              <DollarSign size={14} /> Pagar{ps.employee?.email && <Mail size={12} />}
            </button>
          )}"""

NEW_FOOTER = """          {ps.status === "CONFIRMED" && (<>
            <button onClick={onUnconfirm} className="btn-secondary flex items-center gap-1.5 text-sm text-amber-600 border-amber-200 hover:bg-amber-50">
              <RotateCcw size={14} /> Revertir a borrador
            </button>
            <button onClick={onPay} className="btn-secondary flex items-center gap-1.5 text-sm text-green-600 border-green-200 hover:bg-green-50">
              <DollarSign size={14} /> Pagar{ps.employee?.email && <Mail size={12} />}
            </button>
          </>)}"""

src = src.replace(OLD_FOOTER, NEW_FOOTER)

# ── Fix 6: Allow editing on CONFIRMED boletas too (show adjustments section) ──
# Already works: !isPaid covers DRAFT and CONFIRMED. Keep as is.

# ── Fix 7: After saveAndRecalc success, close and reopen with fresh data ──
# The current onRecalculated closes the modal; that's fine.

with open(path, 'w') as f:
    f.write(src)

print("Payroll.tsx modal render + unconfirm button added")
