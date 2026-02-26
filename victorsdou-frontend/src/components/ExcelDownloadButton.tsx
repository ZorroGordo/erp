import { useState } from 'react';
import { Download, X, FileSpreadsheet, Calendar, Filter } from 'lucide-react';
import * as XLSX from 'xlsx';

export interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
  format?: (val: any, row: any) => string | number | null;
}

export interface ExcelFilterDef {
  key: string;
  label: string;
  type: 'select' | 'text';
  options?: { value: string; label: string }[];
}

export interface ExcelDownloadButtonProps {
  filename: string;
  sheetName?: string;
  columns: ExcelColumn[];
  data: any[];
  dateField?: string;
  dateLabel?: string;
  extraFilters?: ExcelFilterDef[];
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((acc: any, key: string) => acc?.[key], obj);
}

function applyFilters(
  data: any[],
  dateField: string | undefined,
  dateFrom: string,
  dateTo: string,
  extras: Record<string, string>,
  extraFilters: ExcelFilterDef[],
): any[] {
  return data.filter(row => {
    if (dateField && (dateFrom || dateTo)) {
      const rawVal = getNestedValue(row, dateField);
      if (rawVal) {
        const d = new Date(rawVal);
        if (dateFrom && d < new Date(dateFrom)) return false;
        if (dateTo) {
          const end = new Date(dateTo);
          end.setHours(23, 59, 59, 999);
          if (d > end) return false;
        }
      }
    }
    for (const f of extraFilters) {
      const val = extras[f.key];
      if (!val) continue;
      const rowVal = String(getNestedValue(row, f.key) ?? '').toLowerCase();
      if (f.type === 'select') {
        if (rowVal !== val.toLowerCase()) return false;
      } else {
        if (!rowVal.includes(val.toLowerCase())) return false;
      }
    }
    return true;
  });
}

export function ExcelDownloadButton({
  filename,
  sheetName = 'Datos',
  columns,
  data,
  dateField,
  dateLabel = 'Rango de fechas',
  extraFilters = [],
}: ExcelDownloadButtonProps) {
  const [open, setOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [extras, setExtras] = useState<Record<string, string>>({});

  function resetFilters() {
    setDateFrom('');
    setDateTo('');
    setExtras({});
  }

  function handleClose() {
    setOpen(false);
    resetFilters();
  }

  function handleDownload() {
    const filtered = applyFilters(data, dateField, dateFrom, dateTo, extras, extraFilters);
    const rows = filtered.map(row => {
      const out: Record<string, any> = {};
      for (const col of columns) {
        const raw = getNestedValue(row, col.key);
        out[col.header] = col.format ? col.format(raw, row) : (raw ?? '');
      }
      return out;
    });

    const ws = XLSX.utils.json_to_sheet(rows, { header: columns.map(c => c.header) });
    ws['!cols'] = columns.map(c => ({ wch: c.width ?? 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    const meta = XLSX.utils.aoa_to_sheet([
      ['Exportado el', new Date().toLocaleString('es-PE')],
      ['Total registros', filtered.length],
      ...(dateFrom ? [['Desde', dateFrom]] : []),
      ...(dateTo   ? [['Hasta', dateTo]]   : []),
    ]);
    XLSX.utils.book_append_sheet(wb, meta, 'Info');
    XLSX.writeFile(wb, filename + '.xlsx');
    handleClose();
  }

  const activeFilterCount =
    (dateFrom ? 1 : 0) + (dateTo ? 1 : 0) +
    Object.values(extras).filter(Boolean).length;

  const previewCount = applyFilters(data, dateField, dateFrom, dateTo, extras, extraFilters).length;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors"
        title="Descargar como Excel"
      >
        <FileSpreadsheet size={15} />
        <span className="hidden sm:inline">Excel</span>
        {activeFilterCount > 0 && (
          <span className="bg-white text-emerald-700 text-xs font-bold rounded-full px-1.5 py-0.5 leading-none">
            {activeFilterCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-emerald-100 rounded-lg">
                  <Download size={16} className="text-emerald-700" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 text-sm">Exportar a Excel</h3>
                  <p className="text-xs text-gray-500">{data.length} registros disponibles</p>
                </div>
              </div>
              <button onClick={handleClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                <X size={16} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {dateField && (
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-2">
                    <Calendar size={13} />
                    {dateLabel}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Desde</label>
                      <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full input text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Hasta</label>
                      <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full input text-sm" />
                    </div>
                  </div>
                </div>
              )}

              {extraFilters.length > 0 && (
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-2">
                    <Filter size={13} />
                    Filtros adicionales
                  </label>
                  <div className="space-y-2">
                    {extraFilters.map(f => (
                      <div key={f.key}>
                        <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
                        {f.type === 'select' && f.options ? (
                          <select
                            value={extras[f.key] ?? ''}
                            onChange={e => setExtras(prev => ({ ...prev, [f.key]: e.target.value }))}
                            className="w-full input text-sm"
                          >
                            <option value="">Todos</option>
                            {f.options.map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={extras[f.key] ?? ''}
                            onChange={e => setExtras(prev => ({ ...prev, [f.key]: e.target.value }))}
                            placeholder={'Filtrar por ' + f.label.toLowerCase() + '...'}
                            className="w-full input text-sm"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-gray-50 rounded-xl px-3 py-2 text-xs text-gray-600">
                <span className="font-semibold text-gray-900">{previewCount}</span>{' '}
                registros se exportaran con los filtros actuales.
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-gray-100">
              <button onClick={resetFilters} className="text-xs text-gray-500 hover:text-gray-700 underline">
                Limpiar filtros
              </button>
              <div className="flex gap-2">
                <button onClick={handleClose} className="btn-secondary text-sm px-4 py-2">
                  Cancelar
                </button>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors"
                >
                  <Download size={14} />
                  Descargar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
