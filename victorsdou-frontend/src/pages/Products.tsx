import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useState, useMemo } from 'react';
import { Plus, ShoppingBag, ChevronDown, ChevronRight, Trash2, FlaskConical, CheckCircle2, Archive, Settings2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { fmtMoney, fmtNum } from '../lib/fmt';

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

export default function Products() {
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [productForm, setProductForm] = useState({ name: '', sku: '', basePricePen: '', categoryId: '' });
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
                        <button onClick={e => { e.stopPropagation(); if (confirm('Eliminar producto?')) deleteProduct.mutate(product.id); }} className="text-gray-400 hover:text-red-500 p-1 rounded">
                          <Trash2 className="w-4 h-4" />
                        </button>
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
}

function RecipePanel({ product, recipe, costLines, effectiveUnitCost, overheadCost, overheadRate, totalProductCost, doughWeightG, basePrice, grossMargin }: RecipePanelProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-indigo-700 font-semibold">
        <FlaskConical className="w-4 h-4" />
        <span>Receta activa - {product.name}</span>
        {recipe && <span className="text-xs font-normal text-indigo-400 ml-1">v{recipe.version} - Rinde {recipe.yieldQty} {recipe.yieldUom}</span>}
      </div>
      {!recipe ? (
        <p className="text-sm text-gray-400 italic">Sin receta activa para este producto.</p>
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
