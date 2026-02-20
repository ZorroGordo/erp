import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useState } from 'react';
import { Plus, ShoppingBag, ChevronDown, ChevronRight, Trash2, FlaskConical, CheckCircle2, Archive } from 'lucide-react';
import toast from 'react-hot-toast';

// ── Types ──────────────────────────────────────────────────────────────────

interface Ingredient { id: string; name: string; sku: string; baseUom: string; avgCostPen: string; }
interface BOMLine { id: string; ingredientId: string; ingredient: Ingredient; qtyRequired: string; uom: string; wasteFactorPct: string; notes: string | null; }
interface Recipe { id: string; productId: string; version: number; status: string; yieldQty: string; yieldUom: string; bomLines: BOMLine[]; }
interface Product { id: string; name: string; sku: string; basePricePen: string; isActive: boolean; category?: { name: string }; }

// ── Cost helpers ────────────────────────────────────────────────────────────

function computeCosts(recipe: Recipe | null) {
  if (!recipe) return { costLines: [], totalRawCost: 0, effectiveUnitCost: 0 };
  const costLines = recipe.bomLines.map(l => {
    const effectiveQty = Number(l.qtyRequired) * (1 + Number(l.wasteFactorPct) / 100);
    const avgCost = Number(l.ingredient.avgCostPen);
    const lineCost = effectiveQty * avgCost;
    return { ...l, effectiveQty, avgCost, lineCost };
  });
  const totalRawCost = costLines.reduce((s, l) => s + l.lineCost, 0);
  const yieldQty = Number(recipe.yieldQty) || 1;
  return { costLines, totalRawCost, effectiveUnitCost: totalRawCost / yieldQty };
}

const BLANK_BOM_LINE = { ingredientId: '', qtyRequired: '', uom: 'kg', wasteFactorPct: '0', notes: '' };
const BLANK_PRODUCT = { name: '', sku: '', basePricePen: '', description: '', categoryId: '' };
interface ProductCategory { id: string; name: string; slug: string; }

const UOM_OPTIONS = ['kg', 'g', 'litre', 'ml', 'unit', 'dozen', 'box'];

const STATUS_STYLES: Record<string, string> = {
  DRAFT:    'bg-yellow-100 text-yellow-800',
  ACTIVE:   'bg-green-100 text-green-800',
  ARCHIVED: 'bg-gray-100 text-gray-500',
};

// ── Main component ──────────────────────────────────────────────────────────

