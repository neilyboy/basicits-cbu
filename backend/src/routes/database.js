const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { db, DATA_DIR } = require('../database');

const IMG_DIR = path.join(DATA_DIR, 'product-images');
const upload = multer({ dest: path.join(DATA_DIR, 'uploads') });

// Export entire product database as ZIP (categories, subcategories, products, images)
router.get('/export', (req, res) => {
  try {
    const categories = db.prepare('SELECT * FROM product_categories ORDER BY sort_order, name').all();
    const subcategories = db.prepare('SELECT * FROM product_subcategories ORDER BY category_id, sort_order, name').all();
    const products = db.prepare('SELECT * FROM products ORDER BY subcategory_id, name').all();

    const zip = new AdmZip();

    // Add JSON manifest
    const manifest = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      counts: {
        categories: categories.length,
        subcategories: subcategories.length,
        products: products.length,
      },
      categories,
      subcategories,
      products,
    };
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));

    // Add all product images
    const imageFiles = new Set();
    for (const p of products) {
      if (p.local_image && !imageFiles.has(p.local_image)) {
        const imgPath = path.join(IMG_DIR, p.local_image);
        if (fs.existsSync(imgPath)) {
          zip.addLocalFile(imgPath, 'images');
          imageFiles.add(p.local_image);
        }
      }
    }

    const zipBuffer = zip.toBuffer();
    const filename = `cbu-product-database-${new Date().toISOString().slice(0, 10)}.zip`;

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': zipBuffer.length,
    });
    res.send(zipBuffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Import product database from ZIP
router.post('/import', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const mode = req.body.mode || 'merge'; // 'merge' or 'replace'
    const zip = new AdmZip(req.file.path);
    const manifestEntry = zip.getEntry('manifest.json');
    if (!manifestEntry) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Invalid database package: missing manifest.json' });
    }

    const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
    if (!manifest.categories || !manifest.subcategories || !manifest.products) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Invalid manifest: missing required data' });
    }

    const stats = { categories: 0, subcategories: 0, products_added: 0, products_updated: 0, images: 0, skipped: 0 };

    // Map old IDs to new IDs
    const categoryMap = {}; // old_id -> new_id
    const subcategoryMap = {}; // old_id -> new_id

    const importDb = db.transaction(() => {
      if (mode === 'replace') {
        // Clear existing data
        db.prepare('DELETE FROM products').run();
        db.prepare('DELETE FROM product_subcategories').run();
        db.prepare('DELETE FROM product_categories').run();
      }

      // Import categories
      for (const cat of manifest.categories) {
        const existing = db.prepare('SELECT id FROM product_categories WHERE name = ?').get(cat.name);
        if (existing) {
          categoryMap[cat.id] = existing.id;
          if (mode === 'replace') {
            db.prepare('UPDATE product_categories SET sort_order = ? WHERE id = ?').run(cat.sort_order || 0, existing.id);
          }
        } else {
          const result = db.prepare('INSERT INTO product_categories (name, sort_order) VALUES (?, ?)').run(cat.name, cat.sort_order || 0);
          categoryMap[cat.id] = result.lastInsertRowid;
          stats.categories++;
        }
      }

      // Import subcategories
      for (const sub of manifest.subcategories) {
        const newCategoryId = categoryMap[sub.category_id];
        if (!newCategoryId) continue;

        const existing = db.prepare('SELECT id FROM product_subcategories WHERE name = ? AND category_id = ?').get(sub.name, newCategoryId);
        if (existing) {
          subcategoryMap[sub.id] = existing.id;
          if (mode === 'replace') {
            db.prepare('UPDATE product_subcategories SET sort_order = ? WHERE id = ?').run(sub.sort_order || 0, existing.id);
          }
        } else {
          const result = db.prepare('INSERT INTO product_subcategories (category_id, name, sort_order) VALUES (?, ?, ?)').run(newCategoryId, sub.name, sub.sort_order || 0);
          subcategoryMap[sub.id] = result.lastInsertRowid;
          stats.subcategories++;
        }
      }

      // Import products
      for (const prod of manifest.products) {
        const newSubcategoryId = subcategoryMap[prod.subcategory_id];
        if (!newSubcategoryId) { stats.skipped++; continue; }

        const existing = db.prepare('SELECT id FROM products WHERE sku = ?').get(prod.sku);
        if (existing) {
          if (mode === 'merge') {
            // Update existing product
            db.prepare(`
              UPDATE products SET
                name = ?, description = ?, list_price = ?, discount_class = ?,
                image_url = ?, local_image = COALESCE(NULLIF(?, ''), local_image),
                is_main_product = ?, is_accessory = ?, is_license = ?,
                parent_product_sku = ?, metadata = ?, subcategory_id = ?,
                updated_at = datetime('now')
              WHERE id = ?
            `).run(
              prod.name, prod.description, prod.list_price || 0, prod.discount_class,
              prod.image_url, prod.local_image || '',
              prod.is_main_product ? 1 : 0, prod.is_accessory ? 1 : 0, prod.is_license ? 1 : 0,
              prod.parent_product_sku, prod.metadata, newSubcategoryId,
              existing.id
            );
            stats.products_updated++;
          } else {
            stats.skipped++;
          }
        } else {
          db.prepare(`
            INSERT INTO products (subcategory_id, sku, name, description, list_price, discount_class,
              image_url, local_image, is_main_product, is_accessory, is_license, parent_product_sku, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            newSubcategoryId, prod.sku, prod.name, prod.description, prod.list_price || 0, prod.discount_class,
            prod.image_url, prod.local_image,
            prod.is_main_product ? 1 : 0, prod.is_accessory ? 1 : 0, prod.is_license ? 1 : 0,
            prod.parent_product_sku, prod.metadata
          );
          stats.products_added++;
        }
      }
    });

    importDb();

    // Extract images
    const imageEntries = zip.getEntries().filter(e => e.entryName.startsWith('images/') && !e.isDirectory);
    for (const entry of imageEntries) {
      const filename = path.basename(entry.entryName);
      const destPath = path.join(IMG_DIR, filename);
      if (!fs.existsSync(destPath)) {
        fs.writeFileSync(destPath, entry.getData());
        stats.images++;
      }
    }

    fs.unlinkSync(req.file.path);
    res.json({ success: true, mode, stats });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
