import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import {
  Plus, Users, Search, Building2, User, X, Loader2, AlertCircle,
  ChevronDown, ChevronRight, MapPin, Phone, Mail, Clock, Package,
  Edit2, Trash2, Store, CheckSquare, Square,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ── Types ──────────────────────────────────────────────────────────────────────
type DocType = 'DNI' | 'RUC' | 'CE' | 'PASAPORTE';
type CustomerType = 'B2B' | 'B2C';
type CustomerCategory = 'SUPERMERCADO' | 'TIENDA_NATURISTA' | 'CAFETERIA' | 'RESTAURANTE' | 'HOTEL' | 'EMPRESA' | 'OTROS';

const CATEGORY_LABELS: Record<CustomerCategory, string> = {
  SUPERMERCADO:    'Supermercado',
  TIENDA_NATURISTA:'Tienda Naturista',
  CAFETERIA:       'Cafetería',
  RESTAURANTE:     'Restaurante',
  HOTEL:           'Hotel',
  EMPRESA:         'Empresa',
  OTROS:           'Otros',
};
const CATEGORY_COLORS: Record<CustomerCategory, string> = {
  SUPERMERCADO:    'bg-sky-100 text-sky-700',
  TIENDA_NATURISTA:'bg-green-100 text-green-700',
  CAFETERIA:       'bg-amber-100 text-amber-700',
  RESTAURANTE:     'bg-orange-100 text-orange-700',
  HOTEL:           'bg-violet-100 text-violet-700',
  EMPRESA:         'bg-slate-100 text-slate-700',
  OTROS:           'bg-gray-100 text-gray-600',
};

const DAY_LABELS: Record<string, string> = {
  MON: 'Lun', TUE: 'Mar', WED: 'Mié', THU: 'Jue',
  FRI: 'Vie', SAT: 'Sáb', SUN: 'Dom',
};
const ALL_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const FREQ_LABELS: Record<string, string> = {
  WEEKLY: 'Semanal', BIWEEKLY: 'Quincenal', MONTHLY: 'Mensual', CUSTOM: 'Personalizado',
};

// ── Address sub-form fields (reused for main + delivery) ──────────────────────
interface AddressFields {
  addressLine1: string;
  addressLine2: string; // ofc/dpto/piso
  district:     string;
  city:         string; // = province
}
const EMPTY_ADDRESS: AddressFields = { addressLine1: '', addressLine2: '', district: '', city: '' };

interface FormState {
  type:               CustomerType;
  category:           CustomerCategory | '';
  docType:            DocType;
  docNumber:          string;
  displayName:        string;
  email:              string;
  phone:              string;
  notes:              string;
  // Main address
  address:            AddressFields;
  // Delivery address
  deliverySameAsMain: boolean;
  deliveryAddress:    AddressFields;
}
const EMPTY_FORM: FormState = {
  type: 'B2B', category: '', docType: 'RUC',
  docNumber: '', displayName: '', email: '', phone: '', notes: '',
  address: EMPTY_ADDRESS,
  deliverySameAsMain: true,
  deliveryAddress: EMPTY_ADDRESS,
};

interface SucursalForm {
  name:              string;
  contactName:       string;
  contactPhone:      string;
  contactEmail:      string;
  addressLine1:      string;
  addressLine2:      string;
  district:          string;
  province:          string;
  department:        string;
  deliveryFrequency: string;
  deliveryDays:      string[];
  deliveryUnitsQty:  string;
  deliveryHour:      string;
  deliveryNotes:     string;
  notes:             string;
}
const EMPTY_SUCURSAL: SucursalForm = {
  name: '', contactName: '', contactPhone: '', contactEmail: '',
  addressLine1: '', addressLine2: '', district: '', province: 'Lima', department: 'Lima',
  deliveryFrequency: '', deliveryDays: [], deliveryUnitsQty: '', deliveryHour: '', deliveryNotes: '', notes: '',
};

type LookupStatus = 'idle' | 'loading' | 'found' | 'error';

// ── Reusable address block ─────────────────────────────────────────────────────
function AddressBlock({
  value, onChange, label = 'Dirección',
}: {
  value: AddressFields;
  onChange: (a: AddressFields) => void;
  label?: string;
}) {
  function set(k: keyof AddressFields, v: string) {
    onChange({ ...value, [k]: v });
  }
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          {label} <span className="text-red-500">*</span>
        </label>
        <input
          className="input"
          placeholder="Av. Larco 123"
          value={value.addressLine1}
          onChange={e => set('addressLine1', e.target.value)}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Ofc. / Dpto. / Piso</label>
        <input
          className="input"
          placeholder="Piso 3, Of. 301"
          value={value.addressLine2}
          onChange={e => set('addressLine2', e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Distrito <span className="text-red-500">*</span></label>
          <input
            className="input"
            placeholder="Miraflores"
            value={value.district}
            onChange={e => set('district', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Ciudad</label>
          <input
            className="input"
            placeholder="Lima"
            value={value.city}
            onChange={e => set('city', e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

// ── SucursalModal ──────────────────────────────────────────────────────────────
function SucursalModal({
  customerId, sucursal, onClose,
}: {
  customerId: string;
  sucursal?: any;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<SucursalForm>(sucursal ? {
    name:              sucursal.name ?? '',
    contactName:       sucursal.contactName ?? '',
    contactPhone:      sucursal.contactPhone ?? '',
    contactEmail:      sucursal.contactEmail ?? '',
    addressLine1:      sucursal.addressLine1 ?? '',
    addressLine2:      sucursal.addressLine2 ?? '',
    district:          sucursal.district ?? '',
    province:          sucursal.province ?? 'Lima',
    department:        sucursal.department ?? 'Lima',
    deliveryFrequency: sucursal.deliveryFrequency ?? '',
    deliveryDays:      sucursal.deliveryDays ?? [],
    deliveryUnitsQty:  sucursal.deliveryUnitsQty != null ? String(sucursal.deliveryUnitsQty) : '',
    deliveryHour:      sucursal.deliveryHour ?? '',
    deliveryNotes:     sucursal.deliveryNotes ?? '',
    notes:             sucursal.notes ?? '',
  } : EMPTY_SUCURSAL);

  const isEdit = !!sucursal;

  const save = useMutation({
    mutationFn: (data: any) => isEdit
      ? api.patch(`/v1/customers/${customerId}/sucursales/${sucursal.id}`, data)
      : api.post(`/v1/customers/${customerId}/sucursales`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success(isEdit ? 'Sucursal actualizada' : 'Sucursal agregada');
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Error'),
  });

  function toggleDay(d: string) {
    setForm(f => ({
      ...f,
      deliveryDays: f.deliveryDays.includes(d)
        ? f.deliveryDays.filter(x => x !== d)
        : [...f.deliveryDays, d],
    }));
  }

  function handleSave() {
    if (!form.name.trim())         return toast.error('Nombre requerido');
    if (!form.addressLine1.trim()) return toast.error('Dirección requerida');
    if (!form.district.trim())     return toast.error('Distrito requerido');
    save.mutate({
      ...form,
      deliveryUnitsQty: form.deliveryUnitsQty ? Number(form.deliveryUnitsQty) : null,
      deliveryFrequency: form.deliveryFrequency || null,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">
            {isEdit ? 'Editar sucursal' : 'Nueva sucursal'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre de la sucursal <span className="text-red-500">*</span></label>
            <input className="input" placeholder="Ej: Wong Miraflores" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>

          {/* Contact */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Punto de contacto</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre</label>
                <input className="input" placeholder="Juan Pérez" value={form.contactName}
                  onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono</label>
                <input className="input" placeholder="+51 9xx xxx xxx" value={form.contactPhone}
                  onChange={e => setForm(f => ({ ...f, contactPhone: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input className="input" type="email" placeholder="compras@tienda.com" value={form.contactEmail}
                  onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* Address */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Dirección</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Dirección <span className="text-red-500">*</span></label>
                <input className="input" placeholder="Av. Larco 123" value={form.addressLine1}
                  onChange={e => setForm(f => ({ ...f, addressLine1: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Ofc. / Dpto. / Piso</label>
                <input className="input" placeholder="Piso 2, Ref: al lado del banco" value={form.addressLine2}
                  onChange={e => setForm(f => ({ ...f, addressLine2: e.target.value }))} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Distrito <span className="text-red-500">*</span></label>
                  <input className="input" placeholder="Miraflores" value={form.district}
                    onChange={e => setForm(f => ({ ...f, district: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Provincia</label>
                  <input className="input" placeholder="Lima" value={form.province}
                    onChange={e => setForm(f => ({ ...f, province: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Departamento</label>
                  <input className="input" placeholder="Lima" value={form.department}
                    onChange={e => setForm(f => ({ ...f, department: e.target.value }))} />
                </div>
              </div>
            </div>
          </div>

          {/* Delivery terms */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Condiciones de entrega</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Frecuencia</label>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(FREQ_LABELS).map(([k, v]) => (
                    <button key={k} type="button"
                      onClick={() => setForm(f => ({ ...f, deliveryFrequency: f.deliveryFrequency === k ? '' : k }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        form.deliveryFrequency === k
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-brand-300'
                      }`}
                    >{v}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Días de entrega</label>
                <div className="flex gap-1.5">
                  {ALL_DAYS.map(d => (
                    <button key={d} type="button" onClick={() => toggleDay(d)}
                      className={`w-9 h-9 rounded-lg text-xs font-medium border transition-all ${
                        form.deliveryDays.includes(d)
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-brand-300'
                      }`}
                    >{DAY_LABELS[d]}</button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Unidades por entrega</label>
                  <input className="input" type="number" placeholder="Ej: 50" value={form.deliveryUnitsQty}
                    onChange={e => setForm(f => ({ ...f, deliveryUnitsQty: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Hora preferida</label>
                  <input className="input" type="time" value={form.deliveryHour}
                    onChange={e => setForm(f => ({ ...f, deliveryHour: e.target.value }))} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Instrucciones de entrega</label>
                <textarea className="input resize-none" rows={2} placeholder="Entrar por el muelle trasero, preguntar por Juan..."
                  value={form.deliveryNotes}
                  onChange={e => setForm(f => ({ ...f, deliveryNotes: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* Internal notes */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notas internas</label>
            <textarea className="input resize-none" rows={2} value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>

        <div className="flex gap-2 px-6 py-4 border-t border-gray-100">
          <button className="btn-primary disabled:opacity-50" disabled={save.isPending} onClick={handleSave}>
            {save.isPending ? <span className="flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Guardando...</span> : isEdit ? 'Guardar cambios' : 'Agregar sucursal'}
          </button>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ── SucursalCard ───────────────────────────────────────────────────────────────
function SucursalCard({
  s, customerId, onEdit,
}: {
  s: any;
  customerId: string;
  onEdit: (s: any) => void;
}) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: () => api.delete(`/v1/customers/${customerId}/sucursales/${s.id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); toast.success('Sucursal desactivada'); },
    onError: () => toast.error('Error'),
  });

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Store size={14} className="text-brand-500 shrink-0 mt-0.5" />
          <span className="font-medium text-gray-900 text-sm">{s.name}</span>
          {!s.isActive && <span className="badge bg-gray-100 text-gray-400 text-xs">Inactiva</span>}
        </div>
        <div className="flex gap-1">
          <button onClick={() => onEdit(s)} className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors">
            <Edit2 size={13} />
          </button>
          <button onClick={() => del.mutate()} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-gray-600">
        <div className="col-span-2 flex items-start gap-1.5">
          <MapPin size={11} className="text-gray-400 mt-0.5 shrink-0" />
          <span>{s.addressLine1}{s.addressLine2 ? `, ${s.addressLine2}` : ''} — {s.district}, {s.province}</span>
        </div>
        {s.contactName && (
          <div className="flex items-center gap-1.5">
            <User size={11} className="text-gray-400 shrink-0" />
            <span>{s.contactName}</span>
          </div>
        )}
        {s.contactPhone && (
          <div className="flex items-center gap-1.5">
            <Phone size={11} className="text-gray-400 shrink-0" />
            <span>{s.contactPhone}</span>
          </div>
        )}
        {s.contactEmail && (
          <div className="col-span-2 flex items-center gap-1.5">
            <Mail size={11} className="text-gray-400 shrink-0" />
            <span>{s.contactEmail}</span>
          </div>
        )}
      </div>

      {(s.deliveryDays?.length > 0 || s.deliveryFrequency || s.deliveryHour || s.deliveryUnitsQty) && (
        <div className="border-t border-gray-200 pt-2.5 space-y-1.5">
          <p className="text-xs font-medium text-gray-500">Entrega</p>
          <div className="flex flex-wrap items-center gap-2">
            {s.deliveryFrequency && (
              <span className="badge bg-blue-50 text-blue-600 text-xs">{FREQ_LABELS[s.deliveryFrequency] ?? s.deliveryFrequency}</span>
            )}
            {s.deliveryDays?.length > 0 && (
              <div className="flex gap-1">
                {s.deliveryDays.map((d: string) => (
                  <span key={d} className="inline-flex items-center px-1.5 py-0.5 rounded bg-brand-100 text-brand-700 text-xs font-medium">
                    {DAY_LABELS[d] ?? d}
                  </span>
                ))}
              </div>
            )}
            {s.deliveryHour && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Clock size={10} /> {s.deliveryHour}
              </span>
            )}
            {s.deliveryUnitsQty && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Package size={10} /> {s.deliveryUnitsQty} und.
              </span>
            )}
          </div>
          {s.deliveryNotes && (
            <p className="text-xs text-gray-400 italic">{s.deliveryNotes}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function Customers() {
  const qc = useQueryClient();
  const [showForm, setShowForm]           = useState(false);
  const [form, setForm]                   = useState<FormState>(EMPTY_FORM);
  const [lookupStatus, setLookupStatus]   = useState<LookupStatus>('idle');
  const [lookupError, setLookupError]     = useState('');
  const [expandedId, setExpandedId]       = useState<string | null>(null);
  const [sucursalModal, setSucursalModal] = useState<{ customerId: string; sucursal?: any } | null>(null);
  const [searchText, setSearchText]       = useState('');
  const [typeFilter, setTypeFilter]       = useState<'B2B' | 'B2C' | ''>('');

  const { data, isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.get('/v1/customers/').then(r => r.data),
  });

  const allCustomers: any[] = data?.data ?? [];
  const filtered = allCustomers.filter((c: any) => {
    if (typeFilter && c.type !== typeFilter) return false;
    if (searchText) {
      const q = searchText.toLowerCase();
      const matchName = (c.displayName ?? '').toLowerCase().includes(q);
      const matchDoc  = (c.docNumber  ?? '').toLowerCase().includes(q);
      if (!matchName && !matchDoc) return false;
    }
    return true;
  });

  const create = useMutation({
    mutationFn: (body: any) => api.post('/v1/customers/', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); toast.success('Cliente creado'); closeForm(); },
    onError: (e: any) => toast.error(e.response?.data?.message ?? e.response?.data?.error ?? 'Error al crear cliente'),
  });

  function closeForm() {
    setShowForm(false);
    setForm(EMPTY_FORM);
    setLookupStatus('idle');
    setLookupError('');
  }
  function handleTypeChange(t: CustomerType) {
    setForm({ ...EMPTY_FORM, type: t, category: '', docType: t === 'B2B' ? 'RUC' : 'DNI' });
    setLookupStatus('idle');
    setLookupError('');
  }
  function handleDocTypeChange(dt: DocType) {
    setForm(f => ({ ...f, docType: dt, docNumber: '' }));
    setLookupStatus('idle');
    setLookupError('');
  }

  async function runLookup() {
    const n = form.docNumber.trim();
    if (!n) return;
    setLookupStatus('loading');
    setLookupError('');
    try {
      if (form.docType === 'RUC') {
        const r = await api.get(`/v1/lookup/ruc?n=${n}`);
        setForm(f => ({
          ...f,
          displayName: r.data.razonSocial || r.data.nombreComercial || f.displayName,
          docNumber:   r.data.ruc || f.docNumber,
          // Pre-fill address — all fields remain editable
          address: {
            addressLine1: r.data.direccion || f.address.addressLine1,
            addressLine2: f.address.addressLine2,
            district:     r.data.distrito  || f.address.district,
            city:         r.data.provincia || f.address.city,
          },
        }));
        setLookupStatus('found');
        toast.success('Empresa encontrada en SUNAT');
      } else if (form.docType === 'DNI') {
        const r = await api.get(`/v1/lookup/dni?n=${n}`);
        setForm(f => ({ ...f, displayName: r.data.fullName || f.displayName, docNumber: r.data.dni || f.docNumber }));
        setLookupStatus('found');
        toast.success('Persona encontrada en RENIEC');
      }
    } catch (e: any) {
      const code = e.response?.data?.error;
      if (code === 'APIS_TOKEN_MISSING' || code === 'APIS_TOKEN_INVALID')
        setLookupError('Configura APIS_NET_PE_TOKEN en .env para activar la búsqueda automática.');
      else if (code === 'NOT_FOUND')
        setLookupError(`${form.docType} "${n}" no encontrado en el padrón oficial.`);
      else
        setLookupError('No se pudo conectar con el servicio de consulta. Ingresa los datos manualmente.');
      setLookupStatus('error');
    }
  }

  function handleSubmit() {
    const finalDocNumber = form.docNumber.trim() || (form.type === 'B2C' ? `ANON-${Date.now()}` : '');

    // Build address payload only when at least a street is provided
    const hasAddress = form.address.addressLine1.trim() && form.address.district.trim();
    const hasDelivery = !form.deliverySameAsMain &&
      form.deliveryAddress.addressLine1.trim() &&
      form.deliveryAddress.district.trim();

    create.mutate({
      type:        form.type,
      docType:     form.docType,
      docNumber:   finalDocNumber,
      displayName: form.displayName.trim(),
      ...(form.type === 'B2B' && form.category ? { category: form.category } : {}),
      ...(form.email.trim() ? { email: form.email.trim() } : {}),
      ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      ...(hasAddress ? {
        address: {
          addressLine1: form.address.addressLine1.trim(),
          ...(form.address.addressLine2.trim() ? { addressLine2: form.address.addressLine2.trim() } : {}),
          district:   form.address.district.trim(),
          province:   form.address.city.trim() || 'Lima',
          department: 'Lima',
        },
      } : {}),
      ...(hasDelivery ? {
        deliveryAddress: {
          addressLine1: form.deliveryAddress.addressLine1.trim(),
          ...(form.deliveryAddress.addressLine2.trim() ? { addressLine2: form.deliveryAddress.addressLine2.trim() } : {}),
          district:   form.deliveryAddress.district.trim(),
          province:   form.deliveryAddress.city.trim() || 'Lima',
          department: 'Lima',
        },
      } : {}),
    });
  }

  const canSave = form.displayName.trim().length > 0 &&
    (form.type === 'B2C' || (form.docNumber.trim().length === 11 && form.category !== ''));

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-gray-500 text-sm">CRM B2B y B2C</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(v => !v)}>
          <Plus size={16} /> Nuevo cliente
        </button>
      </div>

      {/* ── Create form ── */}
      {showForm && (
        <div className="card p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Nuevo cliente</h3>
            <button onClick={closeForm} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={16} /></button>
          </div>

          {/* B2B / B2C toggle */}
          <div className="flex gap-2">
            {(['B2B', 'B2C'] as const).map(t => (
              <button key={t} onClick={() => handleTypeChange(t)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                  form.type === t
                    ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300 hover:text-brand-600'
                }`}
              >
                {t === 'B2B' ? <Building2 size={14} /> : <User size={14} />}
                {t === 'B2B' ? 'Empresa (B2B)' : 'Consumidor (B2C)'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">

            {/* ── B2B: RUC ── */}
            {form.type === 'B2B' && (
              <div className="col-span-2 space-y-1">
                <label className="block text-xs font-medium text-gray-600">RUC <span className="text-red-500">*</span></label>
                <div className="flex gap-2">
                  <input className="input flex-1 font-mono" value={form.docNumber} placeholder="20xxxxxxxxx (11 dígitos)"
                    maxLength={11}
                    onChange={e => { setForm(f => ({ ...f, docNumber: e.target.value.replace(/\D/g, '') })); setLookupStatus('idle'); }}
                    onKeyDown={e => e.key === 'Enter' && form.docNumber.length === 11 && runLookup()} />
                  <button type="button" onClick={runLookup}
                    disabled={lookupStatus === 'loading' || form.docNumber.length !== 11}
                    className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-brand-700 transition-colors">
                    {lookupStatus === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                    Buscar en SUNAT
                  </button>
                </div>
                {lookupStatus === 'error' && (
                  <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-1">
                    <AlertCircle size={13} className="mt-0.5 shrink-0" />{lookupError}
                  </div>
                )}
              </div>
            )}

            {/* ── B2C: doc type + number ── */}
            {form.type === 'B2C' && (
              <div className="col-span-2 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Tipo de documento</label>
                  <div className="flex gap-2 flex-wrap">
                    {(['DNI', 'CE', 'PASAPORTE'] as const).map(dt => (
                      <button key={dt} onClick={() => handleDocTypeChange(dt)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                          form.docType === dt ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-500 border-gray-200 hover:border-brand-300'
                        }`}>{dt}</button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-gray-600">
                    Número de {form.docType} <span className="ml-1 text-gray-400 font-normal">(opcional para boletas anónimas)</span>
                  </label>
                  <div className="flex gap-2">
                    <input className="input flex-1 font-mono" value={form.docNumber}
                      placeholder={form.docType === 'DNI' ? '12345678 (8 dígitos)' : form.docType === 'CE' ? 'Carnet de extranjería' : 'Número de pasaporte'}
                      maxLength={form.docType === 'DNI' ? 8 : form.docType === 'CE' ? 12 : 20}
                      onChange={e => { setForm(f => ({ ...f, docNumber: form.docType === 'DNI' ? e.target.value.replace(/\D/g, '') : e.target.value })); setLookupStatus('idle'); }}
                      onKeyDown={e => { if (e.key === 'Enter' && form.docType === 'DNI' && form.docNumber.length === 8) runLookup(); }} />
                    {form.docType === 'DNI' && (
                      <button type="button" onClick={runLookup}
                        disabled={lookupStatus === 'loading' || form.docNumber.length !== 8}
                        className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-brand-700 transition-colors">
                        {lookupStatus === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                        Buscar en RENIEC
                      </button>
                    )}
                  </div>
                  {lookupStatus === 'error' && (
                    <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <AlertCircle size={13} className="mt-0.5 shrink-0" />{lookupError}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Name */}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {form.type === 'B2B' ? 'Razón social' : 'Nombre completo'} <span className="text-red-500">*</span>
              </label>
              <input className="input" value={form.displayName}
                placeholder={form.type === 'B2B' ? 'Se llena automáticamente al buscar el RUC' : 'Nombre del cliente'}
                onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} />
            </div>

            {/* B2B category */}
            {form.type === 'B2B' && (
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Categoría <span className="text-red-500">*</span></label>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(CATEGORY_LABELS) as CustomerCategory[]).map(cat => (
                    <button key={cat} type="button" onClick={() => setForm(f => ({ ...f, category: cat }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        form.category === cat
                          ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-brand-300 hover:text-brand-700'
                      }`}>{CATEGORY_LABELS[cat]}</button>
                  ))}
                </div>
                {form.category === '' && <p className="text-xs text-red-500 mt-1.5">Selecciona una categoría para continuar</p>}
              </div>
            )}

            {/* Email + phone */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input className="input" type="email" value={form.email} placeholder="correo@empresa.com"
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono</label>
              <input className="input" type="tel" value={form.phone} placeholder="+51 9xx xxx xxx"
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>

            {/* ── Address section ── */}
            <div className="col-span-2 border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <MapPin size={12} className="text-brand-500" />
                Dirección {form.type === 'B2B' ? 'fiscal / principal' : ''}
              </p>
              <AddressBlock
                value={form.address}
                onChange={a => setForm(f => ({ ...f, address: a }))}
              />
            </div>

            {/* ── Delivery address ── */}
            <div className="col-span-2">
              {/* Checkbox */}
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, deliverySameAsMain: !f.deliverySameAsMain, deliveryAddress: EMPTY_ADDRESS }))}
                className="flex items-center gap-2.5 text-sm text-gray-700 hover:text-brand-700 transition-colors"
              >
                {form.deliverySameAsMain
                  ? <CheckSquare size={16} className="text-brand-600 shrink-0" />
                  : <Square size={16} className="text-gray-400 shrink-0" />
                }
                La dirección de entrega es la misma que la dirección principal
              </button>

              {/* Separate delivery address fields */}
              {!form.deliverySameAsMain && (
                <div className="mt-4 p-4 bg-blue-50/60 border border-blue-100 rounded-xl space-y-3">
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide flex items-center gap-1.5">
                    <MapPin size={12} /> Dirección de entrega
                  </p>
                  <AddressBlock
                    value={form.deliveryAddress}
                    onChange={a => setForm(f => ({ ...f, deliveryAddress: a }))}
                    label="Dirección de entrega"
                  />
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notas internas</label>
              <textarea className="input resize-none" rows={2} value={form.notes}
                placeholder="Condiciones comerciales, observaciones, etc."
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button className="btn-primary disabled:opacity-50" disabled={!canSave || create.isPending} onClick={handleSubmit}>
              {create.isPending ? <span className="flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Guardando...</span> : 'Guardar cliente'}
            </button>
            <button className="btn-secondary" onClick={closeForm}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ── Customer table ── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 space-y-3">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-gray-400" />
            <h2 className="font-semibold">Clientes registrados</h2>
            <span className="ml-auto text-sm text-gray-400">
              {filtered.length !== allCustomers.length
                ? `${filtered.length} de ${allCustomers.length}`
                : allCustomers.length}
            </span>
          </div>
          {/* Search + type filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                className="input pl-8 py-1.5 text-sm"
                placeholder="Buscar por nombre o RUC/DNI..."
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
              />
              {searchText && (
                <button
                  onClick={() => setSearchText('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1">
              {(['', 'B2B', 'B2C'] as const).map(t => (
                <button
                  key={t || 'all'}
                  onClick={() => setTypeFilter(t)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    typeFilter === t
                      ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-brand-300 hover:text-brand-700'
                  }`}
                >
                  {t === '' ? 'Todos' : t === 'B2B' ? <><Building2 size={10} /> B2B</> : <><User size={10} /> B2C</>}
                </button>
              ))}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Cargando...</div>
        ) : (
          <div className="table-container">
            <table className="w-full text-sm">
              <thead className="bg-brand-50 text-brand-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-3 text-left w-8"></th>
                  <th className="px-5 py-3 text-left">Razón Social</th>
                  <th className="px-5 py-3 text-left">Documento</th>
                  <th className="px-5 py-3 text-left">Tipo</th>
                  <th className="px-5 py-3 text-left">Categoría</th>
                  <th className="px-5 py-3 text-left">Email</th>
                  <th className="px-5 py-3 text-left">Dirección entrega</th>
                  <th className="px-5 py-3 text-center">Sucursales</th>
                  <th className="px-5 py-3 text-left">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={9} className="px-5 py-8 text-center text-sm text-gray-400">
                      {allCustomers.length === 0 ? 'Sin clientes aún' : 'No se encontraron clientes con esos filtros'}
                    </td>
                  </tr>
                )}
                {filtered.map((c: any) => {
                  const isExpanded = expandedId === c.id;
                  const sucursales  = (c.sucursales ?? []).filter((s: any) => s.isActive);
                  const addresses   = c.addresses ?? [];
                  const deliveryAddr = addresses.find((a: any) => a.label === 'Entrega')
                    ?? addresses.find((a: any) => a.isDefault);
                  const isB2B = c.type === 'B2B';

                  return (
                    <React.Fragment key={c.id}>
                      <tr
                        key={c.id}
                        className={`table-row-hover ${isB2B ? 'cursor-pointer' : ''} ${isExpanded ? 'bg-brand-50/40' : ''}`}
                        onClick={() => isB2B && setExpandedId(isExpanded ? null : c.id)}
                      >
                        <td className="px-5 py-3 text-gray-400">
                          {isB2B
                            ? (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)
                            : null
                          }
                        </td>
                        <td className="px-5 py-3 font-medium">{c.displayName}</td>
                        <td className="px-5 py-3 text-gray-500 font-mono text-xs">
                          <span className="text-gray-400 text-xs mr-1">{c.docType}</span>
                          {c.docNumber?.startsWith('ANON-') ? <span className="text-gray-300">—</span> : c.docNumber}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`badge inline-flex items-center gap-1 ${c.type === 'B2B' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                            {c.type === 'B2B' ? <Building2 size={10} /> : <User size={10} />} {c.type}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          {c.category
                            ? <span className={`badge ${CATEGORY_COLORS[c.category as CustomerCategory] ?? 'bg-gray-100 text-gray-500'}`}>{CATEGORY_LABELS[c.category as CustomerCategory] ?? c.category}</span>
                            : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-5 py-3 text-gray-500">{c.email ?? '—'}</td>
                        <td className="px-5 py-3 text-gray-500 text-xs max-w-[180px]">
                          {sucursales.length > 0 ? (
                            <span className="text-gray-400 italic">Ver sucursales ↓</span>
                          ) : deliveryAddr ? (
                            <span className="flex items-start gap-1">
                              <MapPin size={10} className="text-gray-400 mt-0.5 shrink-0" />
                              <span className="truncate">{deliveryAddr.addressLine1}, {deliveryAddr.district}</span>
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-center">
                          {isB2B ? (
                            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                              sucursales.length > 0 ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-400'
                            }`}>
                              <Store size={10} /> {sucursales.length}
                            </span>
                          ) : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`badge ${c.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {c.isActive ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                      </tr>

                      {/* Expanded sucursales panel */}
                      {isExpanded && isB2B && (
                        <tr key={`${c.id}-sucursales`}>
                          <td colSpan={9} className="bg-gray-50/70 px-8 py-5 border-b border-gray-200">
                            <div className="space-y-4">
                              {/* Main / Delivery address summary */}
                              {addresses.length > 0 && (
                                <div className="flex flex-wrap gap-3">
                                  {addresses.map((a: any) => (
                                    <div key={a.id} className="flex items-start gap-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg px-3 py-2">
                                      <MapPin size={11} className="text-gray-400 mt-0.5 shrink-0" />
                                      <div>
                                        <span className="font-medium text-gray-500 mr-1.5">{a.label}</span>
                                        {a.addressLine1}{a.addressLine2 ? `, ${a.addressLine2}` : ''} — {a.district}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div className="flex items-center justify-between">
                                <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                                  <Store size={14} className="text-brand-500" />
                                  Sucursales — {c.displayName}
                                  <span className="text-xs font-normal text-gray-400">(cada sucursal tiene su propia dirección de entrega y ruta)</span>
                                </p>
                                <button
                                  onClick={e => { e.stopPropagation(); setSucursalModal({ customerId: c.id }); }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-medium hover:bg-brand-700 transition-colors"
                                >
                                  <Plus size={12} /> Nueva sucursal
                                </button>
                              </div>

                              {sucursales.length === 0 ? (
                                <p className="text-sm text-gray-400 py-4 text-center">
                                  Sin sucursales — se usará la dirección de entrega del cliente para la ruta.
                                </p>
                              ) : (
                                <div className="grid grid-cols-2 gap-3">
                                  {sucursales.map((s: any) => (
                                    <SucursalCard
                                      key={s.id}
                                      s={s}
                                      customerId={c.id}
                                      onEdit={suc => { setSucursalModal({ customerId: c.id, sucursal: suc }); }}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sucursal modal */}
      {sucursalModal && (
        <SucursalModal
          customerId={sucursalModal.customerId}
          sucursal={sucursalModal.sucursal}
          onClose={() => setSucursalModal(null)}
        />
      )}
    </div>
  );
}