export default function Products() {
  const qc = useQueryClient();

  // Product create form
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [productForm, setProductForm] = useState(BLANK_PRODUCT);
  const [showNewCategoryInline, setShowNewCategoryInline] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Expanded row recipe editor
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showNewRecipeForm, setShowNewRecipeForm] = useState(false);
  const [recipeForm, setRecipeForm] = useState({ yieldQty: '12', yieldUom: 'unit' });
  const [showBomLineForm, setShowBomLineForm] = useState(false);
  const [newBomLine, setNewBomLine] = useState(BLANK_BOM_LINE);

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: productsData, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.get('/v1/products/').then(r => r.data),
  });

  const { data: categoriesData } = useQuery<{ data: ProductCategory[] }>({
    queryKey: ['product-categories'],
    queryFn: () => api.get('/v1/products/categories').then(r => r.data),
  });

  const { data: ingredientsData } = useQuery({
    queryKey: ['ingredients-list'],
    queryFn: () => api.get('/v1/inventory/ingredients').then(r => r.data),
  });

  const { data: recipeData, isLoading: loadingRecipe } = useQuery<{ data: Recipe | null }>({
    queryKey: ['recipe-by-product', expandedId],
    queryFn: () => api.get(`/v1/production/recipes/by-product/${expandedId}`).then(r => r.data),
    enabled: !!expandedId,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const createProduct = useMutation({
    mutationFn: (body: any) => api.post('/v1/products/', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      toast.success('Producto creado');
      setShowNewProduct(false);
      setProductForm(BLANK_PRODUCT);
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Error al crear'),
  });

  const createCategory = useMutation({
    mutationFn: (name: string) => api.post('/v1/products/categories', { name }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['product-categories'] });
      setProductForm(f => ({ ...f, categoryId: res.data.data.id }));
      setShowNewCategoryInline(false);
      setNewCategoryName('');
      toast.success('Categoría creada');
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Error al crear categoría'),
  });

  const createRecipe = useMutation({
    mutationFn: (body: any) => api.post('/v1/production/recipes', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipe-by-product', expandedId] });
      toast.success('Receta creada en borrador');
      setShowNewRecipeForm(false);
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Error al crear receta'),
  });

  const updateBom = useMutation({
    mutationFn: ({ id, lines }: { id: string; lines: any[] }) =>
      api.put(`/v1/production/recipes/${id}/bom`, { lines }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipe-by-product', expandedId] });
      toast.success('Receta actualizada');
      setShowBomLineForm(false);
      setNewBomLine(BLANK_BOM_LINE);
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Error al guardar'),
  });

  const deleteBomLine = useMutation({
    mutationFn: ({ recipeId, lineId }: { recipeId: string; lineId: string }) =>
      api.delete(`/v1/production/recipes/${recipeId}/bom-lines/${lineId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipe-by-product', expandedId] });
      toast.success('Línea eliminada');
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Error al eliminar'),
  });

  const changeStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/v1/production/recipes/${id}/status`, { status }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['recipe-by-product', expandedId] });
      toast.success(vars.status === 'ACTIVE' ? 'Receta activada ✓' : 'Receta archivada');
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Error'),
  });

  // ── BOM line helpers ──────────────────────────────────────────────────────

  const recipe = recipeData?.data ?? null;
  const { costLines, totalRawCost, effectiveUnitCost } = computeCosts(recipe);
  const ingredients: Ingredient[] = ingredientsData?.data ?? [];

  const handleAddBomLine = () => {
    if (!recipe || !newBomLine.ingredientId || !newBomLine.qtyRequired) {
      toast.error('Completa el ingrediente y la cantidad');
      return;
    }
    const existingLines = recipe.bomLines.map(l => ({
      ingredientId: l.ingredientId,
      qtyRequired: Number(l.qtyRequired),
      uom: l.uom,
      wasteFactorPct: Number(l.wasteFactorPct),
      notes: l.notes,
    }));
    updateBom.mutate({
      id: recipe.id,
      lines: [...existingLines, {
        ingredientId: newBomLine.ingredientId,
        qtyRequired: Number(newBomLine.qtyRequired),
        uom: newBomLine.uom,
        wasteFactorPct: Number(newBomLine.wasteFactorPct),
        notes: newBomLine.notes || undefined,
      }],
    });
  };

  const handleDeleteLine = (lineId: string) => {
    if (!recipe) return;
    deleteBomLine.mutate({ recipeId: recipe.id, lineId });
  };

  const toggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setShowNewRecipeForm(false);
      setShowBomLineForm(false);
    } else {
      setExpandedId(id);
      setShowNewRecipeForm(false);
      setShowBomLineForm(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Catálogo de productos</h1>
          <p className="text-gray-500 text-sm mt-1">Gestiona productos, recetas y costos de producción</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowNewProduct(v => !v)}>
          <Plus size={16} /> Nuevo producto
        </button>
      </div>

      {/* New product form */}
      {showNewProduct && (
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-gray-800">Nuevo producto</h3>
          <div className="grid grid-cols-2 gap-4">
            {[
              { key: 'name', label: 'Nombre', type: 'text' },
              { key: 'sku', label: 'SKU', type: 'text' },
              { key: 'basePricePen', label: 'Precio base (S/)', type: 'number' },
              { key: 'description', label: 'Descripción', type: 'text' },
            ].map(({ key, label, type }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                <input
                  className="input" type={type} step={type === 'number' ? '0.01' : undefined}
                  value={(productForm as any)[key]}
                  onChange={e => setProductForm(f => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
            {/* Category selector */}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Categoría <span className="text-red-400">*</span>
              </label>
              {!showNewCategoryInline ? (
                <div className="flex gap-2">
                  <select
                    className="input flex-1"
                    value={productForm.categoryId}
                    onChange={e => setProductForm(f => ({ ...f, categoryId: e.target.value }))}
                  >
                    <option value="">— Selecciona una categoría —</option>
                    {(categoriesData?.data ?? []).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn-secondary text-xs whitespace-nowrap"
                    onClick={() => setShowNewCategoryInline(true)}
                  >
                    + Nueva
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    placeholder="Nombre de la categoría"
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="btn-primary text-xs"
                    onClick={() => newCategoryName.trim() && createCategory.mutate(newCategoryName.trim())}
                  >
                    Crear
                  </button>
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    onClick={() => { setShowNewCategoryInline(false); setNewCategoryName(''); }}
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={() => {
              if (!productForm.categoryId) { toast.error('Selecciona una categoría'); return; }
              createProduct.mutate({ ...productForm, basePricePen: parseFloat(productForm.basePricePen) });
            }}>
              Guardar
            </button>
            <button className="btn-secondary" onClick={() => setShowNewProduct(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Product table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <ShoppingBag size={18} className="text-gray-400" />
          <h2 className="font-semibold text-gray-800">Productos</h2>
          <span className="ml-auto text-sm text-gray-400">{productsData?.data?.length ?? 0} items</span>
          <span className="text-xs text-gray-400">· Haz clic en una fila para ver la receta</span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Cargando...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-brand-50 text-brand-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-3 text-left w-8"></th>
                  <th className="px-5 py-3 text-left">Nombre</th>
                  <th className="px-5 py-3 text-left">SKU</th>
                  <th className="px-5 py-3 text-right">Precio base</th>
                  <th className="px-5 py-3 text-left">Categoría</th>
                  <th className="px-5 py-3 text-left">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(productsData?.data ?? []).map((p: Product) => (
                  <ProductRowGroup
                    key={p.id}
                    product={p}
                    isExpanded={expandedId === p.id}
                    onToggle={() => toggleExpand(p.id)}
                    loadingRecipe={loadingRecipe && expandedId === p.id}
                    recipe={expandedId === p.id ? recipe : null}
                    costLines={expandedId === p.id ? costLines : []}
                    totalRawCost={expandedId === p.id ? totalRawCost : 0}
                    effectiveUnitCost={expandedId === p.id ? effectiveUnitCost : 0}
                    ingredients={ingredients}
                    showNewRecipeForm={showNewRecipeForm}
                    setShowNewRecipeForm={setShowNewRecipeForm}
                    recipeForm={recipeForm}
                    setRecipeForm={setRecipeForm}
                    showBomLineForm={showBomLineForm}
                    setShowBomLineForm={setShowBomLineForm}
                    newBomLine={newBomLine}
                    setNewBomLine={setNewBomLine}
                    onCreateRecipe={() => createRecipe.mutate({ productId: p.id, yieldQty: Number(recipeForm.yieldQty), yieldUom: recipeForm.yieldUom })}
                    onAddBomLine={handleAddBomLine}
                    onDeleteBomLine={handleDeleteLine}
                    onChangeStatus={(status) => recipe && changeStatus.mutate({ id: recipe.id, status })}
                    savingBom={updateBom.isPending}
                    savingStatus={changeStatus.isPending}
                  />
                ))}
              </tbody>
            </table>
            {!productsData?.data?.length && (
              <p className="text-center text-gray-400 py-8">Sin productos. ¡Crea el primero!</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-component: product row + expandable recipe panel ────────────────────

function ProductRowGroup({
  product, isExpanded, onToggle,
  loadingRecipe, recipe, costLines, totalRawCost, effectiveUnitCost,
  ingredients,
  showNewRecipeForm, setShowNewRecipeForm, recipeForm, setRecipeForm,
  showBomLineForm, setShowBomLineForm, newBomLine, setNewBomLine,
  onCreateRecipe, onAddBomLine, onDeleteBomLine, onChangeStatus,
  savingBom, savingStatus,
}: any) {

  const fmtS = (v: number) => `S/ ${v.toLocaleString('es-PE', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
  const fmtQty = (v: number) => v.toLocaleString('es-PE', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  return (
    <>
      {/* Product row */}
      <tr
        className={`table-row-hover cursor-pointer transition-colors ${isExpanded ? 'bg-brand-50' : ''}`}
        onClick={onToggle}
      >
        <td className="px-5 py-3 text-gray-400">
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </td>
        <td className="px-5 py-3 font-medium">{product.name}</td>
        <td className="px-5 py-3 font-mono text-gray-500">{product.sku}</td>
        <td className="px-5 py-3 text-right font-mono">S/ {Number(product.basePricePen).toFixed(2)}</td>
        <td className="px-5 py-3 text-gray-500">{product.category?.name ?? '—'}</td>
        <td className="px-5 py-3">
          <span className={`badge ${product.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {product.isActive ? 'Activo' : 'Inactivo'}
          </span>
        </td>
      </tr>

      {/* Expandable recipe panel */}
      {isExpanded && (
        <tr>
          <td colSpan={6} className="p-0 border-b border-brand-200">
            <div className="bg-gradient-to-b from-brand-50 to-white px-6 py-5 space-y-4">

              {/* Loading */}
              {loadingRecipe && (
                <div className="text-center py-6 text-gray-400 text-sm">Cargando receta...</div>
              )}

              {/* No recipe */}
              {!loadingRecipe && !recipe && (
                <div className="text-center py-4">
                  <FlaskConical size={32} className="mx-auto text-gray-300 mb-2" />
                  <p className="text-gray-500 text-sm mb-3">Este producto no tiene receta definida</p>
                  {!showNewRecipeForm ? (
                    <button className="btn-primary text-sm py-1.5 px-4" onClick={(e) => { e.stopPropagation(); setShowNewRecipeForm(true); }}>
                      + Crear receta
                    </button>
                  ) : (
                    <div className="inline-flex flex-col items-start gap-3 bg-white border border-brand-200 rounded-xl p-4 text-left" onClick={e => e.stopPropagation()}>
                      <p className="text-sm font-semibold text-gray-700">Nueva receta — Rendimiento</p>
                      <div className="flex items-end gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Cantidad que rinde</label>
                          <input className="input w-28" type="number" min="0.001" step="0.001"
                            value={recipeForm.yieldQty}
                            onChange={e => setRecipeForm((f: any) => ({ ...f, yieldQty: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Unidad</label>
                          <select className="input w-28"
                            value={recipeForm.yieldUom}
                            onChange={e => setRecipeForm((f: any) => ({ ...f, yieldUom: e.target.value }))}
                          >
                            {UOM_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </div>
                        <button className="btn-primary text-sm py-2 px-4" onClick={onCreateRecipe}>
                          Crear
                        </button>
                        <button className="btn-secondary text-sm py-2 px-3" onClick={() => setShowNewRecipeForm(false)}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Recipe editor */}
              {!loadingRecipe && recipe && (
                <div onClick={e => e.stopPropagation()}>
                  {/* Recipe header */}
                  <div className="flex items-center gap-3 mb-4">
                    <FlaskConical size={16} className="text-brand-600" />
                    <span className="font-semibold text-gray-800">Receta v{recipe.version}</span>
                    <span className={`badge ${STATUS_STYLES[recipe.status] ?? 'bg-gray-100 text-gray-500'}`}>{recipe.status}</span>
                    <span className="text-xs text-gray-400">Rinde: {fmtQty(Number(recipe.yieldQty))} {recipe.yieldUom}</span>
                    <div className="ml-auto flex gap-2">
                      {recipe.status === 'DRAFT' && (
                        <button
                          className="flex items-center gap-1.5 text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
                          disabled={savingStatus}
                          onClick={() => onChangeStatus('ACTIVE')}
                        >
                          <CheckCircle2 size={13} /> Activar receta
                        </button>
                      )}
                      {recipe.status === 'ACTIVE' && (
                        <button
                          className="flex items-center gap-1.5 text-xs bg-gray-500 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
                          disabled={savingStatus}
                          onClick={() => onChangeStatus('ARCHIVED')}
                        >
                          <Archive size={13} /> Archivar
                        </button>
                      )}
                    </div>
                  </div>

                  {/* BOM table */}
                  <div className="card overflow-hidden mb-3">
                    <table className="w-full text-xs">
                      <thead className="bg-brand-50 text-brand-600 uppercase tracking-wide">
                        <tr>
                          <th className="px-4 py-2 text-left">Ingrediente</th>
                          <th className="px-4 py-2 text-right">Cantidad</th>
                          <th className="px-4 py-2 text-left">UOM</th>
                          <th className="px-4 py-2 text-right">Merma %</th>
                          <th className="px-4 py-2 text-right">Qty efectiva</th>
                          <th className="px-4 py-2 text-right">Costo/unit</th>
                          <th className="px-4 py-2 text-right">Costo línea</th>
                          <th className="px-4 py-2 text-center w-8"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {costLines.length === 0 && (
                          <tr>
                            <td colSpan={8} className="px-4 py-4 text-center text-gray-400">
                              Sin ingredientes — agrega el primero abajo
                            </td>
                          </tr>
                        )}
                        {costLines.map((l: any) => (
                          <tr key={l.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2 font-medium">{l.ingredient.name}
                              <span className="text-gray-400 font-normal ml-1">({l.ingredient.sku})</span>
                            </td>
                            <td className="px-4 py-2 text-right font-mono">{fmtQty(Number(l.qtyRequired))}</td>
                            <td className="px-4 py-2 text-gray-500">{l.uom}</td>
                            <td className="px-4 py-2 text-right text-orange-600">{Number(l.wasteFactorPct).toFixed(1)}%</td>
                            <td className="px-4 py-2 text-right font-mono text-gray-600">{fmtQty(l.effectiveQty)}</td>
                            <td className="px-4 py-2 text-right font-mono text-gray-500">
                              {l.avgCost > 0 ? fmtS(l.avgCost) : <span className="text-gray-300">sin costo</span>}
                            </td>
                            <td className="px-4 py-2 text-right font-mono font-medium">{fmtS(l.lineCost)}</td>
                            <td className="px-4 py-2 text-center">
                              <button
                                className="text-gray-300 hover:text-red-500 transition-colors"
                                onClick={() => onDeleteBomLine(l.id)}
                                title="Eliminar"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}

                        {/* Add BOM line form row */}
                        {showBomLineForm && (
                          <tr className="bg-brand-50/60">
                            <td className="px-4 py-2">
                              <select className="input text-xs py-1"
                                value={newBomLine.ingredientId}
                                onChange={e => setNewBomLine((f: any) => ({ ...f, ingredientId: e.target.value }))}
                              >
                                <option value="">Seleccionar ingrediente...</option>
                                {ingredients.filter((i: Ingredient) => !recipe.bomLines.find((l: BOMLine) => l.ingredientId === i.id)).map((i: Ingredient) => (
                                  <option key={i.id} value={i.id}>{i.name} ({i.sku})</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-4 py-2">
                              <input className="input text-xs py-1 w-24 text-right" type="number" step="0.001" min="0.001"
                                value={newBomLine.qtyRequired}
                                onChange={e => setNewBomLine((f: any) => ({ ...f, qtyRequired: e.target.value }))}
                                placeholder="Cant."
                              />
                            </td>
                            <td className="px-4 py-2">
                              <select className="input text-xs py-1 w-20"
                                value={newBomLine.uom}
                                onChange={e => setNewBomLine((f: any) => ({ ...f, uom: e.target.value }))}
                              >
                                {UOM_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                              </select>
                            </td>
                            <td className="px-4 py-2">
                              <input className="input text-xs py-1 w-20 text-right" type="number" step="0.1" min="0" max="100"
                                value={newBomLine.wasteFactorPct}
                                onChange={e => setNewBomLine((f: any) => ({ ...f, wasteFactorPct: e.target.value }))}
                                placeholder="Merma %"
                              />
                            </td>
                            <td colSpan={3} className="px-4 py-2">
                              <input className="input text-xs py-1 w-full" type="text"
                                value={newBomLine.notes}
                                onChange={e => setNewBomLine((f: any) => ({ ...f, notes: e.target.value }))}
                                placeholder="Nota (opcional)"
                              />
                            </td>
                            <td className="px-4 py-2 text-center">
                              <button
                                className="text-green-600 hover:text-green-800 font-bold text-base leading-none"
                                title="Confirmar"
                                onClick={onAddBomLine}
                                disabled={savingBom}
                              >
                                ✓
                              </button>
                            </td>
                          </tr>
                        )}

                        {/* Cost summary row */}
                        {costLines.length > 0 && (
                          <tr className="bg-brand-50 font-semibold text-sm">
                            <td className="px-4 py-2.5 text-gray-600" colSpan={6}>
                              Costo total de insumos → {fmtQty(Number(recipe.yieldQty))} {recipe.yieldUom}
                              <span className="ml-3 font-normal text-xs text-gray-400">
                                Costo efectivo por unidad: <span className="font-semibold text-brand-700">{fmtS(effectiveUnitCost)}</span>
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-brand-700">{fmtS(totalRawCost)}</td>
                            <td></td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Add ingredient button */}
                  {!showBomLineForm && (
                    <button
                      className="text-xs text-brand-600 hover:text-brand-800 font-medium flex items-center gap-1.5 transition-colors"
                      onClick={() => setShowBomLineForm(true)}
                    >
                      <Plus size={13} /> Agregar ingrediente
                    </button>
                  )}
                  {showBomLineForm && (
                    <button
                      className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                      onClick={() => { setShowBomLineForm(false); setNewBomLine(BLANK_BOM_LINE); }}
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
