import { useState, useRef } from 'react'
import { Upload, CheckCircle, AlertTriangle, ArrowRight, Package, RefreshCw, X, FileSpreadsheet, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../api'

export default function ImportProducts() {
  const fileRef = useRef()
  const [file, setFile] = useState(null)
  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview] = useState(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const [selectedNew, setSelectedNew] = useState(new Set())
  const [selectedUpdates, setSelectedUpdates] = useState(new Set())
  const [selectAllNew, setSelectAllNew] = useState(true)
  const [selectAllUpdates, setSelectAllUpdates] = useState(true)

  async function handlePreview() {
    if (!file) return
    setPreviewing(true)
    setPreview(null)
    setResult(null)
    try {
      const data = await api.previewImport(file)
      setPreview(data)
      // Pre-select all new and updated
      setSelectedNew(new Set(data.new_products.map(p => p.sku)))
      setSelectedUpdates(new Set(data.updated_products.map(p => p.sku)))
      setSelectAllNew(true)
      setSelectAllUpdates(true)
    } catch (err) {
      toast.error(err.message)
    }
    setPreviewing(false)
  }

  async function handleImport() {
    if (!file || !preview) return
    setImporting(true)
    try {
      const allSelected = [...selectedNew, ...selectedUpdates]
      const skipUpdates = selectedUpdates.size === 0
      const data = await api.executeImport(file, allSelected.length < preview.total ? allSelected : null, skipUpdates)
      setResult(data)
      setPreview(null)
      toast.success(`Imported ${data.imported} new, updated ${data.updated}`)
    } catch (err) {
      toast.error(err.message)
    }
    setImporting(false)
  }

  function toggleAllNew() {
    if (selectAllNew) {
      setSelectedNew(new Set())
    } else {
      setSelectedNew(new Set(preview.new_products.map(p => p.sku)))
    }
    setSelectAllNew(!selectAllNew)
  }

  function toggleAllUpdates() {
    if (selectAllUpdates) {
      setSelectedUpdates(new Set())
    } else {
      setSelectedUpdates(new Set(preview.updated_products.map(p => p.sku)))
    }
    setSelectAllUpdates(!selectAllUpdates)
  }

  function toggleNew(sku) {
    setSelectedNew(prev => {
      const s = new Set(prev)
      s.has(sku) ? s.delete(sku) : s.add(sku)
      return s
    })
  }

  function toggleUpdate(sku) {
    setSelectedUpdates(prev => {
      const s = new Set(prev)
      s.has(sku) ? s.delete(sku) : s.add(sku)
      return s
    })
  }

  const fmt = (n) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-900">Import Products</h1>
        <p className="text-sm text-gray-500 mt-1">Upload a Verkada price book (.xlsx/.csv) to import or update products</p>
      </div>

      {/* Upload area */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/30 transition-all"
        >
          <FileSpreadsheet size={40} className="mx-auto mb-3 text-gray-400" />
          {file ? (
            <div>
              <p className="font-medium text-brand-900">{file.name}</p>
              <p className="text-sm text-gray-500 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          ) : (
            <div>
              <p className="font-medium text-gray-700">Click to select a file</p>
              <p className="text-sm text-gray-400 mt-1">Supports .xlsx and .csv files</p>
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.csv,.xls" onChange={e => { setFile(e.target.files[0]); setPreview(null); setResult(null) }} className="hidden" />

        {file && !preview && !result && (
          <div className="mt-4 flex justify-end">
            <button onClick={handlePreview} disabled={previewing}
              className="flex items-center gap-2 bg-brand-900 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-brand-800 disabled:opacity-50">
              {previewing ? <RefreshCw size={15} className="animate-spin" /> : <ArrowRight size={15} />}
              {previewing ? 'Analyzing...' : 'Preview Import'}
            </button>
          </div>
        )}
      </div>

      {/* Preview results */}
      {preview && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-green-700">{preview.new_products.length}</p>
              <p className="text-sm text-green-600">New Products</p>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-yellow-700">{preview.updated_products.length}</p>
              <p className="text-sm text-yellow-600">Price Changes</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-gray-600">{preview.unchanged_count}</p>
              <p className="text-sm text-gray-500">Unchanged</p>
            </div>
          </div>

          {/* Categories found */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Categories Detected</h3>
            <div className="flex flex-wrap gap-1.5">
              {preview.categories.map(cat => (
                <span key={cat} className="bg-brand-50 text-brand-700 px-2.5 py-1 rounded-full text-xs font-medium">{cat}</span>
              ))}
            </div>
          </div>

          {/* New products */}
          {preview.new_products.length > 0 && (
            <div className="bg-white rounded-xl border border-green-200 overflow-hidden">
              <div className="px-5 py-3 bg-green-50 border-b border-green-200 flex items-center justify-between">
                <h3 className="font-semibold text-green-800 flex items-center gap-2">
                  <CheckCircle size={16} /> New Products ({preview.new_products.length})
                </h3>
                <label className="flex items-center gap-2 text-sm text-green-700 cursor-pointer">
                  <input type="checkbox" checked={selectAllNew} onChange={toggleAllNew} className="rounded" />
                  Select All
                </label>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {preview.new_products.map(product => (
                  <label key={product.sku} className="flex items-center gap-3 px-5 py-2.5 border-b border-gray-50 hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={selectedNew.has(product.sku)} onChange={() => toggleNew(product.sku)} className="rounded" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-gray-500">{product.sku}</span>
                        <span className="bg-green-100 text-green-700 text-[10px] px-1.5 py-0.5 rounded font-medium">NEW</span>
                      </div>
                      <p className="text-sm truncate">{product.description}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-sm">{fmt(product.list_price)}</p>
                      <p className="text-xs text-gray-400">{product.category}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Updated products */}
          {preview.updated_products.length > 0 && (
            <div className="bg-white rounded-xl border border-yellow-200 overflow-hidden">
              <div className="px-5 py-3 bg-yellow-50 border-b border-yellow-200 flex items-center justify-between">
                <h3 className="font-semibold text-yellow-800 flex items-center gap-2">
                  <AlertTriangle size={16} /> Price Changes ({preview.updated_products.length})
                </h3>
                <label className="flex items-center gap-2 text-sm text-yellow-700 cursor-pointer">
                  <input type="checkbox" checked={selectAllUpdates} onChange={toggleAllUpdates} className="rounded" />
                  Select All
                </label>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {preview.updated_products.map(product => (
                  <label key={product.sku} className="flex items-center gap-3 px-5 py-2.5 border-b border-gray-50 hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={selectedUpdates.has(product.sku)} onChange={() => toggleUpdate(product.sku)} className="rounded" />
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-xs text-gray-500">{product.sku}</span>
                      <p className="text-sm truncate">{product.description}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-gray-400 line-through">{fmt(product.old_price)}</p>
                      <p className="font-semibold text-sm text-yellow-700">{fmt(product.new_price)}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Import button */}
          <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 p-5">
            <div className="text-sm text-gray-600">
              Selected: <strong>{selectedNew.size}</strong> new + <strong>{selectedUpdates.size}</strong> updates
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setPreview(null); setFile(null) }} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleImport} disabled={importing || (selectedNew.size === 0 && selectedUpdates.size === 0)}
                className="flex items-center gap-2 bg-brand-900 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-brand-800 disabled:opacity-50">
                {importing ? <RefreshCw size={15} className="animate-spin" /> : <Upload size={15} />}
                {importing ? 'Importing...' : 'Import Selected'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import result */}
      {result && (
        <div className="bg-white rounded-xl border border-green-200 p-8 text-center">
          <CheckCircle size={48} className="mx-auto mb-4 text-green-500" />
          <h2 className="text-xl font-bold text-brand-900 mb-3">Import Complete</h2>
          <div className="flex justify-center gap-8 text-center">
            <div>
              <p className="text-2xl font-bold text-green-600">{result.imported}</p>
              <p className="text-sm text-gray-500">New Products</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-yellow-600">{result.updated}</p>
              <p className="text-sm text-gray-500">Updated</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-400">{result.skipped}</p>
              <p className="text-sm text-gray-500">Skipped</p>
            </div>
          </div>
          <div className="mt-6 flex justify-center gap-3">
            <button onClick={() => { setFile(null); setResult(null) }} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
              Import Another
            </button>
            <a href="/products" className="flex items-center gap-2 bg-brand-900 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-brand-800">
              <Package size={15} /> View Products
            </a>
          </div>
        </div>
      )}

      {/* Help section */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-sm text-gray-700 mb-2">Import Tips</h3>
        <ul className="text-sm text-gray-500 space-y-1">
          <li>&bull; Upload a Verkada Reseller Price Book spreadsheet (.xlsx)</li>
          <li>&bull; The importer auto-detects categories, subcategories, and product types</li>
          <li>&bull; Review all changes before importing — you can select/deselect individual items</li>
          <li>&bull; Existing products with matching SKUs will have their prices updated if selected</li>
          <li>&bull; After importing, use "Fetch Images" on the Products page to download product thumbnails</li>
        </ul>
      </div>
    </div>
  )
}
