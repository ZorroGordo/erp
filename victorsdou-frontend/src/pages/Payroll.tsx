import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useState } from 'react';
import { Plus, UserCheck } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Payroll() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ fullName: '', docNumber: '', position: '', department: '', grossSalaryPen: '', pensionSystem: 'AFP', afpId: '', bankAccount: '', bankName: '' });

  const { data: employees, isLoading } = useQuery({ queryKey: ['employees'], queryFn: () => api.get('/v1/payroll/employees').then(r => r.data) });

  const create = useMutation({
    mutationFn: (b: any) => api.post('/v1/payroll/employees', b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees'] }); toast.success('Empleado registrado'); setShowForm(false); },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Error'),
  });

  const fields = [
    ['fullName','Nombre completo'],['docNumber','DNI'],['position','Cargo'],
    ['department','Área'],['grossSalaryPen','Sueldo bruto S/'],['bankAccount','Cuenta bancaria'],['bankName','Banco'],
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Planilla</h1><p className="text-gray-500 text-sm">Empleados y AFP/ONP</p></div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(v => !v)}><Plus size={16} /> Nuevo empleado</button>
      </div>

      {showForm && (
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold">Nuevo empleado</h3>
          <div className="grid grid-cols-2 gap-4">
            {fields.map(([k, l]) => (
              <div key={k}><label className="block text-xs font-medium text-gray-600 mb-1">{l}</label>
                <input className="input" value={(form as any)[k]} type={k === 'grossSalaryPen' ? 'number' : 'text'} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} /></div>
            ))}
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Sistema pensionario</label>
              <select className="input" value={form.pensionSystem} onChange={e => setForm(f => ({ ...f, pensionSystem: e.target.value }))}>
                <option value="AFP">AFP</option><option value="ONP">ONP (SNP)</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={() => create.mutate({ ...form, grossSalaryPen: parseFloat(form.grossSalaryPen) })}>Guardar</button>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2"><UserCheck size={18} className="text-gray-400" /><h2 className="font-semibold">Empleados</h2><span className="ml-auto text-sm text-gray-400">{employees?.data?.length ?? 0}</span></div>
        {isLoading ? <div className="p-8 text-center text-gray-400">Cargando...</div> : (
          <div className="table-container">
          <table className="w-full text-sm">
            <thead className="bg-brand-50 text-brand-600 text-xs uppercase tracking-wide">
              <tr><th className="px-5 py-3 text-left">Nombre</th><th className="px-5 py-3 text-left">Cargo</th><th className="px-5 py-3 text-left">Área</th><th className="px-5 py-3 text-right">Sueldo bruto</th><th className="px-5 py-3 text-left">Pensión</th><th className="px-5 py-3 text-left">Estado</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {employees?.data?.map((e: any) => (
                <tr key={e.id} className="table-row-hover">
                  <td className="px-5 py-3 font-medium">{e.fullName}</td>
                  <td className="px-5 py-3 text-gray-600">{e.position}</td>
                  <td className="px-5 py-3 text-gray-500">{e.department}</td>
                  <td className="px-5 py-3 text-right font-mono">S/ {Number(e.grossSalaryPen).toFixed(2)}</td>
                  <td className="px-5 py-3"><span className="badge bg-indigo-100 text-indigo-700">{e.pensionSystem}</span></td>
                  <td className="px-5 py-3"><span className={`badge ${e.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{e.isActive ? 'Activo' : 'Inactivo'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
        {!employees?.data?.length && !isLoading && <p className="text-center text-gray-400 py-8">Sin empleados registrados</p>}
      </div>
    </div>
  );
}
