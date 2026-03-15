import { useState } from 'react'
import { Download, Upload, Database, AlertTriangle, CheckCircle2, Merge, Replace } from 'lucide-react'
import toast from 'react-hot-toast'
import api, { getDatabaseExportUrl } from '../api'

export default function DatabaseManager() {
  const [importing, setImporting] = useState(false)
  const [importMode, setImportMode] = useState('merge')
  const [importResult, setImportResult] = useState(null)

  async function handleExport() {
    try {
      const url = getDatabaseExportUrl()
      const link = document.createElement('a')
      link.href = url
      link.download = ''
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      toast.success('Database export started')
    } catch (err) { toast.error('Export failed') }
  }

  async function handleImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    if (!file.name.endsWith('.zip')) {
      toast.error('Please select a .zip file')
      return
    }

    setImporting(true)
    setImportResult(null)
    try {
      const result = await api.importDatabase(file, importMode)
      setImportResult(result)
      toast.success('Database imported successfully', { duration: 5000 })
    } catch (err) { toast.error(err.message) }
    setImporting(false)
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-brand-900">Product Database Manager</h1>
        <p className="text-sm text-gray-500 mt-1">Export and import product databases to share with other users</p>
      </div>

      {/* Export section */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center shrink-0">
            <Download size={20} className="text-green-600" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-gray-800 text-lg">Export Database</h2>
            <p className="text-sm text-gray-500 mt-1 mb-4">
              Download all product categories, subcategories, products, and images as a portable ZIP file.
              Share this file with other users so they can import it into their own instance.
            </p>
            <button onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm transition-colors">
              <Download size={16} /> Export Product Database
            </button>
          </div>
        </div>
      </div>

      {/* Import section */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
            <Upload size={20} className="text-blue-600" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-gray-800 text-lg">Import Database</h2>
            <p className="text-sm text-gray-500 mt-1 mb-4">
              Import a product database ZIP file. Choose how to handle existing data:
            </p>

            {/* Import mode selector */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <button onClick={() => setImportMode('merge')}
                className={`flex-1 flex items-center gap-2 p-3 rounded-xl border-2 transition-all ${importMode === 'merge' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <Merge size={18} className={importMode === 'merge' ? 'text-blue-600' : 'text-gray-400'} />
                <div className="text-left">
                  <p className={`text-sm font-medium ${importMode === 'merge' ? 'text-blue-700' : 'text-gray-700'}`}>Merge</p>
                  <p className="text-xs text-gray-400">Add new products, update existing ones. Keeps your current data intact.</p>
                </div>
              </button>
              <button onClick={() => setImportMode('replace')}
                className={`flex-1 flex items-center gap-2 p-3 rounded-xl border-2 transition-all ${importMode === 'replace' ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <Replace size={18} className={importMode === 'replace' ? 'text-red-600' : 'text-gray-400'} />
                <div className="text-left">
                  <p className={`text-sm font-medium ${importMode === 'replace' ? 'text-red-700' : 'text-gray-700'}`}>Replace</p>
                  <p className="text-xs text-gray-400">Clear existing products and replace with imported data entirely.</p>
                </div>
              </button>
            </div>

            {importMode === 'replace' && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
                <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
                <p className="text-xs text-red-600">
                  <strong>Warning:</strong> Replace mode will delete all existing products, categories, and subcategories before importing.
                  This action cannot be undone. Consider exporting first as a backup.
                </p>
              </div>
            )}

            <label className={`inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm cursor-pointer transition-colors ${importing ? 'opacity-50 pointer-events-none' : ''}`}>
              <Upload size={16} /> {importing ? 'Importing...' : 'Import Database ZIP'}
              <input type="file" accept=".zip" onChange={handleImport} className="hidden" disabled={importing} />
            </label>
          </div>
        </div>
      </div>

      {/* Import results */}
      {importResult && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 size={20} className="text-green-500" />
            <h3 className="font-semibold text-gray-800">Import Complete ({importResult.mode} mode)</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Categories Added', value: importResult.stats.categories, color: 'blue' },
              { label: 'Subcategories Added', value: importResult.stats.subcategories, color: 'blue' },
              { label: 'Products Added', value: importResult.stats.products_added, color: 'green' },
              { label: 'Products Updated', value: importResult.stats.products_updated, color: 'yellow' },
              { label: 'Images Imported', value: importResult.stats.images, color: 'purple' },
              { label: 'Skipped', value: importResult.stats.skipped, color: 'gray' },
            ].map(item => (
              <div key={item.label} className={`p-3 rounded-lg bg-${item.color}-50 border border-${item.color}-200`}>
                <p className="text-2xl font-bold text-gray-800">{item.value}</p>
                <p className="text-xs text-gray-500">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info section */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-5">
        <h3 className="font-medium text-gray-700 mb-2 flex items-center gap-2">
          <Database size={16} /> What's included in a database export?
        </h3>
        <ul className="text-sm text-gray-500 space-y-1">
          <li>- All product categories and subcategories</li>
          <li>- All products with SKUs, descriptions, pricing, and metadata</li>
          <li>- All locally cached product images</li>
          <li>- Does <strong>not</strong> include Cost Build Ups (CBUs), folders, or share links</li>
        </ul>
      </div>
    </div>
  )
}
