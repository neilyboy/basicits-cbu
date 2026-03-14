import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { Edit, Download, Share2, Trash2, ArrowLeft, FileStack, Package, DollarSign, Copy, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'
import api, { getExportUrl, getShareUrl } from '../api'

export default function CbuView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [cbu, setCbu] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showExport, setShowExport] = useState(false)

  useEffect(() => { loadCbu() }, [id])

  async function loadCbu() {
    try {
      const data = await api.getCbu(id)
      setCbu(data)
    } catch (err) {
      toast.error('Failed to load CBU')
      navigate('/cbus')
    }
    setLoading(false)
  }

  async function handleDelete() {
    if (!confirm('Delete this CBU? This cannot be undone.')) return
    try {
      await api.deleteCbu(id)
      toast.success('CBU deleted')
      navigate('/cbus')
    } catch (err) {
      toast.error(err.message)
    }
  }

  function handleShare() {
    const url = getShareUrl(cbu.share_id)
    navigator.clipboard.writeText(url).then(() => {
      toast.success('Share link copied to clipboard!')
    }).catch(() => {
      prompt('Share link:', url)
    })
  }

  const fmt = (n) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  if (loading) return <div className="text-center py-12 text-gray-400">Loading...</div>
  if (!cbu) return <div className="text-center py-12 text-gray-400">CBU not found</div>

  const statusColors = {
    draft: 'bg-yellow-100 text-yellow-700',
    in_progress: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    archived: 'bg-gray-100 text-gray-600',
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link to="/cbus" className="flex items-center gap-1 text-sm text-gray-500 hover:text-brand-600 mb-2">
            <ArrowLeft size={14} /> Back to CBUs
          </Link>
          <h1 className="text-2xl font-bold text-brand-900">{cbu.project_name}</h1>
          <div className="flex items-center gap-3 mt-1.5">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[cbu.status] || statusColors.draft}`}>
              {(cbu.status || 'draft').replace('_', ' ').toUpperCase()}
            </span>
            {cbu.client_name && <span className="text-sm text-gray-500">{cbu.client_name}</span>}
            <span className="text-sm text-gray-400">{new Date(cbu.created_at).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleShare} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-green-600 hover:text-green-700">
            <Share2 size={15} /> Share
          </button>
          <div className="relative">
            <button onClick={() => setShowExport(!showExport)} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
              <Download size={15} /> Export
            </button>
            {showExport && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowExport(false)} />
                <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-20 w-44">
                  <a href={getExportUrl(id, 'pdf')} target="_blank" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"><Download size={14} /> PDF</a>
                  <a href={getExportUrl(id, 'xlsx')} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"><Download size={14} /> Excel (.xlsx)</a>
                  <a href={getExportUrl(id, 'csv')} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"><Download size={14} /> CSV</a>
                  <a href={getExportUrl(id, 'json')} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"><Download size={14} /> JSON (backup)</a>
                  <a href={getExportUrl(id, 'html')} target="_blank" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"><ExternalLink size={14} /> HTML View</a>
                </div>
              </>
            )}
          </div>
          <Link to={`/cbus/${id}/edit`} className="flex items-center gap-1.5 bg-brand-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-800">
            <Edit size={15} /> Edit
          </Link>
          <button onClick={handleDelete} className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50">
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Share link banner */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Share2 size={16} className="text-green-600" />
          <span className="text-sm text-green-800">Share Link:</span>
          <code className="text-xs bg-white px-2 py-1 rounded border border-green-200 text-green-700">{getShareUrl(cbu.share_id)}</code>
        </div>
        <button onClick={handleShare} className="flex items-center gap-1 text-sm text-green-600 hover:text-green-700 font-medium">
          <Copy size={14} /> Copy
        </button>
      </div>

      {/* Project info */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-brand-900 mb-4">Project Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
          <InfoField label="Project Name" value={cbu.project_name} />
          <InfoField label="Client Name" value={cbu.client_name} />
          <InfoField label="Address" value={cbu.address} />
          <InfoField label="Created By" value={cbu.created_by} />
          <InfoField label="Date Created" value={new Date(cbu.created_at).toLocaleString()} />
          <InfoField label="Last Updated" value={new Date(cbu.updated_at).toLocaleString()} />
          {cbu.folder_name && <InfoField label="Folder" value={cbu.folder_name} />}
        </div>
        {cbu.description && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <label className="text-xs text-gray-500 uppercase tracking-wide font-medium">Description</label>
            <p className="text-sm mt-1">{cbu.description}</p>
          </div>
        )}
        {cbu.verbal_narrative && (
          <div className="mt-4 bg-blue-50 rounded-lg p-4">
            <label className="text-xs text-blue-600 uppercase tracking-wide font-medium">Installation Narrative</label>
            <p className="text-sm mt-1 text-blue-900">{cbu.verbal_narrative}</p>
          </div>
        )}
      </div>

      {/* Line items */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <Package size={18} className="text-brand-600" />
          <h2 className="font-semibold text-brand-900">Line Items ({cbu.items?.length || 0})</h2>
        </div>
        {cbu.items?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <th className="px-4 py-2.5 text-left">#</th>
                  <th className="px-4 py-2.5 text-left">Item</th>
                  <th className="px-4 py-2.5 text-left">SKU</th>
                  <th className="px-4 py-2.5 text-left">Category</th>
                  <th className="px-4 py-2.5 text-right">Unit Price</th>
                  <th className="px-4 py-2.5 text-center">Qty</th>
                  <th className="px-4 py-2.5 text-right">Line Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {cbu.items.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-400">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {(item.image_url || item.local_image) && (
                          <img src={item.local_image ? `${import.meta.env.VITE_API_URL || 'http://localhost:3099'}/images/${item.local_image}` : item.image_url}
                            className="w-9 h-9 object-contain rounded" onError={e => e.target.style.display = 'none'} />
                        )}
                        <div>
                          <p className="font-medium">{item.name}</p>
                          {item.description && <p className="text-xs text-gray-400 truncate max-w-sm">{item.description}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{item.sku || '-'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{item.category_name || '-'}</td>
                    <td className="px-4 py-3 text-right">{fmt(item.list_price)}</td>
                    <td className="px-4 py-3 text-center">{item.quantity}</td>
                    <td className="px-4 py-3 text-right font-semibold">{fmt(item.list_price * item.quantity)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td colSpan={6} className="px-4 py-3 text-right font-semibold">Items Subtotal:</td>
                  <td className="px-4 py-3 text-right font-bold text-brand-900 text-base">{fmt(cbu.items_total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-gray-400 text-sm">No line items</div>
        )}
      </div>

      {/* Misc charges */}
      {cbu.misc_charges?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
            <DollarSign size={18} className="text-brand-600" />
            <h2 className="font-semibold text-brand-900">Additional Charges</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <th className="px-4 py-2.5 text-left">#</th>
                  <th className="px-4 py-2.5 text-left">Name</th>
                  <th className="px-4 py-2.5 text-left">Description</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {cbu.misc_charges.map((charge, idx) => (
                  <tr key={charge.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-400">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium">{charge.name}</td>
                    <td className="px-4 py-3 text-gray-500">{charge.description || '-'}</td>
                    <td className="px-4 py-3 text-right font-semibold">{fmt(charge.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td colSpan={3} className="px-4 py-3 text-right font-semibold">Misc Subtotal:</td>
                  <td className="px-4 py-3 text-right font-bold text-brand-900">{fmt(cbu.misc_total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Grand total */}
      <div className="bg-gradient-to-r from-brand-900 to-brand-800 rounded-xl p-6 text-white flex justify-between items-center">
        <div>
          <p className="text-sm text-gray-300">Grand Total</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {cbu.items?.length || 0} items + {cbu.misc_charges?.length || 0} charges
          </p>
        </div>
        <span className="text-3xl font-bold">{fmt(cbu.grand_total)}</span>
      </div>
    </div>
  )
}

function InfoField({ label, value }) {
  return (
    <div>
      <label className="text-xs text-gray-500 uppercase tracking-wide">{label}</label>
      <p className="text-sm font-medium mt-0.5">{value || <span className="text-gray-300">N/A</span>}</p>
    </div>
  )
}
