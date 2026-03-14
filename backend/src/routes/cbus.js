const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { nanoid } = require('nanoid');

// List all CBUs with optional filtering
router.get('/', (req, res) => {
  try {
    const { folder_id, search, status, page = 1, limit = 50 } = req.query;
    let where = [];
    let params = [];

    if (folder_id) {
      where.push('c.folder_id = ?');
      params.push(folder_id);
    }
    if (status) {
      where.push('c.status = ?');
      params.push(status);
    }
    if (search) {
      where.push('(c.project_name LIKE ? OR c.client_name LIKE ? OR c.description LIKE ? OR c.created_by LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const total = db.prepare(`SELECT COUNT(*) as count FROM cbus c ${whereClause}`).get(...params).count;

    const cbus = db.prepare(`
      SELECT c.*, f.name as folder_name,
        (SELECT SUM(ci.list_price * ci.quantity) FROM cbu_items ci WHERE ci.cbu_id = c.id) as items_total,
        (SELECT SUM(mc.amount) FROM cbu_misc_charges mc WHERE mc.cbu_id = c.id) as misc_total,
        (SELECT COUNT(*) FROM cbu_items ci WHERE ci.cbu_id = c.id) as item_count
      FROM cbus c
      LEFT JOIN cbu_folders f ON c.folder_id = f.id
      ${whereClause}
      ORDER BY c.updated_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), offset);

    res.json({ cbus, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single CBU with all details
router.get('/:id', (req, res) => {
  try {
    const cbu = db.prepare(`
      SELECT c.*, f.name as folder_name
      FROM cbus c
      LEFT JOIN cbu_folders f ON c.folder_id = f.id
      WHERE c.id = ?
    `).get(req.params.id);

    if (!cbu) return res.status(404).json({ error: 'CBU not found' });

    // Get line items with product details
    cbu.items = db.prepare(`
      SELECT ci.*, p.image_url, p.local_image, p.category_name, p.subcategory_name
      FROM cbu_items ci
      LEFT JOIN (
        SELECT p.id, p.image_url, p.local_image, c.name as category_name, s.name as subcategory_name
        FROM products p
        JOIN product_subcategories s ON p.subcategory_id = s.id
        JOIN product_categories c ON s.category_id = c.id
      ) p ON ci.product_id = p.id
      WHERE ci.cbu_id = ?
      ORDER BY ci.sort_order, ci.id
    `).all(req.params.id);

    // Get misc charges
    cbu.misc_charges = db.prepare(`
      SELECT * FROM cbu_misc_charges WHERE cbu_id = ? ORDER BY sort_order, id
    `).all(req.params.id);

    // Calculate totals
    cbu.items_total = cbu.items.reduce((sum, item) => sum + (item.list_price * item.quantity), 0);
    cbu.misc_total = cbu.misc_charges.reduce((sum, charge) => sum + charge.amount, 0);
    cbu.grand_total = cbu.items_total + cbu.misc_total;

    res.json(cbu);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create CBU
router.post('/', (req, res) => {
  try {
    const { project_name, client_name, address, description, created_by, verbal_narrative, folder_id } = req.body;
    const share_id = nanoid(12);
    const result = db.prepare(`
      INSERT INTO cbus (share_id, project_name, client_name, address, description, created_by, verbal_narrative, folder_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(share_id, project_name, client_name, address, description, created_by, verbal_narrative, folder_id || null);
    res.json({ id: result.lastInsertRowid, share_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update CBU
router.put('/:id', (req, res) => {
  try {
    const fields = ['project_name', 'client_name', 'address', 'description', 'created_by', 'verbal_narrative', 'folder_id', 'status'];
    const updates = [];
    const params = [];

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        params.push(req.body[field] || null);
      }
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    updates.push("updated_at = datetime('now')");
    params.push(req.params.id);

    db.prepare(`UPDATE cbus SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete CBU
router.delete('/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM cbus WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add item to CBU
router.post('/:id/items', (req, res) => {
  try {
    const cbu_id = req.params.id;
    const items = Array.isArray(req.body) ? req.body : [req.body];
    const insertStmt = db.prepare(`
      INSERT INTO cbu_items (cbu_id, product_id, sku, name, description, list_price, quantity, sort_order, parent_item_id, item_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM cbu_items WHERE cbu_id = ?').get(cbu_id);
    let order = (maxOrder.m || 0) + 1;

    const insertMany = db.transaction((items) => {
      const results = [];
      for (const item of items) {
        const result = insertStmt.run(
          cbu_id, item.product_id || null, item.sku || null, item.name,
          item.description || null, item.list_price || 0, item.quantity || 1,
          item.sort_order ?? order++, item.parent_item_id || null, item.item_type || 'product'
        );
        results.push({ id: result.lastInsertRowid });
      }
      return results;
    });

    const results = insertMany(items);
    // Touch updated_at
    db.prepare("UPDATE cbus SET updated_at = datetime('now') WHERE id = ?").run(cbu_id);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update CBU item
router.put('/:id/items/:itemId', (req, res) => {
  try {
    const { quantity, list_price, name, description, sort_order, parent_item_id } = req.body;
    const updates = [];
    const params = [];

    if (quantity !== undefined) { updates.push('quantity = ?'); params.push(quantity); }
    if (list_price !== undefined) { updates.push('list_price = ?'); params.push(list_price); }
    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (sort_order !== undefined) { updates.push('sort_order = ?'); params.push(sort_order); }
    if (parent_item_id !== undefined) { updates.push('parent_item_id = ?'); params.push(parent_item_id); }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
    params.push(req.params.itemId, req.params.id);

    db.prepare(`UPDATE cbu_items SET ${updates.join(', ')} WHERE id = ? AND cbu_id = ?`).run(...params);
    db.prepare("UPDATE cbus SET updated_at = datetime('now') WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete CBU item
router.delete('/:id/items/:itemId', (req, res) => {
  try {
    db.prepare('DELETE FROM cbu_items WHERE id = ? AND cbu_id = ?').run(req.params.itemId, req.params.id);
    db.prepare("UPDATE cbus SET updated_at = datetime('now') WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add misc charge
router.post('/:id/misc-charges', (req, res) => {
  try {
    const { name, description, amount } = req.body;
    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM cbu_misc_charges WHERE cbu_id = ?').get(req.params.id);
    const result = db.prepare(`
      INSERT INTO cbu_misc_charges (cbu_id, name, description, amount, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.params.id, name, description, amount || 0, (maxOrder.m || 0) + 1);
    db.prepare("UPDATE cbus SET updated_at = datetime('now') WHERE id = ?").run(req.params.id);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update misc charge
router.put('/:id/misc-charges/:chargeId', (req, res) => {
  try {
    const { name, description, amount } = req.body;
    db.prepare('UPDATE cbu_misc_charges SET name = COALESCE(?, name), description = COALESCE(?, description), amount = COALESCE(?, amount) WHERE id = ? AND cbu_id = ?')
      .run(name, description, amount, req.params.chargeId, req.params.id);
    db.prepare("UPDATE cbus SET updated_at = datetime('now') WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete misc charge
router.delete('/:id/misc-charges/:chargeId', (req, res) => {
  try {
    db.prepare('DELETE FROM cbu_misc_charges WHERE id = ? AND cbu_id = ?').run(req.params.chargeId, req.params.id);
    db.prepare("UPDATE cbus SET updated_at = datetime('now') WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
