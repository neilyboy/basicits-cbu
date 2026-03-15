import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ImageOff, ChevronDown, ChevronRight, ImagePlus, Package, CheckCircle2, AlertCircle, RefreshCw, Users, Share2, Copy, X } from 'lucide-react'
import toast from 'react-hot-toast'
import api, { getImageUrl, getDatabaseExportUrl } from '../api'

const API_URL = import.meta.env.VITE_API_URL || ''

export default function MissingImages() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expandedCats, setExpandedCats] = useState({})
  const [expandedSubs, setExpandedSubs] = useState({})
  const [uploadingFor, setUploadingFor] = useState(null)
  const [filling, setFilling] = useState(false)
  const [pickerProduct, setPickerProduct] = useState(null)
  const [similarImages, setSimilarImages] = useState(null)
  const [loadingSimilar, setLoadingSimilar] = useState(false)
  const [copying, setCopying] = useState(false)
  const [pendingPick, setPendingPick] = useState(null) // { sourceId, localImage }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await api.getMissingImages()
      setData(result)
      // Auto-expand categories with missing images
      const cats = {}
      result.categories.forEach(c => { cats[c.id] = true })
      setExpandedCats(cats)
    } catch (err) { toast.error('Failed to load report') }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleUpload(e, productId, shareToFamily = false) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploadingFor(productId)
    try {
      await api.uploadImage(file, productId)
      if (shareToFamily) {
        const result = await api.shareToFamily(productId)
        toast.success(`Image uploaded and shared to ${result.shared} family members (${result.model})`, { duration: 5000 })
      } else {
        toast.success('Image uploaded')
      }
      load()
    } catch (err) { toast.error(err.message) }
    setUploadingFor(null)
  }

  async function openPicker(product) {
    setPickerProduct(product)
    setLoadingSimilar(true)
    setSimilarImages(null)
    try {
      const result = await api.getSimilarImages(product.id)
      setSimilarImages(result)
    } catch (err) { toast.error('Failed to load similar images') }
    setLoadingSimilar(false)
  }

  function getModelPrefix(sku) {
    const m = sku?.match(/^([A-Za-z]{2,4}\d{1,3})/)
    return m ? m[1].toUpperCase() : null
  }

  async function confirmPick(shareToFamily) {
    if (!pickerProduct || !pendingPick) return
    setCopying(true)
    try {
      await api.copyImageFrom(pendingPick.sourceId, pickerProduct.id)
      if (shareToFamily) {
        const result = await api.shareToFamily(pickerProduct.id)
        toast.success(`Image applied to ${result.model} family (${result.shared + 1} products)`, { duration: 5000 })
      } else {
        toast.success('Image assigned to this product only')
      }
      setPendingPick(null)
      setPickerProduct(null)
      setSimilarImages(null)
      load()
    } catch (err) { toast.error(err.message) }
    setCopying(false)
  }

  async function handleFillFamily() {
    setFilling(true)
    try {
      const result = await api.fillFamilyImages()
      if (result.filled > 0) {
        toast.success(`Filled ${result.filled} products from ${result.families_with_images} model families`, { duration: 6000 })
      } else {
        toast('No new family matches found. Upload images for at least one product per model family first.', { duration: 6000, icon: 'ℹ️' })
      }
      load()
    } catch (err) { toast.error(err.message) }
    setFilling(false)
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Loading report...</div>
  }

  if (!data) {
    return <div className="text-center py-12 text-gray-400">Failed to load report</div>
  }

  const { summary, categories } = data
  const pct = summary.total > 0 ? Math.round((summary.with_image / summary.total) * 100) : 0

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Missing Images Report</h1>
          <p className="text-sm text-gray-500 mt-1">Products that need images, grouped by category</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleFillFamily} disabled={filling}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-purple-300 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 disabled:opacity-50 font-medium">
            <Users size={15} /> {filling ? 'Filling...' : 'Fill Family Images'}
          </button>
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </div>

      {/* Overall summary card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-800">Overall Coverage</h2>
          <span className={`text-sm font-semibold px-2.5 py-0.5 rounded-full ${pct === 100 ? 'bg-green-100 text-green-700' : pct >= 75 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
            {pct}%
          </span>
        </div>
        <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : pct >= 75 ? 'bg-yellow-500' : 'bg-red-500'}`}
            style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-500">
          <span>{summary.with_image} of {summary.total} products have images</span>
          <span className="font-medium text-red-600">{summary.missing} missing</span>
        </div>
      </div>

      {/* All good state */}
      {categories.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <CheckCircle2 size={48} className="mx-auto mb-4 text-green-400" />
          <p className="text-lg font-medium text-gray-700 mb-1">All products have images!</p>
          <p className="text-sm text-gray-400">Every product in the database has an assigned image.</p>
        </div>
      )}

      {/* Category breakdown */}
      {categories.map(cat => {
        const catPct = cat.total > 0 ? Math.round((cat.with_image / cat.total) * 100) : 0
        const isExpanded = expandedCats[cat.id]

        return (
          <div key={cat.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <button
              onClick={() => setExpandedCats(prev => ({ ...prev, [cat.id]: !prev[cat.id] }))}
              className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors"
            >
              {isExpanded ? <ChevronDown size={18} className="text-gray-400" /> : <ChevronRight size={18} className="text-gray-400" />}
              <div className="flex-1 text-left">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-800">{cat.name}</span>
                  <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">{cat.missing} missing</span>
                </div>
                <div className="flex items-center gap-3 mt-1.5">
                  <div className="flex-1 max-w-xs h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${catPct >= 75 ? 'bg-yellow-500' : 'bg-red-500'}`}
                      style={{ width: `${catPct}%` }} />
                  </div>
                  <span className="text-xs text-gray-500">{cat.with_image}/{cat.total} ({catPct}%)</span>
                </div>
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-gray-100">
                {cat.subcategories.map(sub => {
                  const subKey = `${cat.id}-${sub.id}`
                  const isSubExpanded = expandedSubs[subKey] !== false // default open

                  return (
                    <div key={sub.id}>
                      <button
                        onClick={() => setExpandedSubs(prev => ({ ...prev, [subKey]: prev[subKey] === false ? true : false }))}
                        className="w-full flex items-center gap-2 px-8 py-2.5 hover:bg-gray-50 text-sm border-b border-gray-50"
                      >
                        {isSubExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                        <span className="font-medium text-gray-600">{sub.name}</span>
                        <span className="text-xs text-gray-400">({sub.missing} of {sub.total} missing)</span>
                      </button>

                      {isSubExpanded && sub.products.length > 0 && (
                        <div className="bg-gray-50/50">
                          {sub.products.map(product => (
                            <div key={product.id} className="flex items-center gap-3 px-10 py-2 border-b border-gray-100 last:border-0 hover:bg-white/80">
                              <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center shrink-0 border border-dashed border-gray-300">
                                <ImageOff size={16} className="text-gray-300" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-700 truncate">{product.name}</p>
                                <p className="text-xs text-gray-400 font-mono">{product.sku}</p>
                              </div>
                              <div className="shrink-0 flex items-center gap-1.5">
                                <button onClick={() => openPicker(product)}
                                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-amber-300 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors"
                                  title="Pick from similar product images">
                                  <Copy size={12} /> Pick Similar
                                </button>
                                <label className={`flex items-center gap-1 px-2.5 py-1.5 text-xs border border-brand-300 bg-brand-50 text-brand-700 rounded-lg hover:bg-brand-100 cursor-pointer transition-colors ${uploadingFor === product.id ? 'opacity-50 pointer-events-none' : ''}`}>
                                  <ImagePlus size={12} />
                                  {uploadingFor === product.id ? '...' : 'Upload'}
                                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => handleUpload(e, product.id, false)} className="hidden" disabled={uploadingFor === product.id} />
                                </label>
                                <label className={`flex items-center gap-1 px-2.5 py-1.5 text-xs border border-purple-300 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 cursor-pointer transition-colors ${uploadingFor === product.id ? 'opacity-50 pointer-events-none' : ''}`}
                                  title="Upload image and share to all products in the same model family">
                                  <Share2 size={12} />
                                  {uploadingFor === product.id ? '...' : '+ Family'}
                                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => handleUpload(e, product.id, true)} className="hidden" disabled={uploadingFor === product.id} />
                                </label>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
      {/* Pick from Similar modal */}
      {pickerProduct && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setPickerProduct(null); setSimilarImages(null) }}>
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="font-semibold text-gray-800">Pick Image for {pickerProduct.name}</h3>
                <p className="text-xs text-gray-400 font-mono">{pickerProduct.sku}</p>
              </div>
              <button onClick={() => { setPickerProduct(null); setSimilarImages(null) }} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X size={18} className="text-gray-400" />
              </button>
            </div>
            <div className="overflow-y-auto p-5" style={{ maxHeight: 'calc(80vh - 70px)' }}>
              {/* Confirmation step after selecting an image */}
              {pendingPick && (
                <div className="mb-5 p-4 bg-brand-50 border border-brand-200 rounded-xl">
                  <div className="flex items-center gap-4">
                    <img src={`${API_URL}/images/${pendingPick.localImage}`} className="w-16 h-16 object-contain rounded-lg border border-gray-200 bg-white" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800 mb-2">Apply this image to:</p>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <button onClick={() => confirmPick(false)} disabled={copying}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                          Just <span className="font-mono">{pickerProduct.sku}</span>
                        </button>
                        {getModelPrefix(pickerProduct.sku) && (
                          <button onClick={() => confirmPick(true)} disabled={copying}
                            className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
                            <Users size={13} />
                            Entire {getModelPrefix(pickerProduct.sku)} family
                          </button>
                        )}
                        <button onClick={() => setPendingPick(null)} className="flex items-center justify-center px-3 py-2 text-xs text-gray-400 hover:text-gray-600">
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {loadingSimilar && <p className="text-center text-gray-400 py-8">Loading similar images...</p>}
              {similarImages && (
                <>
                  {similarImages.same_subcategory.length === 0 && similarImages.same_category.length === 0 && (
                    <p className="text-center text-gray-400 py-8">No similar products with images found in this category.</p>
                  )}
                  {similarImages.same_subcategory.length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Same Subcategory</h4>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                        {similarImages.same_subcategory.map(p => (
                          <button key={p.id} onClick={() => setPendingPick({ sourceId: p.id, localImage: p.local_image })}
                            className={`w-full bg-gray-50 rounded-xl border-2 p-2 hover:border-brand-400 hover:shadow-md transition-all text-left ${pendingPick?.sourceId === p.id ? 'border-brand-500 ring-2 ring-brand-200' : 'border-gray-200'}`}>
                            <img src={`${API_URL}/images/${p.local_image}`} className="w-full h-20 object-contain rounded-lg" />
                            <p className="text-[10px] text-gray-500 mt-1.5 truncate font-mono">{p.sku}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {similarImages.same_category.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Same Category (other subcategories)</h4>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                        {similarImages.same_category.map(p => (
                          <button key={p.id} onClick={() => setPendingPick({ sourceId: p.id, localImage: p.local_image })}
                            className={`w-full bg-gray-50 rounded-xl border-2 p-2 hover:border-brand-400 hover:shadow-md transition-all text-left ${pendingPick?.sourceId === p.id ? 'border-brand-500 ring-2 ring-brand-200' : 'border-gray-200'}`}>
                            <img src={`${API_URL}/images/${p.local_image}`} className="w-full h-20 object-contain rounded-lg" />
                            <p className="text-[10px] text-gray-500 mt-1.5 truncate font-mono">{p.sku}</p>
                            <p className="text-[9px] text-gray-400 truncate">{p.subcategory_name}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
