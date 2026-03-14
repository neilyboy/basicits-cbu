const express = require('express');
const router = express.Router();
const { db } = require('../database');

// Get folder tree
router.get('/', (req, res) => {
  try {
    const folders = db.prepare(`
      SELECT f.*, 
        (SELECT COUNT(*) FROM cbus c WHERE c.folder_id = f.id) as cbu_count
      FROM cbu_folders f 
      ORDER BY f.sort_order, f.name
    `).all();

    // Build tree structure
    const tree = buildTree(folders, null);
    res.json(tree);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function buildTree(folders, parentId) {
  return folders
    .filter(f => f.parent_id === parentId)
    .map(f => ({
      ...f,
      children: buildTree(folders, f.id)
    }));
}

// Create folder
router.post('/', (req, res) => {
  try {
    const { name, parent_id } = req.body;
    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM cbu_folders WHERE parent_id IS ?').get(parent_id || null);
    const result = db.prepare('INSERT INTO cbu_folders (name, parent_id, sort_order) VALUES (?, ?, ?)')
      .run(name, parent_id || null, (maxOrder.m || 0) + 1);
    res.json({ id: result.lastInsertRowid, name, parent_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update folder
router.put('/:id', (req, res) => {
  try {
    const { name, parent_id, sort_order } = req.body;
    db.prepare('UPDATE cbu_folders SET name = COALESCE(?, name), parent_id = ?, sort_order = COALESCE(?, sort_order) WHERE id = ?')
      .run(name, parent_id !== undefined ? parent_id : undefined, sort_order, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete folder
router.delete('/:id', (req, res) => {
  try {
    // Move CBUs in this folder to no folder
    db.prepare('UPDATE cbus SET folder_id = NULL WHERE folder_id = ?').run(req.params.id);
    // Move child folders to parent
    const folder = db.prepare('SELECT parent_id FROM cbu_folders WHERE id = ?').get(req.params.id);
    db.prepare('UPDATE cbu_folders SET parent_id = ? WHERE parent_id = ?')
      .run(folder ? folder.parent_id : null, req.params.id);
    db.prepare('DELETE FROM cbu_folders WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
