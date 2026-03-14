const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const { db, DATA_DIR } = require('../database');

const IMG_DIR = path.join(DATA_DIR, 'product-images');

// Fetch and cache a product image locally
router.post('/fetch', async (req, res) => {
  try {
    const { product_id, image_url } = req.body;
    if (!image_url) return res.status(400).json({ error: 'No image URL provided' });

    const product = product_id ? db.prepare('SELECT sku FROM products WHERE id = ?').get(product_id) : null;
    const filename = product ? `${product.sku.replace(/[^a-zA-Z0-9-]/g, '_')}.png` : `img_${Date.now()}.png`;

    const response = await fetch(image_url);
    if (!response.ok) return res.status(404).json({ error: 'Image not found at URL' });

    const buffer = await response.buffer();
    const filePath = path.join(IMG_DIR, filename);
    fs.writeFileSync(filePath, buffer);

    // Update product if product_id provided
    if (product_id) {
      db.prepare("UPDATE products SET local_image = ?, updated_at = datetime('now') WHERE id = ?")
        .run(filename, product_id);
    }

    res.json({ filename, path: `/images/${filename}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Batch fetch images for all products that have image_url but no local_image
router.post('/fetch-all', async (req, res) => {
  try {
    const products = db.prepare('SELECT id, sku, image_url FROM products WHERE image_url IS NOT NULL AND (local_image IS NULL OR local_image = \'\')').all();

    let fetched = 0;
    let failed = 0;
    const errors = [];

    for (const product of products) {
      try {
        const filename = `${product.sku.replace(/[^a-zA-Z0-9-]/g, '_')}.png`;
        const filePath = path.join(IMG_DIR, filename);

        // Skip if already cached
        if (fs.existsSync(filePath)) {
          db.prepare("UPDATE products SET local_image = ?, updated_at = datetime('now') WHERE id = ?")
            .run(filename, product.id);
          fetched++;
          continue;
        }

        const response = await fetch(product.image_url, { timeout: 10000 });
        if (response.ok) {
          const buffer = await response.buffer();
          fs.writeFileSync(filePath, buffer);
          db.prepare("UPDATE products SET local_image = ?, updated_at = datetime('now') WHERE id = ?")
            .run(filename, product.id);
          fetched++;
        } else {
          failed++;
          errors.push({ sku: product.sku, status: response.status });
        }

        // Small delay to be respectful
        await new Promise(r => setTimeout(r, 100));
      } catch (err) {
        failed++;
        errors.push({ sku: product.sku, error: err.message });
      }
    }

    res.json({ total: products.length, fetched, failed, errors: errors.slice(0, 20) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload a custom product image
const multer = require('multer');
const upload = multer({
  dest: IMG_DIR,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    cb(null, allowed.includes(file.mimetype));
  }
});

router.post('/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No valid image uploaded' });

    const ext = path.extname(req.file.originalname) || '.png';
    const newName = `custom_${Date.now()}${ext}`;
    const newPath = path.join(IMG_DIR, newName);
    fs.renameSync(req.file.path, newPath);

    // Update product if product_id provided
    if (req.body.product_id) {
      db.prepare("UPDATE products SET local_image = ?, updated_at = datetime('now') WHERE id = ?")
        .run(newName, req.body.product_id);
    }

    res.json({ filename: newName, path: `/images/${newName}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
