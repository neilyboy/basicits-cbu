const express = require('express');
const router = express.Router();
const { db } = require('../database');

// Get all categories with subcategories and product counts
router.get('/categories', (req, res) => {
  try {
    const categories = db.prepare(`
      SELECT c.*, 
        (SELECT COUNT(*) FROM products p 
         JOIN product_subcategories s ON p.subcategory_id = s.id 
         WHERE s.category_id = c.id) as product_count
      FROM product_categories c ORDER BY c.sort_order, c.name
    `).all();

    for (const cat of categories) {
      cat.subcategories = db.prepare(`
        SELECT s.*, 
          (SELECT COUNT(*) FROM products p WHERE p.subcategory_id = s.id) as product_count
        FROM product_subcategories s 
        WHERE s.category_id = ? ORDER BY s.sort_order, s.name
      `).all(cat.id);
    }
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create category
router.post('/categories', (req, res) => {
  try {
    const { name, sort_order } = req.body;
    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM product_categories').get();
    const result = db.prepare('INSERT INTO product_categories (name, sort_order) VALUES (?, ?)')
      .run(name, sort_order ?? (maxOrder.m || 0) + 1);
    res.json({ id: result.lastInsertRowid, name, sort_order: sort_order ?? (maxOrder.m || 0) + 1 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update category
router.put('/categories/:id', (req, res) => {
  try {
    const { name, sort_order } = req.body;
    db.prepare('UPDATE product_categories SET name = ?, sort_order = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(name, sort_order, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete category
router.delete('/categories/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM product_categories WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create subcategory
router.post('/subcategories', (req, res) => {
  try {
    const { category_id, name, sort_order } = req.body;
    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM product_subcategories WHERE category_id = ?').get(category_id);
    const result = db.prepare('INSERT INTO product_subcategories (category_id, name, sort_order) VALUES (?, ?, ?)')
      .run(category_id, name, sort_order ?? (maxOrder.m || 0) + 1);
    res.json({ id: result.lastInsertRowid, category_id, name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update subcategory
router.put('/subcategories/:id', (req, res) => {
  try {
    const { name, sort_order, category_id } = req.body;
    db.prepare('UPDATE product_subcategories SET name = COALESCE(?, name), sort_order = COALESCE(?, sort_order), category_id = COALESCE(?, category_id), updated_at = datetime(\'now\') WHERE id = ?')
      .run(name, sort_order, category_id, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete subcategory
router.delete('/subcategories/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM product_subcategories WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get products with optional filters
router.get('/', (req, res) => {
  try {
    const { category_id, subcategory_id, search, page = 1, limit = 50 } = req.query;
    let where = [];
    let params = [];

    if (subcategory_id) {
      where.push('p.subcategory_id = ?');
      params.push(subcategory_id);
    } else if (category_id) {
      where.push('s.category_id = ?');
      params.push(category_id);
    }

    if (search) {
      where.push('(p.sku LIKE ? OR p.name LIKE ? OR p.description LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM products p
      JOIN product_subcategories s ON p.subcategory_id = s.id
      ${whereClause}
    `).get(...params).count;

    const products = db.prepare(`
      SELECT p.*, s.name as subcategory_name, c.name as category_name, c.id as category_id
      FROM products p
      JOIN product_subcategories s ON p.subcategory_id = s.id
      JOIN product_categories c ON s.category_id = c.id
      ${whereClause}
      ORDER BY c.sort_order, s.sort_order, p.name
      LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), offset);

    res.json({ products, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single product
router.get('/:id', (req, res) => {
  try {
    const product = db.prepare(`
      SELECT p.*, s.name as subcategory_name, c.name as category_name, c.id as category_id
      FROM products p
      JOIN product_subcategories s ON p.subcategory_id = s.id
      JOIN product_categories c ON s.category_id = c.id
      WHERE p.id = ?
    `).get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create product
router.post('/', (req, res) => {
  try {
    const { subcategory_id, sku, name, description, list_price, discount_class, image_url, is_main_product, is_accessory, is_license, parent_product_sku, metadata } = req.body;
    const result = db.prepare(`
      INSERT INTO products (subcategory_id, sku, name, description, list_price, discount_class, image_url, is_main_product, is_accessory, is_license, parent_product_sku, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(subcategory_id, sku, name, description, list_price || 0, discount_class, image_url, is_main_product ? 1 : 0, is_accessory ? 1 : 0, is_license ? 1 : 0, parent_product_sku, metadata ? JSON.stringify(metadata) : null);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      res.status(409).json({ error: 'A product with this SKU already exists' });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// Update product
router.put('/:id', (req, res) => {
  try {
    const fields = ['subcategory_id', 'sku', 'name', 'description', 'list_price', 'discount_class', 'image_url', 'local_image', 'is_main_product', 'is_accessory', 'is_license', 'parent_product_sku', 'metadata'];
    const updates = [];
    const params = [];

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        let val = req.body[field];
        if (field === 'metadata' && typeof val === 'object') val = JSON.stringify(val);
        if (['is_main_product', 'is_accessory', 'is_license'].includes(field)) val = val ? 1 : 0;
        params.push(val);
      }
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    updates.push("updated_at = datetime('now')");
    params.push(req.params.id);

    db.prepare(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete product
router.delete('/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk delete products
router.post('/bulk-delete', (req, res) => {
  try {
    const { ids } = req.body;
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`DELETE FROM products WHERE id IN (${placeholders})`).run(...ids);
    res.json({ success: true, deleted: ids.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
