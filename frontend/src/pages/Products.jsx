import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Search, Plus, Edit, Trash2, ChevronDown, ChevronRight, Package, FolderPlus, Image, Save, X, Upload, Radar, FileArchive } from 'lucide-react'
import toast from 'react-hot-toast'
import api, { getImageUrl } from '../api'

export default function Products() {
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [selectedCat, setSelectedCat] = useState(null)
  const [selectedSubcat, setSelectedSubcat] = useState(null)
  const [expandedCats, setExpandedCats] = useState({})
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [fetchingImages, setFetchingImages] = useState(false)

  // Edit states
  const [editingProduct, setEditingProduct] = useState(null)
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [showAddSubcat, setShowAddSubcat] = useState(null)
  const [newSubcatName, setNewSubcatName] = useState('')
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [newProduct, setNewProduct] = useState({ sku: '', name: '', description: '', list_price: 0, subcategory_id: '' })

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput); setPage(1) }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const loadCategories = useCallback(async () => {
    try {
      const cats = await api.getCategories()
      setCategories(cats)
    } catch (err) { console.error(err) }
  }, [])

  const loadProducts = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page, limit: 50 }
      if (selectedSubcat) params.subcategory_id = selectedSubcat
      else if (selectedCat) params.category_id = selectedCat
      if (search) params.search = search
      const res = await api.getProducts(params)
      setProducts(res.products || [])
      setTotal(res.total || 0)
    } catch (err) { toast.error('Failed to load products') }
    setLoading(false)
  }, [selectedCat, selectedSubcat, search, page])

  useEffect(() => { loadCategories() }, [loadCategories])
  useEffect(() => { loadProducts() }, [loadProducts])

  async function handleCreateCategory() {
    if (!newCatName.trim()) return
    try {
      await api.createCategory({ name: newCatName.trim() })
      setNewCatName('')
      setShowAddCategory(false)
      loadCategories()
      toast.success('Category created')
    } catch (err) { toast.error(err.message) }
  }

  async function handleDeleteCategory(catId) {
    if (!confirm('Delete this category and ALL its products?')) return
    try {
      await api.deleteCategory(catId)
      if (selectedCat === catId) { setSelectedCat(null); setSelectedSubcat(null) }
      loadCategories()
      loadProducts()
      toast.success('Category deleted')
    } catch (err) { toast.error(err.message) }
  }

  async function handleCreateSubcategory(catId) {
    if (!newSubcatName.trim()) return
    try {
      await api.createSubcategory({ category_id: catId, name: newSubcatName.trim() })
      setNewSubcatName('')
      setShowAddSubcat(null)
      loadCategories()
      toast.success('Subcategory created')
    } catch (err) { toast.error(err.message) }
  }

  async function handleDeleteSubcategory(subId) {
    if (!confirm('Delete this subcategory and ALL its products?')) return
    try {
      await api.deleteSubcategory(subId)
      if (selectedSubcat === subId) setSelectedSubcat(null)
      loadCategories()
      loadProducts()
      toast.success('Subcategory deleted')
    } catch (err) { toast.error(err.message) }
  }

  async function handleAddProduct() {
    if (!newProduct.sku.trim() || !newProduct.name.trim() || !newProduct.subcategory_id) {
      toast.error('SKU, Name, and Subcategory are required')
      return
    }
    try {
      await api.createProduct(newProduct)
      setNewProduct({ sku: '', name: '', description: '', list_price: 0, subcategory_id: '' })
      setShowAddProduct(false)
      loadProducts()
      loadCategories()
      toast.success('Product added')
    } catch (err) { toast.error(err.message) }
  }

  async function handleSaveProduct(product) {
    try {
      await api.updateProduct(product.id, {
        sku: product.sku, name: product.name, description: product.description,
        list_price: product.list_price, subcategory_id: product.subcategory_id,
      })
      setEditingProduct(null)
      loadProducts()
      toast.success('Product updated')
    } catch (err) { toast.error(err.message) }
  }

  async function handleDeleteProduct(productId) {
    if (!confirm('Delete this product?')) return
    try {
      await api.deleteProduct(productId)
      loadProducts()
      loadCategories()
      toast.success('Product deleted')
    } catch (err) { toast.error(err.message) }
  }

  async function handleFetchAllImages() {
    setFetchingImages(true)
    try {
      const result = await api.fetchAllImages()
      toast.success(`Fetched ${result.fetched} images (${result.failed} failed)`)
      loadProducts()
    } catch (err) { toast.error(err.message) }
    setFetchingImages(false)
  }

  async function handleDiscoverImages() {
    setFetchingImages(true)
    toast('Discovering images from Verkada CDN... This may take a few minutes.', { duration: 5000, icon: '🔍' })
    try {
      const result = await api.discoverImages()
      const msg = `Discovered: ${result.discovered}, Not found: ${result.failed}, Skipped: ${result.skipped}`
      if (result.discovered > 0) {
        toast.success(msg, { duration: 8000 })
      } else {
        toast(msg, { duration: 8000, icon: 'ℹ️' })
      }
      loadProducts()
    } catch (err) { toast.error(err.message) }
    setFetchingImages(false)
  }

  async function handleUploadZip(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = '' // reset input
    setFetchingImages(true)
    toast('Processing ZIP file... Matching images to products.', { duration: 5000, icon: '📦' })
    try {
      const result = await api.uploadImageZip(file)
      const msg = `Matched: ${result.matched} products, Unmatched: ${result.unmatched} images, Skipped: ${result.skipped_existing} existing`
      if (result.matched > 0) {
        toast.success(msg, { duration: 8000 })
      } else {
        toast(msg, { duration: 8000, icon: 'ℹ️' })
      }
      loadProducts()
    } catch (err) { toast.error(err.message) }
    setFetchingImages(false)
  }

  const fmt = (n) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const totalPages = Math.ceil(total / 50)

  // Build flat subcategory list for dropdowns
  const allSubcats = categories.flatMap(c => (c.subcategories || []).map(s => ({ ...s, catName: c.name })))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-brand-900">Products & Inventory</h1>
        <div className="flex items-center gap-2">
          <label className={`flex items-center gap-1.5 px-3 py-2 text-sm border border-orange-300 bg-orange-50 text-orange-700 rounded-lg hover:bg-orange-100 cursor-pointer ${fetchingImages ? 'opacity-50 pointer-events-none' : ''}`}>
            <FileArchive size={15} /> {fetchingImages ? 'Processing...' : 'Upload Image ZIP'}
            <input type="file" accept=".zip" onChange={handleUploadZip} className="hidden" disabled={fetchingImages} />
          </label>
          <button onClick={handleDiscoverImages} disabled={fetchingImages}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-brand-300 bg-brand-50 text-brand-700 rounded-lg hover:bg-brand-100 disabled:opacity-50">
            <Radar size={15} /> {fetchingImages ? 'Discovering...' : 'Discover Images'}
          </button>
          <button onClick={handleFetchAllImages} disabled={fetchingImages}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
            <Image size={15} /> {fetchingImages ? 'Fetching...' : 'Fetch Images'}
          </button>
          <Link to="/products/import" className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            <Upload size={15} /> Import
          </Link>
          <button onClick={() => setShowAddProduct(true)} className="flex items-center gap-1.5 bg-brand-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-800">
            <Plus size={15} /> Add Product
          </button>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Category sidebar */}
        <div className="w-60 shrink-0 hidden md:block">
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Categories</h3>
              <button onClick={() => setShowAddCategory(true)} className="text-gray-400 hover:text-brand-600">
                <FolderPlus size={15} />
              </button>
            </div>

            <button onClick={() => { setSelectedCat(null); setSelectedSubcat(null); setPage(1) }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${!selectedCat && !selectedSubcat ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}>
              <Package size={15} /> All Products
              <span className="ml-auto text-xs text-gray-400">{total}</span>
            </button>

            {categories.map(cat => (
              <div key={cat.id} className="group">
                <div className="flex items-center">
                  <button onClick={() => { setExpandedCats(prev => ({ ...prev, [cat.id]: !prev[cat.id] })); setSelectedCat(cat.id); setSelectedSubcat(null); setPage(1) }}
                    className={`flex-1 flex items-center gap-1 px-3 py-2 text-sm rounded-lg transition-colors ${selectedCat === cat.id && !selectedSubcat ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}>
                    {expandedCats[cat.id] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    <span className="truncate">{cat.name}</span>
                    <span className="ml-auto text-xs text-gray-400">{cat.product_count}</span>
                  </button>
                  <button onClick={() => handleDeleteCategory(cat.id)} className="p-1 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500">
                    <Trash2 size={12} />
                  </button>
                </div>
                {expandedCats[cat.id] && (
                  <div className="ml-4">
                    {cat.subcategories?.map(sub => (
                      <div key={sub.id} className="flex items-center group/sub">
                        <button onClick={() => { setSelectedSubcat(sub.id); setSelectedCat(cat.id); setPage(1) }}
                          className={`flex-1 text-left px-3 py-1.5 text-xs rounded-lg ${selectedSubcat === sub.id ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-500 hover:bg-gray-100'}`}>
                          {sub.name} ({sub.product_count})
                        </button>
                        <button onClick={() => handleDeleteSubcategory(sub.id)} className="p-0.5 opacity-0 group-hover/sub:opacity-100 text-gray-300 hover:text-red-500">
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                    <div className="px-2 py-1">
                      {showAddSubcat === cat.id ? (
                        <div className="flex gap-1">
                          <input type="text" value={newSubcatName} onChange={e => setNewSubcatName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleCreateSubcategory(cat.id)}
                            placeholder="Subcategory name" className="flex-1 px-2 py-1 text-xs border rounded focus:outline-none focus:border-brand-500" autoFocus />
                          <button onClick={() => handleCreateSubcategory(cat.id)} className="text-brand-600 text-xs font-medium">Add</button>
                          <button onClick={() => setShowAddSubcat(null)} className="text-gray-400 text-xs">X</button>
                        </div>
                      ) : (
                        <button onClick={() => setShowAddSubcat(cat.id)} className="text-xs text-gray-400 hover:text-brand-600 flex items-center gap-1">
                          <Plus size={11} /> Add subcategory
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {showAddCategory && (
              <div className="mt-2 p-2 bg-gray-50 rounded-lg">
                <input type="text" value={newCatName} onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreateCategory()}
                  placeholder="Category name" className="w-full px-2 py-1.5 text-sm border rounded focus:outline-none focus:border-brand-500" autoFocus />
                <div className="flex gap-1 mt-1.5">
                  <button onClick={handleCreateCategory} className="flex-1 bg-brand-900 text-white text-xs py-1 rounded hover:bg-brand-800">Create</button>
                  <button onClick={() => { setShowAddCategory(false); setNewCatName('') }} className="flex-1 text-xs py-1 rounded border hover:bg-gray-100">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Product list */}
        <div className="flex-1 min-w-0">
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" value={searchInput} onChange={e => setSearchInput(e.target.value)}
              placeholder="Search by SKU, name, or description..."
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-400">Loading...</div>
          ) : products.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <Package size={48} className="mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500 mb-4">No products found</p>
              <Link to="/products/import" className="inline-flex items-center gap-2 bg-brand-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-brand-800">
                <Upload size={15} /> Import Products
              </Link>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 uppercase border-b border-gray-200">
                      <th className="px-4 py-2.5 text-left w-12"></th>
                      <th className="px-4 py-2.5 text-left">SKU</th>
                      <th className="px-4 py-2.5 text-left">Name / Description</th>
                      <th className="px-4 py-2.5 text-left">Category</th>
                      <th className="px-4 py-2.5 text-right">List Price</th>
                      <th className="px-4 py-2.5 w-20"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {products.map(product => (
                      <tr key={product.id} className="hover:bg-gray-50 group">
                        <td className="px-4 py-2.5">
                          {getImageUrl(product) ? (
                            <img src={getImageUrl(product)} className="w-10 h-10 object-contain rounded" onError={e => e.target.style.display = 'none'} />
                          ) : (
                            <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center"><Package size={16} className="text-gray-300" /></div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{product.sku}</td>
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-sm">{product.name}</p>
                          {product.description && product.description !== product.name && (
                            <p className="text-xs text-gray-400 truncate max-w-md">{product.description}</p>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-500">
                          <span className="bg-gray-100 px-2 py-0.5 rounded">{product.category_name}</span>
                          <span className="text-gray-300 mx-1">/</span>
                          <span>{product.subcategory_name}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold">{fmt(product.list_price)}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                            <button onClick={() => setEditingProduct({ ...product })} className="p-1 text-gray-400 hover:text-brand-600">
                              <Edit size={14} />
                            </button>
                            <button onClick={() => handleDeleteProduct(product.id)} className="p-1 text-gray-400 hover:text-red-500">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-gray-500">{total} products total</p>
                  <div className="flex gap-1">
                    {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i + 1).map(p => (
                      <button key={p} onClick={() => setPage(p)}
                        className={`px-3 py-1 rounded text-sm ${p === page ? 'bg-brand-900 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>{p}</button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Edit product modal */}
      {editingProduct && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-brand-900">Edit Product</h3>
              <button onClick={() => setEditingProduct(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500">SKU</label>
                <input type="text" value={editingProduct.sku} onChange={e => setEditingProduct(p => ({ ...p, sku: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Name</label>
                <input type="text" value={editingProduct.name} onChange={e => setEditingProduct(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Description</label>
                <textarea value={editingProduct.description || ''} onChange={e => setEditingProduct(p => ({ ...p, description: e.target.value }))} rows={2}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">List Price</label>
                <input type="number" step="0.01" value={editingProduct.list_price} onChange={e => setEditingProduct(p => ({ ...p, list_price: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Subcategory</label>
                <select value={editingProduct.subcategory_id} onChange={e => setEditingProduct(p => ({ ...p, subcategory_id: parseInt(e.target.value) }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-brand-500">
                  {allSubcats.map(s => <option key={s.id} value={s.id}>{s.catName} &gt; {s.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => handleSaveProduct(editingProduct)} className="flex-1 flex items-center justify-center gap-2 bg-brand-900 text-white py-2 rounded-lg text-sm font-medium hover:bg-brand-800">
                <Save size={15} /> Save
              </button>
              <button onClick={() => setEditingProduct(null)} className="flex-1 py-2 rounded-lg text-sm border hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Add product modal */}
      {showAddProduct && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-brand-900">Add New Product</h3>
              <button onClick={() => setShowAddProduct(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500">Subcategory *</label>
                <select value={newProduct.subcategory_id} onChange={e => setNewProduct(p => ({ ...p, subcategory_id: parseInt(e.target.value) || '' }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-brand-500">
                  <option value="">Select category...</option>
                  {allSubcats.map(s => <option key={s.id} value={s.id}>{s.catName} &gt; {s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">SKU *</label>
                <input type="text" value={newProduct.sku} onChange={e => setNewProduct(p => ({ ...p, sku: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-brand-500" placeholder="e.g., CD43-E-HW" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Name *</label>
                <input type="text" value={newProduct.name} onChange={e => setNewProduct(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-brand-500" placeholder="Product name" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Description</label>
                <textarea value={newProduct.description} onChange={e => setNewProduct(p => ({ ...p, description: e.target.value }))} rows={2}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">List Price</label>
                <input type="number" step="0.01" value={newProduct.list_price} onChange={e => setNewProduct(p => ({ ...p, list_price: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-brand-500" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={handleAddProduct} className="flex-1 flex items-center justify-center gap-2 bg-brand-900 text-white py-2 rounded-lg text-sm font-medium hover:bg-brand-800">
                <Plus size={15} /> Add Product
              </button>
              <button onClick={() => setShowAddProduct(false)} className="flex-1 py-2 rounded-lg text-sm border hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
