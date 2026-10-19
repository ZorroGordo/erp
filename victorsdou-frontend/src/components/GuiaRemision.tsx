// ── Guía de remisión remitente ───────────────────────────────────────────────
// Modal para generar la guía desde un pedido (Ventas / Facturación) + impresión
// en PDF. Fase A: representación INTERNA, no electrónica (la GRE vía Factpro
// llega en la fase B).
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Printer, Truck, X, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';

export const GUIA_MOTIVOS: { value: string; label: string; code: string }[] = [
  { value: 'VENTA',      label: 'Venta',                                 code: '01' },
  { value: 'COMPRA',     label: 'Compra',                                code: '02' },
  { value: 'TRASLADO',   label: 'Traslado entre establecimientos',      code: '04' },
  { value: 'DEVOLUCION', label: 'Devolución',                            code: '06' },
  { value: 'OTROS',      label: 'Otros',                                 code: '13' },
];

export const GUIA_UNITS: { value: string; label: string }[] = [
  { value: 'NIU', label: 'Unidad' },
  { value: 'KGM', label: 'Kg' },
  { value: 'GRM', label: 'g' },
  { value: 'LTR', label: 'Litro' },
  { value: 'BX',  label: 'Caja' },
  { value: 'PK',  label: 'Paquete' },
  { value: 'BG',  label: 'Bolsa' },
];
const unitLabel = (c?: string) => GUIA_UNITS.find(u => u.value === c)?.label ?? c ?? 'Unidad';

/** Estados del pedido en los que se puede generar la guía desde Ventas. */
export const GUIA_ORDER_STATUSES = ['READY', 'IN_DELIVERY', 'READY_FOR_DISPATCH', 'OUT_FOR_DELIVERY', 'DELIVERED', 'INVOICED', 'COMPLETED'];

export const guiaNumber = (g: { series: string; correlative: string }) => `${g.series}-${String(g.correlative).padStart(8, '0')}`;

// ── Impresión ────────────────────────────────────────────────────────────────
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('es-PE', { timeZone: 'America/Lima' }) : '—';

