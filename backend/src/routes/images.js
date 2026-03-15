const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { db, DATA_DIR } = require('../database');

const IMG_DIR = path.join(DATA_DIR, 'product-images');

// Missing images report - grouped by category with counts
router.get('/missing', (req, res) => {
  try {
    const categories = db.prepare(`
      SELECT c.id, c.name, c.sort_order,
        (SELECT COUNT(*) FROM products p JOIN product_subcategories s ON p.subcategory_id = s.id WHERE s.category_id = c.id) as total,
        (SELECT COUNT(*) FROM products p JOIN product_subcategories s ON p.subcategory_id = s.id WHERE s.category_id = c.id AND (p.local_image IS NOT NULL AND p.local_image != '')) as with_image
      FROM product_categories c
      ORDER BY c.sort_order, c.name
    `).all();

    for (const cat of categories) {
      cat.missing = cat.total - cat.with_image;
      cat.subcategories = db.prepare(`
        SELECT s.id, s.name,
          (SELECT COUNT(*) FROM products p WHERE p.subcategory_id = s.id) as total,
          (SELECT COUNT(*) FROM products p WHERE p.subcategory_id = s.id AND (p.local_image IS NOT NULL AND p.local_image != '')) as with_image
        FROM product_subcategories s
        WHERE s.category_id = ?
        ORDER BY s.sort_order, s.name
      `).all(cat.id);

      for (const sub of cat.subcategories) {
        sub.missing = sub.total - sub.with_image;
        sub.products = db.prepare(`
          SELECT id, sku, name, description, local_image, image_url
          FROM products
          WHERE subcategory_id = ? AND (local_image IS NULL OR local_image = '')
          ORDER BY name
        `).all(sub.id);
      }
      // Remove subcategories with no missing products
      cat.subcategories = cat.subcategories.filter(s => s.missing > 0);
    }

    const totalProducts = categories.reduce((a, c) => a + c.total, 0);
    const totalWithImage = categories.reduce((a, c) => a + c.with_image, 0);

    res.json({
      summary: { total: totalProducts, with_image: totalWithImage, missing: totalProducts - totalWithImage },
      categories: categories.filter(c => c.missing > 0),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fill family images - propagate images from products that have them to siblings with same model prefix
router.post('/fill-family', (req, res) => {
  try {
    // Get all products that have images
    const withImages = db.prepare(`
      SELECT id, sku, local_image FROM products
      WHERE local_image IS NOT NULL AND local_image != ''
    `).all();

    // Build model -> image map (first image found wins)
    const modelImageMap = {}; // model prefix -> { local_image, source_sku }
    for (const p of withImages) {
      const match = p.sku.match(/^([A-Za-z]{2,4}\d{1,3})/);
      if (!match) continue;
      const model = match[1].toUpperCase();
      if (!modelImageMap[model]) {
        modelImageMap[model] = { local_image: p.local_image, source_sku: p.sku };
      }
    }

    // Get all products without images
    const withoutImages = db.prepare(`
      SELECT id, sku FROM products
      WHERE local_image IS NULL OR local_image = ''
    `).all();

    let filled = 0;
    let noMatch = 0;
    const updateStmt = db.prepare("UPDATE products SET local_image = ?, updated_at = datetime('now') WHERE id = ?");

    for (const p of withoutImages) {
      const match = p.sku.match(/^([A-Za-z]{2,4}\d{1,3})/);
      if (!match) { noMatch++; continue; }
      const model = match[1].toUpperCase();
      if (modelImageMap[model]) {
        updateStmt.run(modelImageMap[model].local_image, p.id);
        filled++;
      } else {
        noMatch++;
      }
    }

    res.json({
      filled,
      no_match: noMatch,
      families_with_images: Object.keys(modelImageMap).length,
      total_without_images: withoutImages.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Share a single product's image to all family members with the same model prefix
router.post('/share-to-family/:id', (req, res) => {
  try {
    const product = db.prepare('SELECT id, sku, local_image FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (!product.local_image) return res.status(400).json({ error: 'Product has no image to share' });

    const match = product.sku.match(/^([A-Za-z]{2,4}\d{1,3})/);
    if (!match) return res.status(400).json({ error: 'Cannot determine model prefix from SKU' });
    const model = match[1].toUpperCase();

    // Find siblings without images
    const siblings = db.prepare(`
      SELECT id, sku FROM products
      WHERE (local_image IS NULL OR local_image = '')
        AND UPPER(sku) LIKE ? || '%'
        AND id != ?
    `).all(model, product.id);

    const updateStmt = db.prepare("UPDATE products SET local_image = ?, updated_at = datetime('now') WHERE id = ?");
    for (const sib of siblings) {
      updateStmt.run(product.local_image, sib.id);
    }

    res.json({ shared: siblings.length, model, source_sku: product.sku });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get similar product images (from same subcategory/category) for picking
router.get('/similar/:id', (req, res) => {
  try {
    const product = db.prepare(`
      SELECT p.id, p.sku, p.name, p.subcategory_id, s.category_id
      FROM products p
      JOIN product_subcategories s ON p.subcategory_id = s.id
      WHERE p.id = ?
    `).get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    // Get products with images from same subcategory first, then same category
    const sameSubcategory = db.prepare(`
      SELECT DISTINCT p.id, p.sku, p.name, p.local_image, s.name as subcategory_name
      FROM products p
      JOIN product_subcategories s ON p.subcategory_id = s.id
      WHERE p.subcategory_id = ? AND p.id != ? AND p.local_image IS NOT NULL AND p.local_image != ''
      ORDER BY p.name
    `).all(product.subcategory_id, product.id);

    const sameCategory = db.prepare(`
      SELECT DISTINCT p.id, p.sku, p.name, p.local_image, s.name as subcategory_name
      FROM products p
      JOIN product_subcategories s ON p.subcategory_id = s.id
      WHERE s.category_id = ? AND p.subcategory_id != ? AND p.id != ? AND p.local_image IS NOT NULL AND p.local_image != ''
      ORDER BY p.name
    `).all(product.category_id, product.subcategory_id, product.id);

    // Deduplicate by local_image (many variants share the same file)
    const seen = new Set();
    const dedup = (list) => list.filter(p => {
      if (seen.has(p.local_image)) return false;
      seen.add(p.local_image);
      return true;
    });

    res.json({
      product,
      same_subcategory: dedup(sameSubcategory),
      same_category: dedup(sameCategory),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Copy image from one product to another
router.post('/copy-from', (req, res) => {
  try {
    const { source_product_id, target_product_id } = req.body;
    const source = db.prepare('SELECT id, sku, local_image FROM products WHERE id = ?').get(source_product_id);
    if (!source || !source.local_image) return res.status(400).json({ error: 'Source product has no image' });

    db.prepare("UPDATE products SET local_image = ?, updated_at = datetime('now') WHERE id = ?")
      .run(source.local_image, target_product_id);

    res.json({ success: true, local_image: source.local_image });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Web image search using Google Custom Search API
router.get('/web-search/:id', async (req, res) => {
  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    const cx = process.env.GOOGLE_CX;
    if (!apiKey || !cx) {
      return res.status(400).json({
        error: 'Google Custom Search not configured. Set GOOGLE_API_KEY and GOOGLE_CX in your environment.',
        setup_required: true,
      });
    }

    const product = db.prepare('SELECT id, sku, name FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    // Build search query from product name/sku - use model number for best results
    const query = req.query.q || `${product.sku} ${product.name} product image`;

    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('cx', cx);
    url.searchParams.set('q', query);
    url.searchParams.set('searchType', 'image');
    url.searchParams.set('num', '10');
    url.searchParams.set('imgSize', 'medium');
    url.searchParams.set('safe', 'active');

    const response = await fetch(url.toString());
    const data = await response.json();

    if (data.error) {
      return res.status(data.error.code || 500).json({ error: data.error.message });
    }

    const images = (data.items || []).map(item => ({
      url: item.link,
      thumbnail: item.image?.thumbnailLink || item.link,
      title: item.title,
      width: item.image?.width,
      height: item.image?.height,
      source: item.displayLink,
    }));

    res.json({ product, query, images });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download a web image and assign it to a product
router.post('/web-download', async (req, res) => {
  try {
    const { product_id, image_url } = req.body;
    if (!product_id || !image_url) return res.status(400).json({ error: 'product_id and image_url required' });

    const product = db.prepare('SELECT id, sku FROM products WHERE id = ?').get(product_id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const response = await fetch(image_url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BasicITS-CBU/1.0)' },
      timeout: 15000,
    });
    if (!response.ok) return res.status(400).json({ error: `Failed to download image: ${response.status}` });

    const contentType = response.headers.get('content-type') || '';
    let ext = 'png';
    if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = 'jpg';
    else if (contentType.includes('webp')) ext = 'webp';
    else if (contentType.includes('gif')) ext = 'gif';

    const filename = `${product.sku}.${ext}`;
    const filepath = path.join(IMG_DIR, filename);
    const buffer = await response.buffer();

    if (buffer.length < 500) return res.status(400).json({ error: 'Downloaded file too small, likely not a valid image' });

    fs.writeFileSync(filepath, buffer);
    db.prepare("UPDATE products SET local_image = ?, updated_at = datetime('now') WHERE id = ?")
      .run(filename, product.id);

    res.json({ success: true, local_image: filename, size: buffer.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

// Smart image discovery - tries multiple Verkada CDN URL patterns per product
router.post('/discover', async (req, res) => {
  try {
    const CDN_BASE = 'https://cdn.verkada.com/image/upload/c_limit,w_256/f_auto/q_auto/v1/';

    // Extract model code from SKU (first segment before hyphen, lowercased)
    function extractModel(sku) {
      if (!sku) return null;
      // For ACC-* accessories, return full SKU without trailing region/variant
      if (sku.startsWith('ACC-') || sku.startsWith('ACCX-')) return null;
      // For LIC-* licenses, skip
      if (sku.startsWith('LIC-') || sku.startsWith('SPT-') || sku.startsWith('PSV-')) return null;
      // Extract model: first alphanumeric segment (e.g., CB52 from CB52-256E-HW)
      const match = sku.match(/^([A-Za-z]{2,3}\d{1,3})/);
      return match ? match[1].toLowerCase() : null;
    }

    // Build URL patterns to try based on category and model
    function getPatterns(model, modelUpper, categoryName, sku) {
      const patterns = [];

      if (/video security/i.test(categoryName)) {
        patterns.push(
          `img/products/${model}-hero`,
          `img/products/${model}-e-hero`,
          `img/products/${model}`,
          `img/security-cameras/${model}`,
          `guides/products/${model}`,
        );
      } else if (/access control/i.test(categoryName)) {
        patterns.push(
          `img/access-control/access-controllers/${model}`,
          `img/access-control/readers/${model}`,
          `guides/products/${model}`,
          `img/products/${model}`,
        );
      } else if (/intercom/i.test(categoryName)) {
        patterns.push(
          `img/intercom/video-intercom/${model}`,
          `img/intercom/intercom-${modelUpper}`,
          `img/intercom/intercom-${model}`,
          `guides/products/${model}`,
          `img/products/${model}`,
        );
      } else if (/environmental/i.test(categoryName)) {
        patterns.push(
          `img/environmental-monitoring/sensor/${model}`,
          `img/environmental-monitoring/${model}`,
          `img/products/${model}`,
          `guides/products/${model}`,
        );
      } else if (/alarm/i.test(categoryName)) {
        patterns.push(
          `img/alarms/${model}`,
          `img/alarms/alarm-panels/${model}`,
          `img/products/${model}`,
          `guides/products/${model}`,
        );
      } else if (/horn/i.test(categoryName)) {
        patterns.push(
          `img/horn/${model}`,
          `img/products/${model}`,
          `guides/products/${model}`,
        );
      } else if (/connectivity/i.test(categoryName)) {
        patterns.push(
          `img/connectivity/${model}`,
          `img/connectivity/${model}-e`,
          `img/products/${model}`,
          `guides/products/${model}`,
        );
      } else if (/workplace/i.test(categoryName)) {
        patterns.push(
          `img/workplace/${model}`,
          `img/products/${model}`,
          `guides/products/${model}`,
        );
      }

      // Universal fallbacks
      if (!patterns.includes(`img/products/${model}`)) patterns.push(`img/products/${model}`);
      if (!patterns.includes(`guides/products/${model}`)) patterns.push(`guides/products/${model}`);
      if (!patterns.includes(`img/products/${model}-hero`)) patterns.push(`img/products/${model}-hero`);
      if (!patterns.includes(`img/products/${model}-e-hero`)) patterns.push(`img/products/${model}-e-hero`);

      return patterns;
    }

    // Get all hardware products without local images
    const products = db.prepare(`
      SELECT p.id, p.sku, p.name, p.image_url, p.local_image, c.name as category_name
      FROM products p
      JOIN product_subcategories s ON p.subcategory_id = s.id
      JOIN product_categories c ON s.category_id = c.id
      WHERE (p.local_image IS NULL OR p.local_image = '')
      ORDER BY c.sort_order, p.name
    `).all();

    let discovered = 0;
    let failed = 0;
    let skipped = 0;
    const results = [];
    const modelCache = {}; // Cache: model -> working CDN path (so variants reuse the same image)

    for (const product of products) {
      const model = extractModel(product.sku);
      if (!model) {
        skipped++;
        continue;
      }

      const modelUpper = model.toUpperCase();
      const filename = `${product.sku.replace(/[^a-zA-Z0-9-]/g, '_')}.png`;
      const filePath = path.join(IMG_DIR, filename);

      // If file already exists on disk, just update the DB
      if (fs.existsSync(filePath)) {
        db.prepare("UPDATE products SET local_image = ?, updated_at = datetime('now') WHERE id = ?")
          .run(filename, product.id);
        discovered++;
        results.push({ sku: product.sku, status: 'cached', model });
        continue;
      }

      // If we already found a working URL for this model, reuse it
      if (modelCache[model]) {
        try {
          const response = await fetch(modelCache[model], { timeout: 10000 });
          if (response.ok) {
            const buffer = await response.buffer();
            fs.writeFileSync(filePath, buffer);
            db.prepare("UPDATE products SET local_image = ?, image_url = ?, updated_at = datetime('now') WHERE id = ?")
              .run(filename, modelCache[model], product.id);
            discovered++;
            results.push({ sku: product.sku, status: 'reused', model, url: modelCache[model] });
            await new Promise(r => setTimeout(r, 200));
            continue;
          }
        } catch (e) { /* fall through to pattern probing */ }
      }

      // Try each URL pattern
      let found = false;
      const patterns = getPatterns(model, modelUpper, product.category_name, product.sku);

      for (const pattern of patterns) {
        const url = CDN_BASE + pattern;
        try {
          const response = await fetch(url, { timeout: 8000 });
          if (response.ok) {
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('image') || contentType.includes('octet')) {
              const buffer = await response.buffer();
              if (buffer.length > 500) { // Ensure it's not a tiny error placeholder
                fs.writeFileSync(filePath, buffer);
                db.prepare("UPDATE products SET local_image = ?, image_url = ?, updated_at = datetime('now') WHERE id = ?")
                  .run(filename, url, product.id);
                modelCache[model] = url;
                discovered++;
                results.push({ sku: product.sku, status: 'discovered', model, pattern });
                found = true;
                break;
              }
            }
          }
        } catch (e) { /* try next pattern */ }
        await new Promise(r => setTimeout(r, 1500)); // Rate limit - 1.5s to avoid CDN throttling
      }

      if (!found) {
        failed++;
        results.push({ sku: product.sku, status: 'not_found', model });
      }
    }

    res.json({
      total: products.length,
      discovered,
      failed,
      skipped,
      results: results.slice(0, 100),
    });
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

// Bulk ZIP upload - user downloads from Bynder DAM, uploads ZIP, we auto-match to products
const zipUpload = multer({ dest: '/tmp', limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB max

router.post('/upload-zip', zipUpload.single('zipfile'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No ZIP file uploaded' });

    const zip = new AdmZip(req.file.path);
    const entries = zip.getEntries();

    // Get all products with their models for matching
    const products = db.prepare(`
      SELECT p.id, p.sku, p.name, p.local_image FROM products p
    `).all();

    // Build model -> products map
    const modelMap = {}; // model -> [product, ...]
    for (const p of products) {
      const match = p.sku.match(/^([A-Za-z]{2,3}\d{1,3})/);
      if (match) {
        const model = match[1].toUpperCase();
        if (!modelMap[model]) modelMap[model] = [];
        modelMap[model].push(p);
      }
    }

    let matched = 0;
    let unmatched = 0;
    let skippedExisting = 0;
    const results = [];
    const imageExt = ['.png', '.jpg', '.jpeg', '.webp'];

    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const origName = path.basename(entry.entryName);
      const ext = path.extname(origName).toLowerCase();
      if (!imageExt.includes(ext)) continue;

      // Extract potential model codes from filename
      // Filenames like: CB52-E_Product_Photo.png, AC12_front.png, 221117_BC51_Dashboard.png
      const nameUpper = origName.toUpperCase();
      const modelMatches = nameUpper.match(/[A-Z]{2,3}\d{1,3}/g) || [];

      // Find matching products
      let foundProducts = [];
      for (const modelCode of modelMatches) {
        if (modelMap[modelCode]) {
          foundProducts = modelMap[modelCode];
          break;
        }
      }

      if (foundProducts.length === 0) {
        unmatched++;
        results.push({ file: origName, status: 'no_match', models_tried: modelMatches });
        continue;
      }

      // Extract image data
      const buffer = entry.getData();
      if (!buffer || buffer.length < 100) continue;

      // Save image for each matching product variant
      for (const product of foundProducts) {
        // Skip if product already has an image
        if (product.local_image) {
          const existPath = path.join(IMG_DIR, product.local_image);
          if (fs.existsSync(existPath)) {
            skippedExisting++;
            continue;
          }
        }

        const filename = `${product.sku.replace(/[^a-zA-Z0-9-]/g, '_')}${ext}`;
        const filePath = path.join(IMG_DIR, filename);
        fs.writeFileSync(filePath, buffer);
        db.prepare("UPDATE products SET local_image = ?, updated_at = datetime('now') WHERE id = ?")
          .run(filename, product.id);
        matched++;
      }

      results.push({ file: origName, status: 'matched', model: modelMatches[0], products: foundProducts.length });
    }

    // Clean up temp file
    try { fs.unlinkSync(req.file.path); } catch (e) {}

    res.json({
      total_images: entries.filter(e => !e.isDirectory && imageExt.includes(path.extname(e.entryName).toLowerCase())).length,
      matched,
      unmatched,
      skipped_existing: skippedExisting,
      results: results.slice(0, 100),
    });
  } catch (err) {
    // Clean up temp file on error
    if (req.file) try { fs.unlinkSync(req.file.path); } catch (e) {}
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
