const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { db, DATA_DIR } = require('../database');

const upload = multer({ dest: path.join(DATA_DIR, 'uploads') });

// Category mapping from spreadsheet headers to our categories
const CATEGORY_MAP = {
  'Video': 'Video Security',
  'Environmental Sensor': 'Environmental Sensors',
  'Access Control': 'Access Control',
  'Intercoms': 'Intercoms',
  'Alarms': 'Alarms',
  'Workplace': 'Workplace',
  'Connectivity': 'Connectivity',
  'Platform Accessories': 'Platform Accessories',
  'Support/Services': 'Support/Services'
};

// Parse the Verkada price book format
function parseVerkadaPriceBook(workbook) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  const products = [];
  let currentCategory = null;
  let currentSubcategory = null;
  let headerRow = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(v => v === null || v === undefined || v === '')) continue;

    const nonNullVals = row.filter(v => v !== null && v !== undefined && v !== '');

    // Detect header row with column names
    if (row[0] === 'Model' || (typeof row[0] === 'string' && row[0].includes('Model'))) {
      headerRow = i;
      continue;
    }

    // Detect category headers (single value rows with known category names)
    const firstVal = row[0] ? String(row[0]).trim() : '';

    // Check if this is a main category line
    const isCategoryLine = Object.keys(CATEGORY_MAP).some(k => firstVal === k) ||
      firstVal === 'Video' || firstVal === 'Verkada Horn';

    // Check if this is a subcategory line
    const isSubcategoryLine = ['Hardware', 'Licenses', 'Accessories', 'Government Hardware',
      'Government Licenses', 'Smart Inputs', 'vLink Hubs', 'IO Peripherals', 'POE', 'Tablets',
      'Classic Alarms Hardware [Only Available Outside of US]',
      'Classic Alarms Licenses [Only Available Outside of US and Canada]',
      'Classic Alarms Licenses',
      'New Alarms Hardware [Only Available in US and Canada]',
      'New Alarms Licenses [Only Available in US and Canada]'
    ].includes(firstVal) || firstVal.includes('Alarms Hardware') || firstVal.includes('Alarms Licenses');

    if (nonNullVals.length <= 2 && (isCategoryLine || isSubcategoryLine)) {
      if (isCategoryLine) {
        currentCategory = CATEGORY_MAP[firstVal] || firstVal;
        currentSubcategory = null;
      } else if (isSubcategoryLine) {
        currentSubcategory = firstVal;
      }
      continue;
    }

    // Skip meta rows
    if (firstVal.includes('Verkada Reseller') || firstVal.includes('Gold Plus') ||
        firstVal.includes('Region:') || firstVal.includes('Partner Tier:') ||
        firstVal.includes('Currency:') || firstVal.includes('Effective Date:') ||
        firstVal.includes('CONFIDENTIAL') || firstVal === 'Standard' ||
        firstVal === 'Discount Class') continue;

    // Product row: should have SKU-like pattern in first column and a price
    if (firstVal && row[1] && row[2] !== null && row[2] !== undefined) {
      const sku = String(row[0]).trim();
      // Skip if it looks like a formula or header
      if (sku.startsWith('=') || sku === 'Model') continue;

      const description = row[1] ? String(row[1]).trim() : '';
      const listPrice = typeof row[2] === 'number' ? row[2] : parseFloat(String(row[2]).replace(/[,$]/g, '')) || 0;
      const discountClass = row[3] ? String(row[3]).trim() : '';

      // Determine product type from subcategory
      const isLicense = currentSubcategory && (currentSubcategory.toLowerCase().includes('license'));
      const isAccessory = currentSubcategory && (currentSubcategory.toLowerCase().includes('accessor') ||
        currentSubcategory.toLowerCase().includes('smart input') || currentSubcategory.toLowerCase().includes('vlink') ||
        currentSubcategory.toLowerCase().includes('io peripheral') || currentSubcategory.toLowerCase().includes('poe') ||
        currentSubcategory.toLowerCase().includes('tablet'));
      const isHardware = !isLicense && !isAccessory;

      // Try to determine image URL from SKU
      let imageUrl = null;
      if (isHardware && currentCategory) {
        const baseModel = sku.replace(/-HW$/, '').replace(/-\d+TB.*$/, '').replace(/-\d+GB.*$/, '')
          .replace(/-256.*$/, '').replace(/-512.*$/, '').replace(/-768.*$/, '')
          .replace(/-1TB.*$/, '').replace(/-2TB.*$/, '').replace(/-3TB.*$/, '')
          .replace(/-4TB.*$/, '').replace(/-6TB.*$/, '').replace(/-8TB.*$/, '')
          .replace(/-30.*$/, '').replace(/-60.*$/, '').replace(/-90.*$/, '').replace(/-120.*$/, '').replace(/-365.*$/, '');
        const categoryPath = currentCategory.toLowerCase().replace(/\s+/g, '%20');
        imageUrl = `https://cdn.verkada.com/image/upload/c_limit,w_256/f_auto/q_auto/v1//uploads/Pricing%20product/${categoryPath}/${baseModel}.png`;
      }

      products.push({
        sku,
        name: description.split(',')[0] || sku,
        description,
        list_price: listPrice,
        discount_class: discountClass,
        category: currentCategory || 'Uncategorized',
        subcategory: currentSubcategory || (isLicense ? 'Licenses' : isAccessory ? 'Accessories' : 'Hardware'),
        is_main_product: isHardware ? 1 : 0,
        is_license: isLicense ? 1 : 0,
        is_accessory: isAccessory ? 1 : 0,
        image_url: imageUrl
      });
    }
  }

  return products;
}

