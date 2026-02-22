import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useState, useMemo } from 'react';
import { Plus, ShoppingBag, ChevronDown, ChevronRight, Trash2, FlaskConical, CheckCircle2, Archive, Settings2, Pencil, X, Loader2, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { fmtNum } from '../lib/fmt';

// ── Types ──────────────────────────────────────────────────────────────────

interface Ingredient { id: string; name: string; sku: string; baseUom: string; avgCostPen: string; }
interface BOMLine { id: string; ingredientId: string; ingredient: Ingredient; qtyRequired: string; uom: string; wasteFactorPct: string; notes: string | null; }
interface Recipe { id: string; productId: string; version: number; status: string; yieldQty: string; yieldUom: string; bomLines: BOMLine[]; }
interface Product { id: string; name: string; sku: string; basePricePen: string; isActive: boolean; category?: { name: string }; }
interface CostLine extends BOMLine { effectiveQty: number; effectiveQtyStd: number; stdUnit: string; avgCost: number; lineCost: number; }

// ── Cost helpers ───────────────────────────────────────────────────────────
// avgCostPen is ALWAYS stored as S/ per kg (for weight) or S/ per litre (for volume).
// We must convert any qty to kg or litre before multiplying.

function convertQtyToStdUnit(qty: number, uom: string): { value: number; unit: string } {
  const u = (uom ?? '').toLowerCase();
  const gramToKg: Record<string, number> = { mg: 0.000001, g: 0.001, kg: 1 };
  const mlToLitre: Record<string, number> = { ml: 0.001, cl: 0.01, dl: 0.1, l: 1, litre: 1, liter: 1 };
  if (gramToKg[u] !== undefined) return { value: qty * gramToKg[u], unit: 'kg' };
  if (mlToLitre[u] !== undefined) return { value: qty * mlToLitre[u], unit: 'L' };
  return { value: qty, unit: uom };
}

function qtyToGrams(qty: number, uom: string): number {
  const u = (uom ?? '').toLowerCase();
  const factors: Record<string, number> = { mg: 0.001, g: 1, kg: 1000 };
  return factors[u] !== undefined ? qty * factors[u] : 0;
}

function computeCosts(recipe: Recipe | null, overheadRate: number) {
  if (!recipe) return { costLines: [] as CostLine[], totalRawCost: 0, effectiveUnitCost: 0, overheadCost: 0, totalProductCost: 0, doughWeightG: 0 };
  const yieldQty = Number(recipe.yieldQty) || 1;
  const costLines: CostLine[] = recipe.bomLines.map(l => {
    const effectiveQty = Number(l.qtyRequired) * (1 + Number(l.wasteFactorPct) / 100);
    const { value: effectiveQtyStd, unit: stdUnit } = convertQtyToStdUnit(effectiveQty, l.uom);
    const avgCost = Number(l.ingredient.avgCostPen);
    const lineCost = effectiveQtyStd * avgCost;
    return { ...l, effectiveQty, effectiveQtyStd, stdUnit, avgCost, lineCost };
  });
  const totalRawCost = costLines.reduce((s, l) => s + l.lineCost, 0);
  const effectiveUnitCost = totalRawCost / yieldQty;
  const safeRate = Math.min(Math.max(overheadRate, 0), 0.99);
  const totalProductCost = effectiveUnitCost / (1 - safeRate);
  const overheadCost = totalProductCost - effectiveUnitCost;
  const totalWeightG = recipe.bomLines.reduce((sum, l) => {
    const qty = Number(l.qtyRequired) * (1 + Number(l.wasteFactorPct) / 100);
    return sum + qtyToGrams(qty, l.uom);
  }, 0);
  const doughWeightG = totalWeightG / yieldQty;
  return { costLines, totalRawCost, effectiveUnitCost, overheadCost, totalProductCost, doughWeightG };
}

// ── Main component ─────────────────────────────────────────────────────────

// ── Recipe Editor Modal ────────────────────────────────────────────────────────

interface BOMLineEdit { tempId: string; ingredientId: string; ingredientName: string; qtyRequired: string; uom: string; wasteFactorPct: string; }

function RecipeEditorModal({ product, recipe, onClose }: { product: Product; recipe: Recipe | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [yieldQty, setYieldQty] = useState(recipe ? String(recipe.yieldQty) : '1');
  const [yieldUom, setYieldUom] = useState(recipe ? recipe.yieldUom : 'unidades');
  const [lines, setLines] = useState<BOMLineEdit[]>(() =>
    (recipe?.bomLines ?? []).map(l => ({
      tempId: l.id,
      ingredientId: l.ingredientId,
      ingredientName: l.ingredient.name,
      qtyRequired: String(l.qtyRequired),
      uom: l.uom,
      wasteFactorPct: String(l.wasteFactorPct),
    }))
  );
  const [ingSearch, setIngSearch] = useState('');
  const [ingOpen, setIngOpen] = useState(false);

  const { data: ingsData } = useQuery<{ data: Ingredient[] }>({
    queryKey: ['ingredients-all'],
    queryFn: () => api.get('/v1/inventory/ingredients').then(r => r.data),
    staleTime: 60_000,
  });

  const filteredIngs = (ingsData?.data ?? []).filter(i =>
    !ingSearch || i.name.toLowerCase().includes(ingSearch.toLowerCase()) || i.sku?.toLowerCase().includes(ingSearch.toLowerCase())
  ).slice(0, 8);

  const addIngredient = (ing: Ingredient) => {
    setLines(ls => [...ls, { tempId: crypto.randomUUID(), ingredientId: ing.id, ingredientName: ing.name, qtyRequired: '1', uom: ing.baseUom, wasteFactorPct: '0' }]);
    setIngSearch(''); setIngOpen(false);
  };

  const updateLine = (tempId: string, field: keyof BOMLineEdit, val: string) =>
    setLines(ls => ls.map(l => l.tempId === tempId ? { ...l, [field]: val } : l));

  const removeLine = (tempId: string) => setLines(ls => ls.filter(l => l.tempId !== tempId));

  const saveMutation = useMutation({
    mutationFn: async () => {
      let recipeId = recipe?.id;
      // Create recipe if none exists
      if (!recipeId) {
        const r = await api.post('/v1/production/recipes', { productId: product.id, yieldQty: parseFloat(yieldQty) || 1, yieldUom });
        recipeId = r.data.data.id;
      }
      await api.put(`/v1/production/recipes/${recipeId}/bom`, {
        yieldQty: parseFloat(yieldQty) || 1,
        yieldUom,
        lines: lines.map(l => ({ ingredientId: l.ingredientId, qtyRequired: parseFloat(l.qtyRequired) || 0, uom: l.uom, wasteFactorPct: parseFloat(l.wasteFactorPct) || 0 })),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipe'] });
      qc.invalidateQueries({ queryKey: ['all-recipes-summary'] });
      toast.success('Receta guardada');
      onClose();
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Error al guardar receta'),
  });

  const UOM_OPTIONS = ['g', 'kg', 'ml', 'l', 'unidades', 'cl', 'dl', 'tsp', 'tbsp'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center"><FlaskConical size={15} className="text-white" /></div>
            <div>
              <h2 className="font-bold text-gray-900">Editar receta</h2>
              <p className="text-xs text-gray-400">{product.name} {recipe && `· v${recipe.version}`}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Yield */}
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Rinde (cantidad)</label>
              <input type="number" min={0.01} step={0.01} className="input w-full" value={yieldQty} onChange={e => setYieldQty(e.target.value)} />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Unidad de medida</label>
              <select className="input w-full" value={yieldUom} onChange={e => setYieldUom(e.target.value)}>
                {['unidades', 'g', 'kg', 'l', 'ml', 'porciones'].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          {/* Ingredient search */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Agregar ingrediente</label>
            <div className="relative">
              <div className="flex items-center gap-2 border border-brand-200 rounded-xl px-3 py-2 bg-white focus-within:ring-2 focus-within:ring-indigo-300">
                <Search size={14} className="text-gray-400 flex-shrink-0" />
                <input className="flex-1 text-sm outline-none bg-transparent placeholder:text-gray-400"
                  placeholder="Buscar ingrediente del inventario…"
                  value={ingSearch} onChange={e => { setIngSearch(e.target.value); setIngOpen(true); }}
                  onFocus={() => setIngOpen(true)} />
                {ingSearch && <button onClick={() => { setIngSearch(''); setIngOpen(false); }} className="text-gray-300 hover:text-gray-500"><X size={14} /></button>}
              </div>
              {ingOpen && filteredIngs.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-brand-200 rounded-xl shadow-lg overflow-hidden">
                  {filteredIngs.map(ing => (
                    <button key={ing.id} className="w-full px-4 py-2.5 text-left hover:bg-indigo-50 flex items-center gap-3 transition-colors"
                      onClick={() => addIngredient(ing)}>
                      <span className="flex-1 text-sm font-medium text-gray-800 truncate">{ing.name}</span>
                      <span className="text-xs text-gray-400 font-mono">{ing.baseUom}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* BOM lines */}
          {lines.length > 0 && (
            <div className="border border-indigo-200 rounded-xl overflow-hidden">
              <div className="grid grid-cols-[1fr_80px_80px_70px_32px] gap-1 px-3 py-1.5 bg-indigo-50 text-xs font-semibold text-indigo-600 uppercase tracking-wide">
                <span>Ingrediente</span><span className="text-right">Cantidad</span><span className="text-center">UoM</span><span className="text-right">Merma %</span><span />
              </div>
              {lines.map(l => (
                <div key={l.tempId} className="grid grid-cols-[1fr_80px_80px_70px_32px] gap-1 px-3 py-1.5 items-center border-t border-indigo-100 hover:bg-indigo-50/40">
                  <span className="text-sm text-gray-800 truncate">{l.ingredientName}</span>
                  <input type="number" min={0.001} step={0.001} className="text-xs border border-gray-200 rounded px-1.5 py-1 text-right w-full focus:ring-1 focus:ring-indigo-300 outline-none"
                    value={l.qtyRequired} onChange={e => updateLine(l.tempId, 'qtyRequired', e.target.value)} />
                  <select className="text-xs border border-gray-200 rounded px-1 py-1 w-full focus:ring-1 focus:ring-indigo-300 outline-none"
                    value={l.uom} onChange={e => updateLine(l.tempId, 'uom', e.target.value)}>
                    {UOM_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <input type="number" min={0} max={99} step={0.5} className="text-xs border border-gray-200 rounded px-1.5 py-1 text-right w-full focus:ring-1 focus:ring-indigo-300 outline-none"
                    value={l.wasteFactorPct} onChange={e => updateLine(l.tempId, 'wasteFactorPct', e.target.value)} />
                  <button onClick={() => removeLine(l.tempId)} className="text-gray-300 hover:text-red-400 flex items-center justify-center transition-colors">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {lines.length === 0 && (
            <p className="text-sm text-gray-400 italic text-center py-4">Sin ingredientes. Busca y agrega ingredientes arriba.</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-xl transition-all">Cancelar</button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-all"
          >
            {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Guardar receta
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Products() {
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [productForm, setProductForm] = useState({ name: '', sku: '', basePricePen: '', categoryId: '' });
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState({ name: '', sku: '', basePricePen: '', categoryId: '', isActive: true });
  const [editingRecipe, setEditingRecipe] = useState<{ product: Product; recipe: Recipe | null } | null>(null);
  const [overheadRate, setOverheadRate] = useState(0.47);
  const [editingOverhead, setEditingOverhead] = useState(false);
  const [overheadInput, setOverheadInput] = useState('47');

  const { data: productsData, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.get('/v1/products').then(r => r.data),
  });

  const { data: allRecipesData } = useQuery({
    queryKey: ['all-recipes-summary'],
    queryFn: () => api.get('/v1/production/recipes').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const { data: recipeData } = useQuery({
    queryKey: ['recipe', expandedId],
    queryFn: () => api.get('/v1/production/recipes?productId=' + expandedId + '&status=ACTIVE').then(r => r.data),
    enabled: !!expandedId,
  });

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/v1/products/categories').then(r => r.data),
  });

  const productCostMap = useMemo(() => {
    const map: Record<string, { totalProductCost: number; grossMargin: number }> = {};
    const recipes: Recipe[] = allRecipesData?.data ?? [];
    const products: Product[] = productsData?.data ?? [];
    recipes.forEach((recipe: Recipe) => {
      if (recipe.status !== 'ACTIVE') return;
      if (!recipe.bomLines || recipe.bomLines.length === 0) return;
      const costs = computeCosts(recipe, overheadRate);
      const product = products.find((p: Product) => p.id === recipe.productId);
      const basePrice = product ? Number(product.basePricePen) : 0;
      map[recipe.productId] = { totalProductCost: costs.totalProductCost, grossMargin: basePrice - costs.totalProductCost };
    });
    return map;
  }, [allRecipesData, productsData, overheadRate]);

  const createProduct = useMutation({
    mutationFn: (data: typeof productForm) => api.post('/v1/products', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['all-recipes-summary'] });
      toast.success('Producto creado');
      setShowCreate(false);
      setProductForm({ name: '', sku: '', basePricePen: '', categoryId: '' });
    },
    onError: () => toast.error('Error al crear producto'),
  });

  const deleteProduct = useMutation({
    mutationFn: (id: string) => api.delete('/v1/products/' + id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['all-recipes-summary'] });
      toast.success('Producto eliminado');
    },
    onError: () => toast.error('Error al eliminar producto'),
  });

  const patchProduct = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof editForm }) =>
      api.patch('/v1/products/' + id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['all-recipes-summary'] });
      toast.success('Producto actualizado');
      setEditingProduct(null);
    },
    onError: () => toast.error('Error al actualizar producto'),
  });

  function openEdit(p: Product) {
    setEditForm({
      name: p.name,
      sku: p.sku,
      basePricePen: p.basePricePen,
      categoryId: p.category ? (categories.find((c: any) => c.name === p.category?.name)?.id ?? '') : '',
      isActive: p.isActive,
    });
    setEditingProduct(p);
  }

  const products: Product[] = productsData?.data ?? [];
  const categories = categoriesData?.data ?? [];
  const activeRecipe: Recipe | null = recipeData?.data?.[0] ?? null;
  const expandedProduct = products.find(p => p.id === expandedId);
  const basePrice = expandedProduct ? Number(expandedProduct.basePricePen) : 0;
  const { costLines, effectiveUnitCost, overheadCost, totalProductCost, doughWeightG } = computeCosts(activeRecipe, overheadRate);
  const grossMargin = basePrice - totalProductCost;

  const commitOverhead = () => {
    const v = parseFloat(overheadInput);
    if (!isNaN(v) && v >= 0 && v < 100) setOverheadRate(v / 100);
    setEditingOverhead(false);
  };

  return (
    <>
    {/* ── Edit Product Modal ── */}
    {editingProduct && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center">
                <Pencil size={15} className="text-white" />
              </div>
              <h2 className="font-bold text-gray-900">Editar producto</h2>
            </div>
            <button onClick={() => setEditingProduct(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nombre *</label>
              <input className="input w-full" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} placeholder="Nombre del producto" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">SKU *</label>
                <input className="input w-full font-mono" value={editForm.sku} onChange={e => setEditForm(f => ({ ...f, sku: e.target.value }))} placeholder="SKU-001" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Precio base (S/)</label>
                <input type="number" min={0} step={0.01} className="input w-full" value={editForm.basePricePen} onChange={e => setEditForm(f => ({ ...f, basePricePen: e.target.value }))} placeholder="0.00" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Categoría</label>
              <select className="input w-full" value={editForm.categoryId} onChange={e => setEditForm(f => ({ ...f, categoryId: e.target.value }))}>
                <option value="">Sin categoría</option>
                {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</label>
              <button
                type="button"
                onClick={() => setEditForm(f => ({ ...f, isActive: !f.isActive }))}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium border transition-all ${editForm.isActive ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}
              >
                {editForm.isActive ? <><CheckCircle2 size={12} /> Activo</> : <><Archive size={12} /> Inactivo</>}
              </button>
            </div>
          </div>
          <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50 rounded-b-2xl">
            <button onClick={() => setEditingProduct(null)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-xl transition-all">Cancelar</button>
            <button
              onClick={() => patchProduct.mutate({ id: editingProduct.id, data: editForm })}
              disabled={!editForm.name || !editForm.sku || patchProduct.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-all"
            >
              {patchProduct.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Guardar cambios
            </button>
          </div>
        </div>
      </div>
    )}
    {/* ── Edit Recipe Modal ── */}
    {editingRecipe && (
      <RecipeEditorModal
        product={editingRecipe.product}
        recipe={editingRecipe.recipe}
        onClose={() => setEditingRecipe(null)}
      />
    )}
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShoppingBag className="w-7 h-7 text-indigo-600" />
          <h1 className="text-2xl font-bold text-gray-900">Productos</h1>
        </div>
        <button onClick={() => setShowCreate(s => !s)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium">
          <Plus className="w-4 h-4" /> Nuevo producto
        </button>
      </div>

      <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm">
        <Settings2 className="w-4 h-4 text-amber-600 shrink-0" />
        <span className="text-amber-800 font-medium">Tasa de gastos generales:</span>
        {editingOverhead ? (
          <div className="flex items-center gap-2">
            <input
              className="w-16 px-2 py-1 border border-amber-400 rounded text-center font-mono text-sm"
              value={overheadInput}
              onChange={e => setOverheadInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commitOverhead(); if (e.key === 'Escape') setEditingOverhead(false); }}
              autoFocus
            />
            <span className="text-amber-700">%</span>
            <button className="text-xs text-amber-700 underline" onClick={commitOverhead}>OK</button>
          </div>
        ) : (
          <button className="font-mono font-bold text-amber-900 hover:underline" onClick={() => { setOverheadInput(String(Math.round(overheadRate * 100))); setEditingOverhead(true); }}>
            {Math.round(overheadRate * 100)}%
          </button>
        )}
        <span className="text-amber-600 text-xs ml-1">(mano de obra, servicios, alquiler, depreciacion de equipos)</span>
      </div>

      {showCreate && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-gray-800">Nuevo producto</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nombre</label>
              <input className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" type="text" placeholder="ej. Bagel Clasico" value={productForm.name} onChange={e => setProductForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                SKU <span className="font-normal text-gray-400">(formato: CAT-ITEM-SIZE)</span>
              </label>
              <input className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" type="text" placeholder="ej. BRD-BGL-MED" value={productForm.sku} onChange={e => setProductForm(f => ({ ...f, sku: e.target.value.toUpperCase() }))} />
              <p className="text-xs text-gray-400 mt-1">Categoria (3-4 letras) - Producto (3-4 letras) - Tamano (3 letras) - ej: PSTY-CROI-MED</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Precio base (S/.)</label>
              <input className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" type="number" step="0.01" placeholder="0.00" value={productForm.basePricePen} onChange={e => setProductForm(f => ({ ...f, basePricePen: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Categoria</label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" value={productForm.categoryId} onChange={e => setProductForm(f => ({ ...f, categoryId: e.target.value }))}>
                <option value="">Sin categoria</option>
                {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => createProduct.mutate(productForm)} disabled={!productForm.name || !productForm.sku} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40">Crear</button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Cargando productos...</div>
        ) : products.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Sin productos. Crea el primero.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500 w-6"></th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">SKU</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Precio base</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Costo total</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Margen bruto</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Categoria</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {products.map((product: Product) => {
                const isExpanded = expandedId === product.id;
                const costInfo = productCostMap[product.id];
                return (
                  <>
                    <tr key={product.id} className={'border-b border-gray-100 hover:bg-gray-50 cursor-pointer ' + (isExpanded ? 'bg-indigo-50' : '')} onClick={() => setExpandedId(isExpanded ? null : product.id)}>
                      <td className="px-4 py-3 text-gray-400">{isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{product.name}</td>
                      <td className="px-4 py-3 font-mono text-gray-500 text-xs">{product.sku}</td>
                      <td className="px-4 py-3 text-right text-gray-700">S/ {fmtNum(product.basePricePen)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{costInfo ? 'S/ ' + costInfo.totalProductCost.toFixed(2) : '-'}</td>
                      <td className={'px-4 py-3 text-right font-medium ' + (costInfo ? (costInfo.grossMargin >= 0 ? 'text-green-600' : 'text-red-500') : 'text-gray-400')}>
                        {costInfo ? 'S/ ' + costInfo.grossMargin.toFixed(2) : '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{product.category?.name ?? '-'}</td>
                      <td className="px-4 py-3">
                        {product.isActive
                          ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs"><CheckCircle2 className="w-3 h-3" /> Activo</span>
                          : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs"><Archive className="w-3 h-3" /> Inactivo</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={e => { e.stopPropagation(); openEdit(product); }} className="text-gray-400 hover:text-brand-600 p-1 rounded" title="Editar">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={e => { e.stopPropagation(); if (confirm('Eliminar producto?')) deleteProduct.mutate(product.id); }} className="text-gray-400 hover:text-red-500 p-1 rounded" title="Eliminar">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={product.id + '-detail'}>
                        <td colSpan={9} className="px-6 py-5 bg-indigo-50">
                          <RecipePanel
                            product={product}
                            recipe={activeRecipe}
                            costLines={costLines}
                            effectiveUnitCost={effectiveUnitCost}
                            overheadCost={overheadCost}
                            overheadRate={overheadRate}
                            totalProductCost={totalProductCost}
                            doughWeightG={doughWeightG}
                            basePrice={basePrice}
                            grossMargin={grossMargin}
                            onEdit={() => setEditingRecipe({ product, recipe: activeRecipe })}
                          />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100">{products.length} items</div>
      </div>
    </div>
    </>
  );
}

// ── Recipe Panel ──────────────────────────────────────────────────────────────

interface RecipePanelProps {
  product: Product;
  recipe: Recipe | null;
  costLines: CostLine[];
  effectiveUnitCost: number;
  overheadCost: number;
  overheadRate: number;
  totalProductCost: number;
  doughWeightG: number;
  basePrice: number;
  grossMargin: number;
  onEdit: () => void;
}

function RecipePanel({ product, recipe, costLines, effectiveUnitCost, overheadCost, overheadRate, totalProductCost, doughWeightG, basePrice, grossMargin, onEdit }: RecipePanelProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-indigo-700 font-semibold">
        <FlaskConical className="w-4 h-4" />
        <span>Receta activa - {product.name}</span>
        {recipe && <span className="text-xs font-normal text-indigo-400 ml-1">v{recipe.version} - Rinde {recipe.yieldQty} {recipe.yieldUom}</span>}
        <button
          onClick={onEdit}
          className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          <Pencil size={11} /> {recipe ? 'Editar receta' : 'Crear receta'}
        </button>
      </div>
      {!recipe ? (
        <p className="text-sm text-gray-400 italic">Sin receta activa. Crea una con el botón de arriba.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <CostCard label="Peso masa / unidad" value={doughWeightG.toFixed(1) + ' g'} sub="" color="indigo" />
            <CostCard label="Insumos / unidad" value={'S/ ' + effectiveUnitCost.toFixed(3)} sub="costo de ingredientes" color="blue" />
            <CostCard label={'Overhead / unidad'} value={'S/ ' + overheadCost.toFixed(3)} sub={'tasa ' + Math.round(overheadRate * 100) + '%'} color="amber" />
            <CostCard label="Costo total / unidad" value={'S/ ' + totalProductCost.toFixed(3)} sub="insumos + overhead" color="orange" />
            <CostCard label="Precio base / unidad" value={'S/ ' + basePrice.toFixed(2)} sub="precio de venta" color="teal" />
            <CostCard label="Margen bruto / unidad" value={'S/ ' + grossMargin.toFixed(3)} sub={grossMargin >= 0 ? 'ganancia' : 'perdida'} color={grossMargin >= 0 ? 'green' : 'red'} />
          </div>
          <div className="overflow-x-auto rounded-lg border border-indigo-200">
            <table className="w-full text-xs">
              <thead className="bg-indigo-100 text-indigo-700">
                <tr>
                  <th className="text-left px-3 py-2">Ingrediente</th>
                  <th className="text-right px-3 py-2">Qty requerida</th>
                  <th className="text-right px-3 py-2">Desperdicio</th>
                  <th className="text-right px-3 py-2">Qty efectiva (std)</th>
                  <th className="text-right px-3 py-2">Costo / std unit</th>
                  <th className="text-right px-3 py-2">Costo linea</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-indigo-100">
                {costLines.map((l: CostLine) => (
                  <tr key={l.id} className="hover:bg-indigo-50">
                    <td className="px-3 py-2 font-medium text-gray-800">{l.ingredient.name}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{fmtNum(l.qtyRequired)} {l.uom}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{Number(l.wasteFactorPct).toFixed(1)}%</td>
                    <td className="px-3 py-2 text-right text-gray-600">{l.effectiveQtyStd.toFixed(4)} {l.stdUnit}</td>
                    <td className="px-3 py-2 text-right text-gray-600">S/ {l.avgCost.toFixed(3)}/{l.stdUnit}</td>
                    <td className="px-3 py-2 text-right font-medium text-gray-800">S/ {l.lineCost.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-indigo-50 font-semibold text-indigo-800">
                <tr>
                  <td colSpan={5} className="px-3 py-2 text-right">Total insumos (para {recipe.yieldQty} {recipe.yieldUom}):</td>
                  <td className="px-3 py-2 text-right">S/ {costLines.reduce((s: number, l: CostLine) => s + l.lineCost, 0).toFixed(4)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Cost Card ─────────────────────────────────────────────────────────────────

type CardColor = 'indigo' | 'blue' | 'amber' | 'orange' | 'teal' | 'green' | 'red';

function CostCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: CardColor }) {
  const palettes: Record<CardColor, string> = {
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
    teal: 'bg-teal-50 border-teal-200 text-teal-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    red: 'bg-red-50 border-red-200 text-red-700',
  };
  return (
    <div className={'rounded-lg border px-3 py-2 ' + palettes[color]}>
      <p className="text-xs opacity-70 leading-tight">{label}</p>
      <p className="text-base font-bold mt-0.5">{value}</p>
      {sub && <p className="text-xs opacity-60">{sub}</p>}
    </div>
  );
                   }
