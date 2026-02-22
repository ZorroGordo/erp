#!/usr/bin/env python3
"""
Dashboard improvements:
1. Date filter: clickable year/month dropdowns instead of just left/right arrows
2. Always-visible "+ Agregar widget" button (not gated behind edit mode)
3. Move hidden cards panel to always-accessible when widgets exist to add
"""
path = '/Users/victordyrnes/Desktop/victorsdou ERP/victorsdou-frontend/src/pages/Dashboard.tsx'
with open(path) as f:
    src = f.read()

# ── 1. Add useState for date picker open state ──────────────────────────────
OLD_STATES = """  const [month, setMonth]               = useState(currentMonthStr);
  const [customerType, setCustomerType] = useState<'all' | 'B2B' | 'B2C'>('all');
  const isCurrent = month === currentMonthStr();"""

NEW_STATES = """  const [month, setMonth]               = useState(currentMonthStr);
  const [customerType, setCustomerType] = useState<'all' | 'B2B' | 'B2C'>('all');
  const isCurrent = month === currentMonthStr();
  const [datePickerOpen, setDatePickerOpen] = useState(false);"""

src = src.replace(OLD_STATES, NEW_STATES)

# ── 2. Replace the date nav with a clickable year/month picker ──────────────
OLD_DATE_NAV = """          <div className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-lg px-1.5 py-1 shadow-sm">
            <button onClick={() => setMonth(m => shiftMonth(m, -1))} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors" aria-label="Mes anterior">
              <ChevronLeft size={15} />
            </button>
            <span className="text-sm font-medium text-gray-700 capitalize px-1 min-w-[136px] text-center select-none">{monthLabel(month)}</span>
            <button onClick={() => !isCurrent && setMonth(m => shiftMonth(m, 1))} disabled={isCurrent}
              className={`p-1 rounded transition-colors ${isCurrent ? 'text-gray-200 cursor-default' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-700'}`} aria-label="Mes siguiente">
              <ChevronRight size={15} />
            </button>
          </div>"""

NEW_DATE_NAV = """          <div className="relative">
            <div className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-lg px-1.5 py-1 shadow-sm">
              <button onClick={() => setMonth(m => shiftMonth(m, -1))} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors" aria-label="Mes anterior">
                <ChevronLeft size={15} />
              </button>
              <button
                onClick={() => setDatePickerOpen(v => !v)}
                className="text-sm font-medium text-gray-700 capitalize px-2 min-w-[136px] text-center hover:bg-gray-50 rounded py-0.5 transition-colors"
              >
                {monthLabel(month)}
              </button>
              <button onClick={() => !isCurrent && setMonth(m => shiftMonth(m, 1))} disabled={isCurrent}
                className={`p-1 rounded transition-colors ${isCurrent ? 'text-gray-200 cursor-default' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-700'}`} aria-label="Mes siguiente">
                <ChevronRight size={15} />
              </button>
            </div>
            {datePickerOpen && (() => {
              const [selY, selMo] = month.split('-').map(Number);
              const nowY = new Date().getFullYear();
              const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
              return (
                <div className="absolute top-full mt-1 right-0 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-64" onMouseDown={e => e.stopPropagation()}>
                  {/* Year row */}
                  <div className="flex items-center justify-between mb-2">
                    <button onClick={() => { const ny = selY - 1; setMonth(`${ny}-${String(selMo).padStart(2,'0')}`); }} className="p-1 rounded hover:bg-gray-100 text-gray-500"><ChevronLeft size={14}/></button>
                    <span className="text-sm font-semibold text-gray-800">{selY}</span>
                    <button onClick={() => { if (selY < nowY) { const ny = selY + 1; setMonth(`${ny}-${String(selMo).padStart(2,'0')}`); }}} disabled={selY >= nowY} className="p-1 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-30"><ChevronRight size={14}/></button>
                  </div>
                  {/* Month grid */}
                  <div className="grid grid-cols-4 gap-1">
                    {MONTHS_ES.map((lbl, idx) => {
                      const mo = idx + 1;
                      const isFuture = selY === nowY && mo > new Date().getMonth() + 1;
                      const isSelected = selY === selY && mo === selMo;
                      return (
                        <button key={mo} disabled={isFuture}
                          onClick={() => { setMonth(`${selY}-${String(mo).padStart(2,'0')}`); setDatePickerOpen(false); }}
                          className={`py-1.5 rounded-lg text-xs font-medium transition-colors ${isSelected ? 'bg-brand-600 text-white' : isFuture ? 'text-gray-200 cursor-default' : 'hover:bg-brand-50 text-gray-600 hover:text-brand-700'}`}>
                          {lbl}
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={() => { setMonth(currentMonthStr()); setDatePickerOpen(false); }} className="w-full mt-2 text-xs text-brand-600 hover:text-brand-800 font-medium py-1 hover:bg-brand-50 rounded-lg transition-colors">
                    Hoy
                  </button>
                </div>
              );
            })()}
          </div>"""

src = src.replace(OLD_DATE_NAV, NEW_DATE_NAV)

# ── 3. Add always-visible "+ Agregar" button + click outside to close picker ──
# Wrap the whole dashboard in a div that closes the date picker on outside click
# Already handled by the button toggle; just add click-away via useEffect

# ── 4. Make "Agregar widget" always visible in header (not just edit mode) ──
# Currently: edit mode button says "Personalizar"/"Listo"
# Add a dedicated "+" button next to it that shows the hidden cards panel
OLD_PERSONALIZAR = """          <button onClick={() => setEditMode(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all shadow-sm ${editMode ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300 hover:text-brand-600'}`}>
            <LayoutGrid size={13} />
            {editMode ? 'Listo' : 'Personalizar'}
          </button>"""

NEW_PERSONALIZAR = """          {hiddenCards.length > 0 && !editMode && (
            <button onClick={() => setEditMode(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border bg-white text-brand-600 border-brand-200 hover:bg-brand-50 hover:border-brand-400 transition-all shadow-sm">
              <Plus size={13} /> Agregar widget
            </button>
          )}
          <button onClick={() => setEditMode(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all shadow-sm ${editMode ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300 hover:text-brand-600'}`}>
            <LayoutGrid size={13} />
            {editMode ? 'Listo' : 'Personalizar'}
          </button>"""

src = src.replace(OLD_PERSONALIZAR, NEW_PERSONALIZAR)

# ── 5. Close date picker on outside click ──────────────────────────────────
# Wrap the return in a div that closes on click
OLD_RETURN_OPEN = """  return (
    <div className="space-y-6">
      {/* Header */}"""

NEW_RETURN_OPEN = """  // Close date picker when clicking outside
  const handleOutsideClick = () => { if (datePickerOpen) setDatePickerOpen(false); };

  return (
    <div className="space-y-6" onClick={handleOutsideClick}>
      {/* Header */}"""

src = src.replace(OLD_RETURN_OPEN, NEW_RETURN_OPEN)

with open(path, 'w') as f:
    f.write(src)

print("Dashboard controls updated")