// Preview import - shows what would be imported/updated
router.post('/preview', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const workbook = XLSX.readFile(req.file.path);
    const products = parseVerkadaPriceBook(workbook);

    // Compare with existing products
    const existingProducts = db.prepare('SELECT sku, list_price, name, description FROM products').all();
    const existingMap = {};
    for (const p of existingProducts) existingMap[p.sku] = p;

    const newProducts = [];
    const updatedProducts = [];
    const unchangedProducts = [];

    for (const product of products) {
      const existing = existingMap[product.sku];
      if (!existing) {
        newProducts.push(product);
      } else if (existing.list_price !== product.list_price) {
        updatedProducts.push({
          ...product,
          old_price: existing.list_price,
          new_price: product.list_price
        });
      } else {
        unchangedProducts.push(product);
      }
    }

    // Clean up temp file
    fs.unlinkSync(req.file.path);

    res.json({
      total: products.length,
      new_products: newProducts,
      updated_products: updatedProducts,
      unchanged_count: unchangedProducts.length,
      categories: [...new Set(products.map(p => p.category))],
      subcategories: [...new Set(products.map(p => `${p.category} > ${p.subcategory}`))]
    });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: err.message });
  }
});

// Execute import
router.post('/execute', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const workbook = XLSX.readFile(req.file.path);
    const products = parseVerkadaPriceBook(workbook);

    // Parse selected items from body
    const selectedSkus = req.body.selected_skus ? JSON.parse(req.body.selected_skus) : null;
    const skipUpdates = req.body.skip_updates === 'true';

    let imported = 0;
    let updated = 0;
    let skipped = 0;

    const importTransaction = db.transaction(() => {
      // Ensure categories and subcategories exist
      const catCache = {};
      const subCatCache = {};

      for (const product of products) {
        if (selectedSkus && !selectedSkus.includes(product.sku)) {
          skipped++;
          continue;
        }

        // Get or create category
        if (!catCache[product.category]) {
          let cat = db.prepare('SELECT id FROM product_categories WHERE name = ?').get(product.category);
          if (!cat) {
            const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM product_categories').get();
            const r = db.prepare('INSERT INTO product_categories (name, sort_order) VALUES (?, ?)').run(product.category, (maxOrder.m || 0) + 1);
            cat = { id: r.lastInsertRowid };
          }
          catCache[product.category] = cat.id;
        }

        // Get or create subcategory
        const subKey = `${product.category}:${product.subcategory}`;
        if (!subCatCache[subKey]) {
          let sub = db.prepare('SELECT id FROM product_subcategories WHERE category_id = ? AND name = ?')
            .get(catCache[product.category], product.subcategory);
          if (!sub) {
            const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM product_subcategories WHERE category_id = ?').get(catCache[product.category]);
            const r = db.prepare('INSERT INTO product_subcategories (category_id, name, sort_order) VALUES (?, ?, ?)')
              .run(catCache[product.category], product.subcategory, (maxOrder.m || 0) + 1);
            sub = { id: r.lastInsertRowid };
          }
          subCatCache[subKey] = sub.id;
        }

        const subcategory_id = subCatCache[subKey];

        // Check if product exists
        const existing = db.prepare('SELECT id, list_price FROM products WHERE sku = ?').get(product.sku);

        if (existing) {
          if (!skipUpdates && existing.list_price !== product.list_price) {
            db.prepare(`UPDATE products SET list_price = ?, description = ?, name = ?, discount_class = ?, image_url = COALESCE(?, image_url), updated_at = datetime('now') WHERE id = ?`)
              .run(product.list_price, product.description, product.name, product.discount_class, product.image_url, existing.id);
            updated++;
          } else {
            skipped++;
          }
        } else {
          db.prepare(`INSERT INTO products (subcategory_id, sku, name, description, list_price, discount_class, image_url, is_main_product, is_accessory, is_license) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(subcategory_id, product.sku, product.name, product.description, product.list_price, product.discount_class, product.image_url, product.is_main_product, product.is_accessory, product.is_license);
          imported++;
        }
      }
    });

    importTransaction();

    // Clean up temp file
    fs.unlinkSync(req.file.path);

    res.json({ imported, updated, skipped, total: products.length });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: err.message });
  }
});

// Import CBU from JSON (re-import previously exported CBU)
router.post('/cbu', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const content = fs.readFileSync(req.file.path, 'utf-8');
    const data = JSON.parse(content);

    const importCbu = db.transaction(() => {
      const { nanoid } = require('nanoid');
      const share_id = nanoid(12);

      const result = db.prepare(`
        INSERT INTO cbus (share_id, project_name, client_name, address, description, created_by, verbal_narrative, folder_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(share_id, data.project_name, data.client_name, data.address, data.description, data.created_by, data.verbal_narrative, data.folder_id || null, data.status || 'draft');

      const cbu_id = result.lastInsertRowid;

      // Import items
      if (data.items && data.items.length) {
        const insertItem = db.prepare(`
          INSERT INTO cbu_items (cbu_id, product_id, sku, name, description, list_price, quantity, sort_order, item_type)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const item of data.items) {
          // Try to find product by SKU
          let product_id = null;
          if (item.sku) {
            const p = db.prepare('SELECT id FROM products WHERE sku = ?').get(item.sku);
            if (p) product_id = p.id;
          }
          insertItem.run(cbu_id, product_id, item.sku, item.name, item.description, item.list_price, item.quantity, item.sort_order || 0, item.item_type || 'product');
        }
      }

      // Import misc charges
      if (data.misc_charges && data.misc_charges.length) {
        const insertCharge = db.prepare(`
          INSERT INTO cbu_misc_charges (cbu_id, name, description, amount, sort_order)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const charge of data.misc_charges) {
          insertCharge.run(cbu_id, charge.name, charge.description, charge.amount, charge.sort_order || 0);
        }
      }

      return { id: cbu_id, share_id };
    });

    const result = importCbu();
    fs.unlinkSync(req.file.path);
    res.json(result);
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
