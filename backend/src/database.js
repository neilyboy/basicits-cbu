const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const dbPath = path.join(DATA_DIR, 'cbu.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initialize() {
  db.exec(`
    -- Product categories (Video Security, Access Control, etc.)
    CREATE TABLE IF NOT EXISTS product_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Product subcategories (Hardware, Licenses, Accessories, etc.)
    CREATE TABLE IF NOT EXISTS product_subcategories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES product_categories(id) ON DELETE CASCADE
    );

    -- Products
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subcategory_id INTEGER NOT NULL,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      list_price REAL DEFAULT 0,
      discount_class TEXT,
      image_url TEXT,
      local_image TEXT,
      is_main_product INTEGER DEFAULT 0,
      is_accessory INTEGER DEFAULT 0,
      is_license INTEGER DEFAULT 0,
      parent_product_sku TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (subcategory_id) REFERENCES product_subcategories(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku ON products(sku);

    -- CBU Folders/Labels
    CREATE TABLE IF NOT EXISTS cbu_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      parent_id INTEGER,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (parent_id) REFERENCES cbu_folders(id) ON DELETE CASCADE
    );

    -- CBUs (Cost Build Ups)
    CREATE TABLE IF NOT EXISTS cbus (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      share_id TEXT UNIQUE,
      folder_id INTEGER,
      project_name TEXT NOT NULL,
      client_name TEXT,
      address TEXT,
      description TEXT,
      created_by TEXT,
      verbal_narrative TEXT,
      status TEXT DEFAULT 'draft',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (folder_id) REFERENCES cbu_folders(id) ON DELETE SET NULL
    );

    -- CBU Line Items (hardware/products added to a CBU)
    CREATE TABLE IF NOT EXISTS cbu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cbu_id INTEGER NOT NULL,
      product_id INTEGER,
      sku TEXT,
      name TEXT NOT NULL,
      description TEXT,
      list_price REAL DEFAULT 0,
      quantity INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      parent_item_id INTEGER,
      item_type TEXT DEFAULT 'product',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (cbu_id) REFERENCES cbus(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
      FOREIGN KEY (parent_item_id) REFERENCES cbu_items(id) ON DELETE CASCADE
    );

    -- CBU Misc Charges
    CREATE TABLE IF NOT EXISTS cbu_misc_charges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cbu_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      amount REAL DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (cbu_id) REFERENCES cbus(id) ON DELETE CASCADE
    );
  `);
}

module.exports = { db, initialize, DATA_DIR };