export function buildGuiaHtml(g: any, company: { ruc?: string; name?: string }): string {
  const motivo = GUIA_MOTIVOS.find(m => m.value === g.guiaMovementType);
  const isPublic = g.guiaTransportMode === '01';
  const rows = (g.lines ?? []).map((l: any, i: number) => `<tr>
      <td style="text-align:center">${i + 1}</td>
      <td>${esc(l.description)}</td>
      <td style="text-align:right">${Number(l.qty).toLocaleString('es-PE')}</td>
      <td style="text-align:center">${esc(unitLabel(l.unitCode))}</td>
    </tr>`).join('');
  const transport = isPublic
    ? `<div><b>Modalidad:</b> 01 — Transporte público</div>
       <div><b>Transportista:</b> ${esc(g.guiaTransportistName ?? '—')}</div>
       <div><b>RUC transportista:</b> ${esc(g.guiaTransportistRuc ?? '—')}</div>
       ${g.guiaTransportistPlate ? `<div><b>Placa:</b> ${esc(g.guiaTransportistPlate)}</div>` : ''}`
    : `<div><b>Modalidad:</b> 02 — Transporte privado</div>
       <div><b>Placa del vehículo:</b> ${esc(g.guiaTransportistPlate ?? '—')}</div>
       <div><b>Conductor:</b> ${esc(g.guiaDriverName ?? '—')}</div>
       <div><b>DNI conductor:</b> ${esc(g.guiaDriverDocNo ?? '—')}</div>
       <div><b>Licencia:</b> ${esc(g.guiaTransportistLicense ?? '—')}</div>`;
  const number = guiaNumber(g);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Guía ${esc(number)}</title>
    <style>
      body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2937;padding:32px;max-width:800px;margin:0 auto}
      h1{font-size:18px;margin:0 0 2px} .muted{color:#6b7280;font-size:12px}
      .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #b45309;padding-bottom:12px;margin-bottom:12px}
      .brand{font-size:22px;font-weight:800;color:#b45309}
      .box{border:1.5px solid #b45309;border-radius:8px;padding:8px 14px;text-align:center}
      .box .t{font-size:11px;font-weight:700;color:#92400e;letter-spacing:.04em}
      .warn{background:#fef2f2;border:1px solid #fca5a5;color:#b91c1c;font-weight:700;font-size:12px;text-align:center;padding:6px;border-radius:6px;margin-bottom:14px;letter-spacing:.03em}
      h2{font-size:11px;text-transform:uppercase;color:#92400e;background:#fdf3e7;padding:5px 8px;margin:14px 0 6px;letter-spacing:.04em}
      .info{display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:12.5px}
      .info b{color:#374151}
      table{width:100%;border-collapse:collapse;margin-top:6px;font-size:12.5px}
      th{background:#fdf3e7;color:#92400e;text-align:left;padding:7px;font-size:11px;text-transform:uppercase}
      td{padding:7px;border-bottom:1px solid #eee}
      .sign{display:flex;gap:48px;margin-top:56px;font-size:12px}
      .sign div{flex:1;border-top:1px solid #6b7280;padding-top:6px;text-align:center}
      @media print{body{padding:16px}}
    </style></head><body>
    <div class="head">
      <div><div class="brand">Victorsdou</div>
        <div class="muted">${esc(company.name ?? g.guiaSenderName ?? '')} · RUC ${esc(company.ruc ?? '')}</div>
        <div class="muted">${esc(g.guiaSenderAddress ?? '')}</div></div>
      <div class="box"><div class="t">GUÍA DE REMISIÓN REMITENTE</div><h1>${esc(number)}</h1>
        ${g.salesOrder?.orderNumber ? `<div class="muted">Pedido ${esc(g.salesOrder.orderNumber)}</div>` : ''}</div>
    </div>
    <div class="warn">REPRESENTACIÓN INTERNA — NO ELECTRÓNICA · SIN VALIDEZ ANTE SUNAT</div>

    <h2>Datos del traslado</h2>
    <div class="info">
      <div><b>Fecha de emisión:</b> ${fmtDate(g.issueDate)}</div>
      <div><b>Inicio del traslado:</b> ${fmtDate(g.guiaStartDate)}</div>
      <div><b>Motivo:</b> ${esc(motivo ? `${motivo.code} — ${motivo.label}` : g.guiaMovementType ?? '')}</div>
      <div><b>Peso bruto total:</b> ${g.guiaGrossWeight != null ? `${Number(g.guiaGrossWeight).toLocaleString('es-PE')} ${g.guiaWeightUnit === 'TNE' ? 't' : 'kg'}` : '—'}</div>
      <div><b>N° de bultos:</b> ${g.guiaPackages ?? '—'}</div>
    </div>

    <h2>Destinatario</h2>
    <div class="info">
      <div><b>Razón social / nombre:</b> ${esc(g.guiaRecipientName || g.entityName)}</div>
      <div><b>RUC / DNI:</b> ${esc(g.entityDocNo || '—')}</div>
    </div>

    <h2>Puntos de partida y llegada</h2>
    <div class="info">
      <div><b>Partida:</b> ${esc(g.guiaSenderAddress ?? '—')}${g.guiaOriginUbigeo ? ` <span class="muted">(ubigeo ${esc(g.guiaOriginUbigeo)})</span>` : ''}</div>
      <div><b>Llegada:</b> ${esc(g.guiaRecipientAddress ?? '—')}${g.guiaDestUbigeo ? ` <span class="muted">(ubigeo ${esc(g.guiaDestUbigeo)})</span>` : ''}</div>
    </div>

    <h2>Transporte</h2>
    <div class="info">${transport}</div>

    <h2>Bienes transportados</h2>
    <table><thead><tr><th style="text-align:center;width:36px">#</th><th>Descripción</th><th style="text-align:right">Cantidad</th><th style="text-align:center">Unidad</th></tr></thead>
      <tbody>${rows}</tbody></table>

    <div class="sign"><div>Remitente</div><div>Conductor</div><div>Recibí conforme (destinatario)</div></div>
    <script>setTimeout(function(){window.focus();window.print();},400);<\/script>
    </body></html>`;
  return html;
}

/** Abre una ventana en blanco YA (dentro del clic, para que el navegador no la bloquee). */
export function openPrintWindow(): Window | null {
  const w = window.open('', '_blank');
  if (!w) { toast.error('Habilita las ventanas emergentes para descargar el PDF'); return null; }
  w.document.write('<p style="font-family:sans-serif;color:#6b7280;padding:32px">Preparando la guía…</p>');
  return w;
}

/** Descarga la guía completa y la imprime (PDF) en la ventana dada o en una nueva. */
export async function printGuiaById(id: string, win?: Window | null) {
  const w = win ?? openPrintWindow();
  if (!w) return;
  try {
    const [g, cfg] = await Promise.all([
      api.get(`/v1/invoices/${id}`).then(r => r.data.data),
      api.get('/v1/invoices/guia-config').then(r => r.data.data).catch(() => ({})),
    ]);
    w.document.open();
    w.document.write(buildGuiaHtml(g, { ruc: cfg.companyRuc, name: cfg.companyName }));
    w.document.close();
  } catch (e: any) {
    w.close();
    toast.error(e?.response?.data?.message ?? 'No se pudo cargar la guía');
  }
}

// ── Modal ────────────────────────────────────────────────────────────────────
interface Item { productId?: string; description: string; qty: number; unitCode: string }

export function GuiaRemisionModal({ orderId, onClose, onCreated }: {
  orderId: string;
  onClose: () => void;
  onCreated?: (guia: any) => void;
}) {
  const qc = useQueryClient();
  const { data: prefill, isLoading, error } = useQuery<any>({
    queryKey: ['guia-prefill', orderId],
    queryFn: () => api.get(`/v1/invoices/guia-remision/prefill/${orderId}`).then(r => r.data.data),
    staleTime: 0,
  });

  const [motivo, setMotivo] = useState('VENTA');
  const [recipientName, setRecipientName] = useState('');
  const [recipientDocNo, setRecipientDocNo] = useState('');
  const [startDate, setStartDate] = useState('');
  const [partida, setPartida] = useState('');
  const [partidaUbigeo, setPartidaUbigeo] = useState('');
  const [llegada, setLlegada] = useState('');
  const [llegadaUbigeo, setLlegadaUbigeo] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [grossWeight, setGrossWeight] = useState('');
  const [packages, setPackages] = useState('');
  const [mode, setMode] = useState<'01' | '02'>('02');
  const [plate, setPlate] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverDocNo, setDriverDocNo] = useState('');
  const [driverLicense, setDriverLicense] = useState('');
  const [carrierRuc, setCarrierRuc] = useState('');
  const [carrierName, setCarrierName] = useState('');
  const [saveDefault, setSaveDefault] = useState(true);

  useEffect(() => {
    if (!prefill) return;
    setRecipientName(prefill.recipient?.name ?? '');
    setRecipientDocNo(prefill.recipient?.docNo ?? '');
    setStartDate(prefill.startDate ?? new Date().toISOString().slice(0, 10));
    setPartida(prefill.partida?.address ?? '');
    setPartidaUbigeo(prefill.partida?.ubigeo ?? '');
    setLlegada(prefill.llegada?.address ?? '');
    setLlegadaUbigeo(prefill.llegada?.ubigeo ?? '');
    setItems((prefill.items ?? []).map((i: any) => ({ productId: i.productId, description: i.description, qty: i.qty, unitCode: i.unitCode ?? 'NIU' })));
    setGrossWeight(prefill.grossWeightKg != null ? String(prefill.grossWeightKg) : '');
    const t = prefill.transport ?? {};
    setMode(t.mode === '01' ? '01' : '02');
    setPlate(t.vehiclePlate ?? ''); setDriverName(t.driverName ?? ''); setDriverDocNo(t.driverDocNo ?? '');
    setDriverLicense(t.driverLicense ?? ''); setCarrierRuc(t.carrierRuc ?? ''); setCarrierName(t.carrierName ?? '');
  }, [prefill]);

  const create = useMutation({
    mutationFn: (_win: Window | null) => api.post('/v1/invoices/guia-remision', {
      salesOrderId: orderId,
      movementType: motivo,
      recipientName, recipientDocNo,
      senderAddress: partida, originUbigeo: partidaUbigeo,
      recipientAddress: llegada, destUbigeo: llegadaUbigeo,
      startDate,
      items: items.filter(i => i.qty > 0),
      grossWeight: grossWeight === '' ? undefined : Number(grossWeight),
      weightUnit: 'KGM',
      packages: packages === '' ? undefined : Number(packages),
      transportMode: mode,
      transportistPlate: plate || undefined,
      transportistLicense: mode === '02' ? (driverLicense || undefined) : undefined,
      driverName: mode === '02' ? (driverName || undefined) : undefined,
      driverDocNo: mode === '02' ? (driverDocNo || undefined) : undefined,
      transportistRuc: mode === '01' ? (carrierRuc || undefined) : undefined,
      transportistName: mode === '01' ? (carrierName || undefined) : undefined,
      saveAsDefault: saveDefault,
    }).then(r => r.data.data),
    onSuccess: (guia, win) => {
      qc.invalidateQueries({ queryKey: ['sales-orders'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['pending-orders'] });
      toast.success(`Guía ${guiaNumber(guia)} generada`);
      printGuiaById(guia.id, win);
      onCreated?.(guia);
      onClose();
    },
    onError: (e: any, win) => { win?.close(); toast.error(e?.response?.data?.message ?? 'Error al generar la guía'); },
  });

  const transportOk = mode === '02'
    ? plate.trim() && driverName.trim() && /^\d{8}$/.test(driverDocNo.trim())
    : /^\d{11}$/.test(carrierRuc.trim()) && carrierName.trim();
  const canSave = !!(recipientName.trim() && partida.trim() && llegada.trim() && startDate
    && items.some(i => i.qty > 0) && transportOk && !create.isPending);

  const existing = prefill?.existingGuia;
  const lbl = 'block text-xs font-medium text-gray-600 mb-1';
  const sec = 'text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900 flex items-center gap-2"><Truck size={18} className="text-purple-600" /> Guía de remisión</h3>
            {prefill?.order && <p className="text-xs text-gray-500 mt-0.5">Pedido {prefill.order.orderNumber}{prefill.order.sucursalName ? ` · ${prefill.order.sucursalName}` : ''}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {isLoading && <div className="text-center text-gray-400 py-8"><Loader2 size={18} className="animate-spin inline mr-2" />Cargando pedido…</div>}
          {error && <p className="text-sm text-red-600">No se pudo cargar el pedido.</p>}

          {existing && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-sm text-purple-800 flex items-center justify-between gap-3">
              <span>Este pedido ya tiene la guía <b className="font-mono">{guiaNumber(existing)}</b>.</span>
              <button onClick={() => printGuiaById(existing.id)} className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700">
                <Printer size={13} /> Ver / imprimir
              </button>
            </div>
          )}

          {prefill && !existing && (
            <>
              <div className="flex items-start gap-2 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3 py-2">
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                <span>Representación interna (no electrónica). Sirve como guía física mientras se habilita la emisión electrónica a SUNAT.</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Motivo de traslado</label>
                  <select className="input" value={motivo} onChange={e => setMotivo(e.target.value)}>
                    {GUIA_MOTIVOS.map(m => <option key={m.value} value={m.value}>{m.code} — {m.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Fecha de inicio del traslado</label>
                  <input type="date" className="input" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
              </div>

              <div>
                <p className={sec}>Destinatario</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2"><label className={lbl}>Razón social / nombre</label>
                    <input className="input" value={recipientName} onChange={e => setRecipientName(e.target.value)} /></div>
                  <div><label className={lbl}>RUC / DNI</label>
                    <input className="input font-mono" value={recipientDocNo} onChange={e => setRecipientDocNo(e.target.value)} /></div>
                </div>
              </div>

              <div>
                <p className={sec}>Puntos de partida y llegada</p>
                <div className="grid grid-cols-4 gap-3">
                  <div className="col-span-3"><label className={lbl}>Punto de partida</label>
                    <input className="input" value={partida} onChange={e => setPartida(e.target.value)} placeholder="Dirección del obrador" /></div>
                  <div><label className={lbl}>Ubigeo</label>
                    <input className="input font-mono" value={partidaUbigeo} maxLength={6} onChange={e => setPartidaUbigeo(e.target.value.replace(/\D/g, ''))} placeholder="150122" /></div>
                  <div className="col-span-3"><label className={lbl}>Punto de llegada</label>
                    <input className="input" value={llegada} onChange={e => setLlegada(e.target.value)} placeholder="Dirección de entrega" /></div>
                  <div><label className={lbl}>Ubigeo</label>
                    <input className="input font-mono" value={llegadaUbigeo} maxLength={6} onChange={e => setLlegadaUbigeo(e.target.value.replace(/\D/g, ''))} placeholder="150131" /></div>
                </div>
              </div>

              <div>
                <p className={sec}>Bienes</p>
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500"><tr>
                      <th className="px-3 py-2 text-left">Producto</th><th className="px-3 py-2 text-right w-24">Cantidad</th><th className="px-3 py-2 w-28">Unidad</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {items.map((it, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1.5 text-gray-800">{it.description}</td>
                          <td className="px-3 py-1.5"><input type="number" min={0} step="any" className="input text-right py-1" value={it.qty}
                            onChange={e => setItems(xs => xs.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) || 0 } : x))} /></td>
                          <td className="px-3 py-1.5"><select className="input py-1" value={it.unitCode}
                            onChange={e => setItems(xs => xs.map((x, j) => j === i ? { ...x, unitCode: e.target.value } : x))}>
                            {GUIA_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                          </select></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div><label className={lbl}>Peso bruto total (kg)</label>
                    <input type="number" min={0} step="any" className="input" value={grossWeight} onChange={e => setGrossWeight(e.target.value)} />
                    {!prefill.allWeightsKnown && <p className="text-[11px] text-amber-600 mt-1">{prefill.grossWeightKg != null ? 'Algunos productos no tienen peso cargado: revisa el total.' : 'Los productos no tienen peso cargado: ingrésalo a mano.'}</p>}
                  </div>
                  <div><label className={lbl}>N° de bultos</label>
                    <input type="number" min={0} step={1} className="input" value={packages} onChange={e => setPackages(e.target.value)} /></div>
                </div>
              </div>

              <div>
                <p className={sec}>Transporte</p>
                <div className="flex gap-2 mb-3">
                  {([['02', 'Privado (vehículo propio)'], ['01', 'Público (transportista)']] as const).map(([v, l]) => (
                    <button key={v} type="button" onClick={() => setMode(v)}
                      className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium border transition-all ${mode === v ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{l}</button>
                  ))}
                </div>
                {mode === '02' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className={lbl}>Placa del vehículo *</label><input className="input font-mono uppercase" value={plate} onChange={e => setPlate(e.target.value.toUpperCase())} placeholder="ABC-123" /></div>
                    <div><label className={lbl}>Licencia de conducir</label><input className="input font-mono uppercase" value={driverLicense} onChange={e => setDriverLicense(e.target.value.toUpperCase())} /></div>
                    <div><label className={lbl}>Conductor (nombre) *</label><input className="input" value={driverName} onChange={e => setDriverName(e.target.value)} /></div>
                    <div><label className={lbl}>DNI del conductor *</label><input className="input font-mono" maxLength={8} value={driverDocNo} onChange={e => setDriverDocNo(e.target.value.replace(/\D/g, ''))} /></div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className={lbl}>RUC del transportista *</label><input className="input font-mono" maxLength={11} value={carrierRuc} onChange={e => setCarrierRuc(e.target.value.replace(/\D/g, ''))} /></div>
                    <div><label className={lbl}>Razón social *</label><input className="input" value={carrierName} onChange={e => setCarrierName(e.target.value)} /></div>
                    <div><label className={lbl}>Placa (opcional)</label><input className="input font-mono uppercase" value={plate} onChange={e => setPlate(e.target.value.toUpperCase())} /></div>
                  </div>
                )}
                <label className="flex items-center gap-2 mt-3 text-xs text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={saveDefault} onChange={e => setSaveDefault(e.target.checked)} className="rounded border-gray-300" />
                  Recordar punto de partida, vehículo y conductor para la próxima guía
                </label>
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-2 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2.5 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200">Cerrar</button>
          {prefill && !existing && (
            <button onClick={() => create.mutate(openPrintWindow())} disabled={!canSave}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 disabled:opacity-50">
              {create.isPending ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
              Generar guía e imprimir
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
