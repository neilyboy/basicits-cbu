import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Save, Plus, Trash2, Search, X, Package, ChevronDown, ChevronRight, ShoppingCart, Minus, ArrowLeft, Shield, Wrench, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import api, { getImageUrl } from '../api'

export default function CbuEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEditing = !!id

  const [form, setForm] = useState({
    project_name: '', client_name: '', address: '', description: '',
    created_by: '', verbal_narrative: '', folder_id: null, status: 'draft',
  })
  const [items, setItems] = useState([])
  const [miscCharges, setMiscCharges] = useState([])
  const [folders, setFolders] = useState([])
  const [saving, setSaving] = useState(false)

  // Hardware picker state
  const [showPicker, setShowPicker] = useState(false)
  const [categories, setCategories] = useState([])
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerProducts, setPickerProducts] = useState([])
  const [expandedCats, setExpandedCats] = useState({})
  const [selectedSubcat, setSelectedSubcat] = useState(null)
  const [cart, setCart] = useState([])

  // Configure step state (accessories + licenses)
  const [configuring, setConfiguring] = useState(null) // the hardware product being configured
  const [relatedData, setRelatedData] = useState({ licenses: [], accessories: [] })
  const [selectedLicense, setSelectedLicense] = useState(null)
  const [selectedAccessories, setSelectedAccessories] = useState({}) // { productId: quantity }
  const [loadingRelated, setLoadingRelated] = useState(false)
  const [configQty, setConfigQty] = useState(1)

  useEffect(() => {
    api.getFolders().then(f => setFolders(flattenFolders(f))).catch(() => {})
    api.getCategories().then(setCategories).catch(() => {})
    if (isEditing) loadCbu()
  }, [id])

  function flattenFolders(tree, depth = 0) {
    let result = []
    for (const f of tree) {
      result.push({ ...f, depth })
      if (f.children) result.push(...flattenFolders(f.children, depth + 1))
    }
    return result
  }

  async function loadCbu() {
    try {
      const cbu = await api.getCbu(id)
      setForm({
        project_name: cbu.project_name || '',
        client_name: cbu.client_name || '',
        address: cbu.address || '',
        description: cbu.description || '',
        created_by: cbu.created_by || '',
        verbal_narrative: cbu.verbal_narrative || '',
        folder_id: cbu.folder_id || null,
        status: cbu.status || 'draft',
      })
      setItems(cbu.items || [])
      setMiscCharges(cbu.misc_charges || [])
    } catch (err) {
      toast.error('Failed to load CBU')
      navigate('/cbus')
    }
  }

  async function handleSave() {
    if (!form.project_name.trim()) {
      toast.error('Project name is required')
      return
    }
    setSaving(true)
    try {
      let cbuId = id
      if (isEditing) {
        await api.updateCbu(id, form)
      } else {
        const result = await api.createCbu(form)
        cbuId = result.id
      }

      // If creating new, add all items
      if (!isEditing && items.length > 0) {
        await api.addCbuItems(cbuId, items.map(i => ({
          product_id: i.product_id, sku: i.sku, name: i.name,
          description: i.description, list_price: i.list_price,
          quantity: i.quantity, item_type: i.item_type || 'product',
        })))
      }

      // Add misc charges for new CBUs
      if (!isEditing) {
        for (const charge of miscCharges) {
          await api.addMiscCharge(cbuId, { name: charge.name, description: charge.description, amount: charge.amount })
        }
      }

      toast.success(isEditing ? 'CBU updated' : 'CBU created')
      navigate(`/cbus/${cbuId}`)
    } catch (err) {
      toast.error(err.message)
    }
    setSaving(false)
  }

  // Item management for existing CBUs (live save)
  async function handleAddItemsFromCart() {
    if (cart.length === 0) return
    const newItems = cart.map(c => ({
      product_id: c.id, sku: c.sku, name: c.name,
      description: c.description, list_price: c.list_price,
      quantity: c.quantity || 1, item_type: 'product',
    }))

    if (isEditing) {
      try {
        const results = await api.addCbuItems(id, newItems)
        await loadCbu()
        toast.success(`${cart.length} item(s) added`)
      } catch (err) {
        toast.error(err.message)
      }
    } else {
      setItems(prev => [...prev, ...newItems.map((item, idx) => ({ ...item, _tempId: Date.now() + idx }))])
    }
    setCart([])
    setShowPicker(false)
  }

  async function handleRemoveItem(item) {
    if (isEditing && item.id) {
      try {
        await api.deleteCbuItem(id, item.id)
        await loadCbu()
        toast.success('Item removed')
      } catch (err) {
        toast.error(err.message)
      }
    } else {
      setItems(prev => prev.filter(i => i !== item))
    }
  }

  async function handleUpdateItemQty(item, qty) {
    if (qty < 1) return
    if (isEditing && item.id) {
      try {
        await api.updateCbuItem(id, item.id, { quantity: qty })
        await loadCbu()
      } catch (err) {
        toast.error(err.message)
      }
    } else {
      setItems(prev => prev.map(i => i === item ? { ...i, quantity: qty } : i))
    }
  }

  // Misc charges
  async function handleAddMiscCharge() {
    const charge = { name: 'New Charge', description: '', amount: 0 }
    if (isEditing) {
      try {
        await api.addMiscCharge(id, charge)
        await loadCbu()
      } catch (err) {
        toast.error(err.message)
      }
    } else {
      setMiscCharges(prev => [...prev, { ...charge, _tempId: Date.now() }])
    }
  }

  async function handleUpdateMiscCharge(charge, field, value) {
    if (isEditing && charge.id) {
      try {
        await api.updateMiscCharge(id, charge.id, { [field]: value })
        await loadCbu()
      } catch (err) {
        toast.error(err.message)
      }
    } else {
      setMiscCharges(prev => prev.map(c => c === charge ? { ...c, [field]: value } : c))
    }
  }

  async function handleRemoveMiscCharge(charge) {
    if (isEditing && charge.id) {
      try {
        await api.deleteMiscCharge(id, charge.id)
        await loadCbu()
      } catch (err) {
        toast.error(err.message)
      }
    } else {
      setMiscCharges(prev => prev.filter(c => c !== charge))
    }
  }

  // Product picker search
  useEffect(() => {
    if (!showPicker) return
    const params = { limit: 50 }
    if (pickerSearch) params.search = pickerSearch
    if (selectedSubcat) params.subcategory_id = selectedSubcat
    api.getProducts(params).then(res => setPickerProducts(res.products || [])).catch(() => {})
  }, [showPicker, pickerSearch, selectedSubcat])

  // Start configuring a hardware product (fetch related accessories/licenses)
  async function startConfigure(product) {
    setConfiguring(product)
    setConfigQty(1)
    setSelectedLicense(null)
    setSelectedAccessories({})
    setLoadingRelated(true)
    try {
      const data = await api.getRelatedProducts(product.id)
      setRelatedData({ licenses: data.licenses || [], accessories: data.accessories || [] })
    } catch (err) {
      setRelatedData({ licenses: [], accessories: [] })
    }
    setLoadingRelated(false)
  }

  function cancelConfigure() {
    setConfiguring(null)
    setRelatedData({ licenses: [], accessories: [] })
    setSelectedLicense(null)
    setSelectedAccessories({})
  }

  function toggleAccessory(product) {
    setSelectedAccessories(prev => {
      const copy = { ...prev }
      if (copy[product.id]) {
        delete copy[product.id]
      } else {
        copy[product.id] = { ...product, quantity: configQty }
      }
      return copy
    })
  }

  function updateAccessoryQty(productId, qty) {
    if (qty < 1) return
    setSelectedAccessories(prev => ({
      ...prev,
      [productId]: { ...prev[productId], quantity: qty }
    }))
  }

  // Confirm configure: add hardware + selected license + selected accessories to cart
  function confirmConfigure() {
    if (!configuring) return
    const newItems = []

    // Add the hardware product
    newItems.push({ ...configuring, quantity: configQty, _itemType: 'hardware' })

    // Add selected license
    if (selectedLicense) {
      newItems.push({ ...selectedLicense, quantity: configQty, _itemType: 'license' })
    }

    // Add selected accessories
    Object.values(selectedAccessories).forEach(acc => {
      newItems.push({ ...acc, _itemType: 'accessory' })
    })

    setCart(prev => {
      let updated = [...prev]
      for (const item of newItems) {
        const existing = updated.find(c => c.id === item.id)
        if (existing) {
          updated = updated.map(c => c.id === item.id ? { ...c, quantity: (c.quantity || 1) + item.quantity } : c)
        } else {
          updated.push(item)
        }
      }
      return updated
    })

    cancelConfigure()
    toast.success(`Added ${configuring.name} with ${selectedLicense ? '1 license' : 'no license'} and ${Object.keys(selectedAccessories).length} accessor${Object.keys(selectedAccessories).length === 1 ? 'y' : 'ies'}`)
  }

  function removeFromCart(productId) {
    setCart(prev => prev.filter(c => c.id !== productId))
  }

  function updateCartQty(productId, qty) {
    if (qty < 1) return removeFromCart(productId)
    setCart(prev => prev.map(c => c.id === productId ? { ...c, quantity: qty } : c))
  }

  const itemsTotal = items.reduce((s, i) => s + (i.list_price * (i.quantity || 1)), 0)
  const miscTotal = miscCharges.reduce((s, c) => s + (c.amount || 0), 0)
  const grandTotal = itemsTotal + miscTotal
  const fmt = (n) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-900">{isEditing ? 'Edit CBU' : 'New Cost Build Up'}</h1>
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-brand-900 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-brand-800 disabled:opacity-50">
          <Save size={16} /> {saving ? 'Saving...' : 'Save CBU'}
        </button>
      </div>

      {/* Project info form */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-brand-900 mb-4">Project Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Project Name *</label>
            <input type="text" value={form.project_name} onChange={e => setForm(f => ({ ...f, project_name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500" placeholder="e.g., Smith Corp Security Upgrade" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Client Name</label>
            <input type="text" value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500" placeholder="Business name" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Address</label>
            <input type="text" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500" placeholder="Business address" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Created By</label>
            <input type="text" value={form.created_by} onChange={e => setForm(f => ({ ...f, created_by: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500" placeholder="Your name" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500" placeholder="Brief project description" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Verbal Installation Narrative</label>
            <textarea value={form.verbal_narrative} onChange={e => setForm(f => ({ ...f, verbal_narrative: e.target.value }))} rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500" placeholder="Describe what's getting installed/upgraded..." />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Folder</label>
            <select value={form.folder_id || ''} onChange={e => setForm(f => ({ ...f, folder_id: e.target.value || null }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-brand-500">
              <option value="">No folder</option>
              {folders.map(f => <option key={f.id} value={f.id}>{'  '.repeat(f.depth)}{f.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-brand-500">
              <option value="draft">Draft</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>
      </div>

      {/* Line items */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-brand-900">Line Items ({items.length})</h2>
          <button onClick={() => setShowPicker(true)} className="flex items-center gap-1.5 bg-brand-900 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-brand-800">
            <Plus size={14} /> Add Hardware
          </button>
        </div>

        {items.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <Package size={36} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No items yet. Click "Add Hardware" to add products.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <th className="px-4 py-2 text-left">#</th>
                  <th className="px-4 py-2 text-left">Item</th>
                  <th className="px-4 py-2 text-left">SKU</th>
                  <th className="px-4 py-2 text-right">Unit Price</th>
                  <th className="px-4 py-2 text-center">Qty</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((item, idx) => (
                  <tr key={item.id || item._tempId || idx} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-400">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {(item.image_url || item.local_image) && (
                          <img src={item.local_image ? `${import.meta.env.VITE_API_URL || 'http://localhost:3099'}/images/${item.local_image}` : item.image_url}
                            className="w-8 h-8 object-contain rounded" onError={e => e.target.style.display = 'none'} />
                        )}
                        <div>
                          <p className="font-medium">{item.name}</p>
                          {item.description && <p className="text-xs text-gray-400 truncate max-w-xs">{item.description}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{item.sku || '-'}</td>
                    <td className="px-4 py-3 text-right">{fmt(item.list_price)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => handleUpdateItemQty(item, (item.quantity || 1) - 1)} className="p-0.5 rounded hover:bg-gray-200"><Minus size={12} /></button>
                        <span className="w-8 text-center font-medium">{item.quantity || 1}</span>
                        <button onClick={() => handleUpdateItemQty(item, (item.quantity || 1) + 1)} className="p-0.5 rounded hover:bg-gray-200"><Plus size={12} /></button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{fmt(item.list_price * (item.quantity || 1))}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleRemoveItem(item)} className="text-gray-300 hover:text-red-500"><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td colSpan={5} className="px-4 py-3 text-right font-semibold text-sm">Items Subtotal:</td>
                  <td className="px-4 py-3 text-right font-bold text-brand-900">{fmt(itemsTotal)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Misc charges */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-brand-900">Additional Charges</h2>
          <button onClick={handleAddMiscCharge} className="flex items-center gap-1.5 text-brand-600 text-xs font-medium hover:text-brand-700">
            <Plus size={14} /> Add Charge
          </button>
        </div>
        {miscCharges.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">No additional charges</div>
        ) : (
          <div className="p-4 space-y-3">
            {miscCharges.map((charge, idx) => (
              <div key={charge.id || charge._tempId || idx} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2">
                  <input type="text" value={charge.name} placeholder="Charge name"
                    onChange={e => handleUpdateMiscCharge(charge, 'name', e.target.value)}
                    onBlur={e => isEditing && charge.id && api.updateMiscCharge(id, charge.id, { name: e.target.value })}
                    className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-brand-500" />
                  <input type="text" value={charge.description || ''} placeholder="Description"
                    onChange={e => handleUpdateMiscCharge(charge, 'description', e.target.value)}
                    onBlur={e => isEditing && charge.id && api.updateMiscCharge(id, charge.id, { description: e.target.value })}
                    className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-brand-500" />
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 text-sm">$</span>
                    <input type="number" value={charge.amount || 0} step="0.01" placeholder="0.00"
                      onChange={e => handleUpdateMiscCharge(charge, 'amount', parseFloat(e.target.value) || 0)}
                      onBlur={e => isEditing && charge.id && api.updateMiscCharge(id, charge.id, { amount: parseFloat(e.target.value) || 0 })}
                      className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm text-right focus:outline-none focus:border-brand-500" />
                  </div>
                </div>
                <button onClick={() => handleRemoveMiscCharge(charge)} className="text-gray-300 hover:text-red-500"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}
        {miscCharges.length > 0 && (
          <div className="px-6 py-3 border-t border-gray-100 flex justify-end">
            <span className="text-sm font-semibold text-brand-900">Misc Subtotal: {fmt(miscTotal)}</span>
          </div>
        )}
      </div>

      {/* Grand total */}
      <div className="bg-gradient-to-r from-brand-900 to-brand-800 rounded-xl p-6 text-white flex justify-between items-center">
        <span className="text-lg font-medium">Grand Total</span>
        <span className="text-3xl font-bold">{fmt(grandTotal)}</span>
      </div>

      {/* Save button bottom */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-brand-900 text-white px-6 py-3 rounded-lg font-medium hover:bg-brand-800 disabled:opacity-50">
          <Save size={18} /> {saving ? 'Saving...' : 'Save Cost Build Up'}
        </button>
      </div>

      {/* Hardware picker modal */}
      {showPicker && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {configuring && (
                  <button onClick={cancelConfigure} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                    <ArrowLeft size={18} />
                  </button>
                )}
                <h3 className="font-semibold text-lg text-brand-900">
                  {configuring ? 'Configure: ' + configuring.name : 'Add Hardware'}
                </h3>
              </div>
              <div className="flex items-center gap-3">
                {cart.length > 0 && !configuring && (
                  <span className="flex items-center gap-1 bg-brand-50 text-brand-700 px-3 py-1 rounded-full text-sm font-medium">
                    <ShoppingCart size={14} /> {cart.reduce((s, c) => s + c.quantity, 0)} items
                  </span>
                )}
                <button onClick={() => { setShowPicker(false); setCart([]); cancelConfigure() }} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
              </div>
            </div>

            {/* STEP 2: Configure accessories + licenses */}
            {configuring ? (
              <div className="flex-1 overflow-y-auto">
                {/* Selected hardware summary */}
                <div className="px-6 py-4 bg-brand-50 border-b border-brand-100">
                  <div className="flex items-center gap-4">
                    {(configuring.local_image || configuring.image_url) && (
                      <img src={getImageUrl(configuring)} className="w-14 h-14 object-contain rounded-lg bg-white p-1" onError={e => e.target.style.display = 'none'} />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-brand-900">{configuring.name}</p>
                      <p className="text-xs text-gray-500">{configuring.sku} &bull; {configuring.category_name}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-brand-900 text-lg">{fmt(configuring.list_price)}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-xs text-gray-500">Qty:</span>
                        <button onClick={() => setConfigQty(q => Math.max(1, q - 1))} className="w-6 h-6 flex items-center justify-center rounded bg-white border hover:bg-gray-50 text-xs"><Minus size={10} /></button>
                        <span className="w-6 text-center text-sm font-semibold">{configQty}</span>
                        <button onClick={() => setConfigQty(q => q + 1)} className="w-6 h-6 flex items-center justify-center rounded bg-white border hover:bg-gray-50 text-xs"><Plus size={10} /></button>
                      </div>
                    </div>
                  </div>
                </div>

                {loadingRelated ? (
                  <div className="p-8 text-center text-gray-400">Loading related products...</div>
                ) : (
                  <div className="px-6 py-4 space-y-6">
                    {/* License selection */}
                    <div>
                      <h4 className="flex items-center gap-2 font-semibold text-sm text-brand-900 mb-3">
                        <Shield size={16} className="text-blue-500" /> Select License
                        {relatedData.licenses.length === 0 && <span className="text-xs text-gray-400 font-normal">(no licenses available for this category)</span>}
                      </h4>
                      {relatedData.licenses.length > 0 && (
                        <div className="space-y-1.5">
                          <label className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition-all">
                            <input type="radio" name="license" checked={!selectedLicense} onChange={() => setSelectedLicense(null)} className="text-brand-600" />
                            <span className="text-sm text-gray-500">No license</span>
                          </label>
                          {relatedData.licenses.map(lic => (
                            <label key={lic.id} className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all cursor-pointer ${selectedLicense?.id === lic.id ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                              <input type="radio" name="license" checked={selectedLicense?.id === lic.id} onChange={() => setSelectedLicense(lic)} className="text-brand-600" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">{lic.name}</p>
                                <p className="text-xs text-gray-500">{lic.sku}{lic.description && lic.description !== lic.name ? ` - ${lic.description}` : ''}</p>
                              </div>
                              <span className="text-sm font-semibold text-brand-900 shrink-0">{fmt(lic.list_price)}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Accessories selection */}
                    <div>
                      <h4 className="flex items-center gap-2 font-semibold text-sm text-brand-900 mb-3">
                        <Wrench size={16} className="text-orange-500" /> Select Accessories
                        {relatedData.accessories.length === 0 && <span className="text-xs text-gray-400 font-normal">(no accessories available for this category)</span>}
                      </h4>
                      {relatedData.accessories.length > 0 && (
                        <div className="space-y-1.5">
                          {relatedData.accessories.map(acc => {
                            const isSelected = !!selectedAccessories[acc.id]
                            return (
                              <div key={acc.id} className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all ${isSelected ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                                <input type="checkbox" checked={isSelected} onChange={() => toggleAccessory(acc)} className="rounded text-orange-600 cursor-pointer" />
                                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleAccessory(acc)}>
                                  <p className="text-sm font-medium">{acc.name}</p>
                                  <p className="text-xs text-gray-500">{acc.sku}{acc.description && acc.description !== acc.name ? ` - ${acc.description}` : ''}</p>
                                </div>
                                <span className="text-sm font-semibold text-brand-900 shrink-0">{fmt(acc.list_price)}</span>
                                {isSelected && (
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button onClick={() => updateAccessoryQty(acc.id, selectedAccessories[acc.id].quantity - 1)} className="w-5 h-5 flex items-center justify-center rounded bg-white border text-xs"><Minus size={10} /></button>
                                    <span className="w-5 text-center text-xs font-medium">{selectedAccessories[acc.id].quantity}</span>
                                    <button onClick={() => updateAccessoryQty(acc.id, selectedAccessories[acc.id].quantity + 1)} className="w-5 h-5 flex items-center justify-center rounded bg-white border text-xs"><Plus size={10} /></button>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {/* Configure summary */}
                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                      <h4 className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">Summary</h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between"><span>{configuring.name} x{configQty}</span><span className="font-medium">{fmt(configuring.list_price * configQty)}</span></div>
                        {selectedLicense && <div className="flex justify-between text-blue-700"><span>{selectedLicense.name} x{configQty}</span><span className="font-medium">{fmt(selectedLicense.list_price * configQty)}</span></div>}
                        {Object.values(selectedAccessories).map(acc => (
                          <div key={acc.id} className="flex justify-between text-orange-700"><span>{acc.name} x{acc.quantity}</span><span className="font-medium">{fmt(acc.list_price * acc.quantity)}</span></div>
                        ))}
                        <div className="border-t border-gray-300 pt-1 mt-2 flex justify-between font-bold">
                          <span>Configuration Total</span>
                          <span>{fmt(
                            (configuring.list_price * configQty) +
                            (selectedLicense ? selectedLicense.list_price * configQty : 0) +
                            Object.values(selectedAccessories).reduce((s, a) => s + a.list_price * a.quantity, 0)
                          )}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Configure footer */}
                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between sticky bottom-0">
                  <button onClick={cancelConfigure} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100">Back to Browse</button>
                  <button onClick={confirmConfigure} className="flex items-center gap-2 bg-brand-900 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-brand-800">
                    <Check size={15} /> Add to Cart
                  </button>
                </div>
              </div>
            ) : (
              /* STEP 1: Browse products */
              <>
                <div className="flex flex-1 min-h-0">
                  {/* Category sidebar */}
                  <div className="w-56 border-r border-gray-200 overflow-y-auto p-3 space-y-0.5 scrollbar-thin">
                    <button onClick={() => setSelectedSubcat(null)} className={`w-full text-left px-3 py-2 rounded-lg text-sm ${!selectedSubcat ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}>
                      All Products
                    </button>
                    {categories.map(cat => (
                      <div key={cat.id}>
                        <button onClick={() => setExpandedCats(prev => ({ ...prev, [cat.id]: !prev[cat.id] }))}
                          className="w-full flex items-center gap-1 px-3 py-2 text-sm text-gray-700 font-medium hover:bg-gray-100 rounded-lg">
                          {expandedCats[cat.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          {cat.name}
                          <span className="ml-auto text-xs text-gray-400">{cat.product_count}</span>
                        </button>
                        {expandedCats[cat.id] && cat.subcategories?.map(sub => (
                          <button key={sub.id} onClick={() => setSelectedSubcat(sub.id)}
                            className={`w-full text-left pl-8 pr-3 py-1.5 text-xs rounded-lg ${selectedSubcat === sub.id ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-500 hover:bg-gray-100'}`}>
                            {sub.name} <span className="text-gray-400">({sub.product_count})</span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>

                  {/* Product list */}
                  <div className="flex-1 flex flex-col min-w-0">
                    <div className="p-3 border-b border-gray-100">
                      <div className="relative">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input type="text" value={pickerSearch} onChange={e => setPickerSearch(e.target.value)}
                          placeholder="Search products..." className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-400" />
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-thin">
                      {pickerProducts.map(product => {
                        const inCart = cart.find(c => c.id === product.id)
                        return (
                          <div key={product.id} className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all ${inCart ? 'border-brand-300 bg-brand-50' : 'border-transparent hover:bg-gray-50'}`}>
                            {(product.local_image || product.image_url) && (
                              <img src={getImageUrl(product)} className="w-10 h-10 object-contain rounded" onError={e => e.target.style.display = 'none'} />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{product.name}</p>
                              <p className="text-xs text-gray-500">{product.sku} &bull; {product.category_name}</p>
                            </div>
                            <p className="text-sm font-semibold text-brand-900 shrink-0">{fmt(product.list_price)}</p>
                            {inCart ? (
                              <div className="flex items-center gap-1 shrink-0">
                                <button onClick={() => updateCartQty(product.id, inCart.quantity - 1)} className="w-6 h-6 flex items-center justify-center rounded bg-gray-200 hover:bg-gray-300 text-xs"><Minus size={12} /></button>
                                <span className="w-6 text-center text-sm font-medium">{inCart.quantity}</span>
                                <button onClick={() => updateCartQty(product.id, inCart.quantity + 1)} className="w-6 h-6 flex items-center justify-center rounded bg-brand-100 hover:bg-brand-200 text-brand-700 text-xs"><Plus size={12} /></button>
                              </div>
                            ) : (
                              <button onClick={() => startConfigure(product)} className="shrink-0 bg-brand-900 text-white px-3 py-1 rounded-lg text-xs font-medium hover:bg-brand-800">
                                Add
                              </button>
                            )}
                          </div>
                        )
                      })}
                      {pickerProducts.length === 0 && (
                        <div className="text-center py-8 text-gray-400 text-sm">No products found. Import products first.</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Cart footer */}
                {cart.length > 0 && (
                  <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
                    <div className="text-sm text-gray-600">
                      <strong>{cart.reduce((s, c) => s + c.quantity, 0)}</strong> items selected &bull;
                      Total: <strong>{fmt(cart.reduce((s, c) => s + c.list_price * c.quantity, 0))}</strong>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setCart([])} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100">Clear</button>
                      <button onClick={handleAddItemsFromCart} className="flex items-center gap-2 bg-brand-900 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-brand-800">
                        <ShoppingCart size={15} /> Add to CBU
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
