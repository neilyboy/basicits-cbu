const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initialize, DATA_DIR } = require('./database');

const productRoutes = require('./routes/products');
const cbuRoutes = require('./routes/cbus');
const folderRoutes = require('./routes/folders');
const importRoutes = require('./routes/import');
const exportRoutes = require('./routes/export');
const shareRoutes = require('./routes/share');
const imageRoutes = require('./routes/images');
const databaseRoutes = require('./routes/database');

const app = express();
const PORT = process.env.PORT || 3099;

// Ensure directories exist
const imgDir = path.join(DATA_DIR, 'product-images');
const uploadDir = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Initialize database
initialize();

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve product images
app.use('/images', express.static(imgDir));

// Serve logo
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));

// API routes
app.use('/api/products', productRoutes);
app.use('/api/cbus', cbuRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/import', importRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/share', shareRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/database', databaseRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Basic ITS CBU Backend running on port ${PORT}`);
});
