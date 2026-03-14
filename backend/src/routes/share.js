const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { generateHtml, getCbuData } = require('./export');

// Get shared CBU by share_id (public view)
router.get('/:shareId', (req, res) => {
  try {
    const cbu = db.prepare('SELECT id FROM cbus WHERE share_id = ?').get(req.params.shareId);
    if (!cbu) return res.status(404).json({ error: 'CBU not found' });

    const fullCbu = getCbuData(cbu.id);
    const html = generateHtml(fullCbu, true);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get share data as JSON (for frontend to display)
router.get('/:shareId/data', (req, res) => {
  try {
    const cbu = db.prepare('SELECT id FROM cbus WHERE share_id = ?').get(req.params.shareId);
    if (!cbu) return res.status(404).json({ error: 'CBU not found' });

    const fullCbu = getCbuData(cbu.id);
    res.json(fullCbu);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
