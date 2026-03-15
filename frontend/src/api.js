const API_URL = import.meta.env.VITE_API_URL || '';

async function request(path, options = {}) {
  const url = `${API_URL}/api${path}`;
  const config = {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  };

  // Don't set Content-Type for FormData
  if (options.body instanceof FormData) {
    delete config.headers['Content-Type'];
  }

  const res = await fetch(url, config);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  // Products
  getCategories: () => request('/products/categories'),
  createCategory: (data) => request('/products/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateCategory: (id, data) => request(`/products/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCategory: (id) => request(`/products/categories/${id}`, { method: 'DELETE' }),
  createSubcategory: (data) => request('/products/subcategories', { method: 'POST', body: JSON.stringify(data) }),
  updateSubcategory: (id, data) => request(`/products/subcategories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSubcategory: (id) => request(`/products/subcategories/${id}`, { method: 'DELETE' }),
  getProducts: (params) => request(`/products?${new URLSearchParams(params)}`),
  getProduct: (id) => request(`/products/${id}`),
  getRelatedProducts: (id) => request(`/products/${id}/related`),
  createProduct: (data) => request('/products', { method: 'POST', body: JSON.stringify(data) }),
  updateProduct: (id, data) => request(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProduct: (id) => request(`/products/${id}`, { method: 'DELETE' }),

  // Import
  previewImport: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return request('/import/preview', { method: 'POST', body: fd });
  },
  executeImport: (file, selectedSkus, skipUpdates) => {
    const fd = new FormData();
    fd.append('file', file);
    if (selectedSkus) fd.append('selected_skus', JSON.stringify(selectedSkus));
    if (skipUpdates) fd.append('skip_updates', 'true');
    return request('/import/execute', { method: 'POST', body: fd });
  },
  importCbu: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return request('/import/cbu', { method: 'POST', body: fd });
  },

  // Images
  getMissingImages: () => request('/images/missing'),
  getSimilarImages: (productId) => request(`/images/similar/${productId}`),
  copyImageFrom: (sourceId, targetId) => request('/images/copy-from', { method: 'POST', body: JSON.stringify({ source_product_id: sourceId, target_product_id: targetId }) }),
  webSearchImages: (productId, query) => request(`/images/web-search/${productId}${query ? `?q=${encodeURIComponent(query)}` : ''}`),
  webDownloadImage: (productId, imageUrl) => request('/images/web-download', { method: 'POST', body: JSON.stringify({ product_id: productId, image_url: imageUrl }) }),
  fillFamilyImages: () => request('/images/fill-family', { method: 'POST' }),
  shareToFamily: (productId) => request(`/images/share-to-family/${productId}`, { method: 'POST' }),
  fetchAllImages: () => request('/images/fetch-all', { method: 'POST' }),
  discoverImages: () => request('/images/discover', { method: 'POST' }),
  uploadImageZip: (file) => {
    const fd = new FormData();
    fd.append('zipfile', file);
    return request('/images/upload-zip', { method: 'POST', body: fd });
  },
  fetchImage: (productId, imageUrl) => request('/images/fetch', { method: 'POST', body: JSON.stringify({ product_id: productId, image_url: imageUrl }) }),
  uploadImage: (file, productId) => {
    const fd = new FormData();
    fd.append('image', file);
    if (productId) fd.append('product_id', productId);
    return request('/images/upload', { method: 'POST', body: fd });
  },

  // Folders
  getFolders: () => request('/folders'),
  createFolder: (data) => request('/folders', { method: 'POST', body: JSON.stringify(data) }),
  updateFolder: (id, data) => request(`/folders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteFolder: (id) => request(`/folders/${id}`, { method: 'DELETE' }),

  // CBUs
  getCbus: (params) => request(`/cbus?${new URLSearchParams(params)}`),
  getCbu: (id) => request(`/cbus/${id}`),
  createCbu: (data) => request('/cbus', { method: 'POST', body: JSON.stringify(data) }),
  updateCbu: (id, data) => request(`/cbus/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCbu: (id) => request(`/cbus/${id}`, { method: 'DELETE' }),
  addCbuItems: (id, items) => request(`/cbus/${id}/items`, { method: 'POST', body: JSON.stringify(items) }),
  updateCbuItem: (cbuId, itemId, data) => request(`/cbus/${cbuId}/items/${itemId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCbuItem: (cbuId, itemId) => request(`/cbus/${cbuId}/items/${itemId}`, { method: 'DELETE' }),
  addMiscCharge: (id, data) => request(`/cbus/${id}/misc-charges`, { method: 'POST', body: JSON.stringify(data) }),
  updateMiscCharge: (cbuId, chargeId, data) => request(`/cbus/${cbuId}/misc-charges/${chargeId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteMiscCharge: (cbuId, chargeId) => request(`/cbus/${cbuId}/misc-charges/${chargeId}`, { method: 'DELETE' }),

  // Database export/import
  importDatabase: (file, mode = 'merge') => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('mode', mode);
    return request('/database/import', { method: 'POST', body: fd });
  },
};

export const getDatabaseExportUrl = () => `${API_URL || window.location.origin}/api/database/export`;

export const getImageUrl = (product) => {
  if (product.local_image) return `${API_URL}/images/${product.local_image}`;
  if (product.image_url) return product.image_url;
  return null;
};

export const getExportUrl = (cbuId, format) => `${API_URL || window.location.origin}/api/export/${cbuId}/${format}`;
export const getShareUrl = (shareId) => `${API_URL || window.location.origin}/api/share/${shareId}`;

export default api;
