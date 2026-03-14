const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const { db, DATA_DIR } = require('../database');

function getCbuData(id) {
  const cbu = db.prepare(`
    SELECT c.*, f.name as folder_name
    FROM cbus c LEFT JOIN cbu_folders f ON c.folder_id = f.id
    WHERE c.id = ?
  `).get(id);
  if (!cbu) return null;

  cbu.items = db.prepare(`
    SELECT ci.*, p.image_url, p.local_image, pc.name as category_name, ps.name as subcategory_name
    FROM cbu_items ci
    LEFT JOIN products p ON ci.product_id = p.id
    LEFT JOIN product_subcategories ps ON p.subcategory_id = ps.id
    LEFT JOIN product_categories pc ON ps.category_id = pc.id
    WHERE ci.cbu_id = ? ORDER BY ci.sort_order, ci.id
  `).all(id);

  cbu.misc_charges = db.prepare('SELECT * FROM cbu_misc_charges WHERE cbu_id = ? ORDER BY sort_order, id').all(id);
  cbu.items_total = cbu.items.reduce((s, i) => s + (i.list_price * i.quantity), 0);
  cbu.misc_total = cbu.misc_charges.reduce((s, c) => s + c.amount, 0);
  cbu.grand_total = cbu.items_total + cbu.misc_total;
  return cbu;
}

// Export as JSON (full CBU data for re-import)
router.get('/:id/json', (req, res) => {
  try {
    const cbu = getCbuData(req.params.id);
    if (!cbu) return res.status(404).json({ error: 'CBU not found' });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="CBU-${cbu.project_name.replace(/[^a-zA-Z0-9]/g, '_')}.json"`);
    res.json(cbu);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export as CSV
router.get('/:id/csv', (req, res) => {
  try {
    const cbu = getCbuData(req.params.id);
    if (!cbu) return res.status(404).json({ error: 'CBU not found' });

    const rows = [
      ['Basic ITS - Cost Build Up'],
      [],
      ['Project Name', cbu.project_name],
      ['Client Name', cbu.client_name || ''],
      ['Address', cbu.address || ''],
      ['Description', cbu.description || ''],
      ['Created By', cbu.created_by || ''],
      ['Date', new Date(cbu.created_at).toLocaleDateString()],
      [],
      ['Installation Narrative'],
      [cbu.verbal_narrative || ''],
      [],
      ['LINE ITEMS'],
      ['#', 'SKU', 'Name', 'Description', 'Unit Price', 'Qty', 'Line Total'],
    ];

    cbu.items.forEach((item, idx) => {
      rows.push([
        idx + 1, item.sku || '', item.name, item.description || '',
        item.list_price, item.quantity, item.list_price * item.quantity
      ]);
    });

    rows.push([], ['', '', '', '', '', 'Items Subtotal:', cbu.items_total]);

    if (cbu.misc_charges.length) {
      rows.push([], ['ADDITIONAL CHARGES']);
      rows.push(['#', 'Name', 'Description', '', '', '', 'Amount']);
      cbu.misc_charges.forEach((charge, idx) => {
        rows.push([idx + 1, charge.name, charge.description || '', '', '', '', charge.amount]);
      });
      rows.push(['', '', '', '', '', 'Misc Subtotal:', cbu.misc_total]);
    }

    rows.push([], ['', '', '', '', '', 'GRAND TOTAL:', cbu.grand_total]);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'CBU');
    const csv = XLSX.utils.sheet_to_csv(ws);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="CBU-${cbu.project_name.replace(/[^a-zA-Z0-9]/g, '_')}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export as XLSX
router.get('/:id/xlsx', (req, res) => {
  try {
    const cbu = getCbuData(req.params.id);
    if (!cbu) return res.status(404).json({ error: 'CBU not found' });

    const wb = XLSX.utils.book_new();

    // Summary sheet
    const summaryRows = [
      ['Basic ITS - Cost Build Up'],
      [],
      ['Project Name', cbu.project_name],
      ['Client Name', cbu.client_name || ''],
      ['Address', cbu.address || ''],
      ['Description', cbu.description || ''],
      ['Created By', cbu.created_by || ''],
      ['Date', new Date(cbu.created_at).toLocaleDateString()],
      ['Status', cbu.status],
      [],
      ['Installation Narrative'],
      [cbu.verbal_narrative || ''],
      [],
      ['Items Total', cbu.items_total],
      ['Misc Charges', cbu.misc_total],
      ['Grand Total', cbu.grand_total],
    ];
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
    summaryWs['!cols'] = [{ wch: 20 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

    // Line items sheet
    const itemRows = [['#', 'SKU', 'Name', 'Description', 'Category', 'Unit Price', 'Qty', 'Line Total']];
    cbu.items.forEach((item, idx) => {
      itemRows.push([
        idx + 1, item.sku || '', item.name, item.description || '',
        item.category_name || '', item.list_price, item.quantity, item.list_price * item.quantity
      ]);
    });
    itemRows.push([], ['', '', '', '', '', '', 'Subtotal:', cbu.items_total]);
    const itemsWs = XLSX.utils.aoa_to_sheet(itemRows);
    itemsWs['!cols'] = [{ wch: 5 }, { wch: 20 }, { wch: 30 }, { wch: 50 }, { wch: 18 }, { wch: 12 }, { wch: 6 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, itemsWs, 'Line Items');

    // Misc charges sheet
    if (cbu.misc_charges.length) {
      const miscRows = [['#', 'Name', 'Description', 'Amount']];
      cbu.misc_charges.forEach((charge, idx) => {
        miscRows.push([idx + 1, charge.name, charge.description || '', charge.amount]);
      });
      miscRows.push([], ['', '', 'Subtotal:', cbu.misc_total]);
      const miscWs = XLSX.utils.aoa_to_sheet(miscRows);
      miscWs['!cols'] = [{ wch: 5 }, { wch: 30 }, { wch: 50 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, miscWs, 'Additional Charges');
    }

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="CBU-${cbu.project_name.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export as PDF
router.get('/:id/pdf', (req, res) => {
  try {
    const cbu = getCbuData(req.params.id);
    if (!cbu) return res.status(404).json({ error: 'CBU not found' });

    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="CBU-${cbu.project_name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf"`);
    doc.pipe(res);

    // Try to add logo
    const logoPath = path.join(__dirname, '..', '..', 'assets', 'logo.png');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, 40, { width: 120 });
      doc.moveDown(3);
    }

    // Header
    doc.fontSize(22).fillColor('#1a1a2e').text('Cost Build Up', { align: 'center' });
    doc.moveDown(0.5);

    // Project info
    doc.fontSize(10).fillColor('#666');
    const infoY = doc.y;
    doc.text(`Project: ${cbu.project_name}`, 50, infoY);
    doc.text(`Client: ${cbu.client_name || 'N/A'}`, 50);
    doc.text(`Address: ${cbu.address || 'N/A'}`, 50);
    doc.text(`Created By: ${cbu.created_by || 'N/A'}`, 50);
    doc.text(`Date: ${new Date(cbu.created_at).toLocaleDateString()}`, 50);

    if (cbu.description) {
      doc.moveDown(0.5);
      doc.fontSize(9).fillColor('#444').text(`Description: ${cbu.description}`);
    }

    if (cbu.verbal_narrative) {
      doc.moveDown(0.5);
      doc.fontSize(9).fillColor('#444').text(`Installation Narrative: ${cbu.verbal_narrative}`);
    }

    doc.moveDown(1);

    // Line items table
    doc.fontSize(14).fillColor('#1a1a2e').text('Line Items', 50);
    doc.moveDown(0.5);

    // Table header
    const tableTop = doc.y;
    const col = { num: 50, sku: 70, name: 160, price: 390, qty: 450, total: 490 };
    doc.fontSize(8).fillColor('#fff');
    doc.rect(50, tableTop, 512, 18).fill('#1a1a2e');
    doc.text('#', col.num + 4, tableTop + 5);
    doc.text('SKU', col.sku + 4, tableTop + 5);
    doc.text('Description', col.name + 4, tableTop + 5);
    doc.text('Unit Price', col.price + 4, tableTop + 5);
    doc.text('Qty', col.qty + 4, tableTop + 5);
    doc.text('Line Total', col.total + 4, tableTop + 5);

    let y = tableTop + 20;
    doc.fillColor('#333');

    cbu.items.forEach((item, idx) => {
      if (y > 700) {
        doc.addPage();
        y = 50;
      }
      const bg = idx % 2 === 0 ? '#f8f9fa' : '#fff';
      doc.rect(50, y, 512, 16).fill(bg);
      doc.fillColor('#333').fontSize(7);
      doc.text(String(idx + 1), col.num + 4, y + 4, { width: 16 });
      doc.text(item.sku || '', col.sku + 4, y + 4, { width: 86 });
      doc.text(item.name, col.name + 4, y + 4, { width: 220 });
      doc.text(`$${item.list_price.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, col.price + 4, y + 4, { width: 55 });
      doc.text(String(item.quantity), col.qty + 4, y + 4, { width: 30 });
      doc.text(`$${(item.list_price * item.quantity).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, col.total + 4, y + 4, { width: 68 });
      y += 16;
    });

    // Subtotal
    y += 4;
    doc.fontSize(9).fillColor('#1a1a2e');
    doc.text(`Items Subtotal: $${cbu.items_total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 400, y, { align: 'right', width: 162 });
    y += 20;

    // Misc charges
    if (cbu.misc_charges.length) {
      if (y > 650) { doc.addPage(); y = 50; }
      doc.fontSize(14).fillColor('#1a1a2e').text('Additional Charges', 50, y);
      y += 25;

      cbu.misc_charges.forEach((charge, idx) => {
        if (y > 700) { doc.addPage(); y = 50; }
        doc.fontSize(8).fillColor('#333');
        doc.text(`${charge.name}${charge.description ? ' - ' + charge.description : ''}`, 60, y);
        doc.text(`$${charge.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 400, y, { align: 'right', width: 162 });
        y += 16;
      });

      y += 4;
      doc.fontSize(9).fillColor('#1a1a2e');
      doc.text(`Misc Subtotal: $${cbu.misc_total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 400, y, { align: 'right', width: 162 });
      y += 20;
    }

    // Grand total
    if (y > 700) { doc.addPage(); y = 50; }
    doc.rect(50, y, 512, 28).fill('#1a1a2e');
    doc.fontSize(13).fillColor('#fff');
    doc.text(`Grand Total: $${cbu.grand_total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 60, y + 7, { align: 'right', width: 492 });

    // Footer
    doc.fontSize(7).fillColor('#999').text('Generated by Basic ITS - Cost Build Up System', 50, 740, { align: 'center', width: 512 });

    doc.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export as HTML (standalone file)
router.get('/:id/html', (req, res) => {
  try {
    const cbu = getCbuData(req.params.id);
    if (!cbu) return res.status(404).json({ error: 'CBU not found' });

    const html = generateHtml(cbu);
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="CBU-${cbu.project_name.replace(/[^a-zA-Z0-9]/g, '_')}.html"`);
    res.send(html);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function generateHtml(cbu, isShare = false) {
  const fmt = (n) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  let itemRows = cbu.items.map((item, idx) => `
    <tr class="${idx % 2 === 0 ? 'bg-gray-50' : ''}">
      <td class="px-3 py-2 text-sm">${idx + 1}</td>
      <td class="px-3 py-2 text-sm font-mono">${item.sku || ''}</td>
      <td class="px-3 py-2 text-sm">
        <div class="flex items-center gap-2">
          ${item.image_url || item.local_image ? `<img src="${item.local_image ? '/images/' + item.local_image : item.image_url}" class="w-8 h-8 object-contain" onerror="this.style.display='none'"/>` : ''}
          <div>
            <div class="font-medium">${item.name}</div>
            ${item.description ? `<div class="text-xs text-gray-500">${item.description}</div>` : ''}
          </div>
        </div>
      </td>
      <td class="px-3 py-2 text-sm text-right">${fmt(item.list_price)}</td>
      <td class="px-3 py-2 text-sm text-center">${item.quantity}</td>
      <td class="px-3 py-2 text-sm text-right font-medium">${fmt(item.list_price * item.quantity)}</td>
    </tr>
  `).join('');

  let miscRows = cbu.misc_charges.map((charge, idx) => `
    <tr class="${idx % 2 === 0 ? 'bg-gray-50' : ''}">
      <td class="px-3 py-2 text-sm">${idx + 1}</td>
      <td class="px-3 py-2 text-sm font-medium">${charge.name}</td>
      <td class="px-3 py-2 text-sm">${charge.description || ''}</td>
      <td class="px-3 py-2 text-sm text-right font-medium">${fmt(charge.amount)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CBU - ${cbu.project_name}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>@media print { .no-print { display: none; } body { font-size: 11px; } }</style>
</head>
<body class="bg-gray-100 min-h-screen">
  <div class="max-w-5xl mx-auto py-8 px-4">
    <div class="bg-white rounded-xl shadow-lg overflow-hidden">
      <div class="bg-gradient-to-r from-slate-800 to-slate-900 text-white px-8 py-6">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-bold">Cost Build Up</h1>
            <p class="text-slate-300 text-sm mt-1">Basic ITS</p>
          </div>
          <div class="text-right text-sm text-slate-300">
            <div>${new Date(cbu.created_at).toLocaleDateString()}</div>
            ${cbu.status ? `<div class="mt-1 inline-block px-2 py-0.5 rounded bg-slate-700 text-xs uppercase">${cbu.status}</div>` : ''}
          </div>
        </div>
      </div>
      <div class="px-8 py-6">
        <div class="grid grid-cols-2 gap-4 mb-6">
          <div><span class="text-xs text-gray-500 uppercase">Project Name</span><p class="font-semibold">${cbu.project_name}</p></div>
          <div><span class="text-xs text-gray-500 uppercase">Client</span><p class="font-semibold">${cbu.client_name || 'N/A'}</p></div>
          <div><span class="text-xs text-gray-500 uppercase">Address</span><p>${cbu.address || 'N/A'}</p></div>
          <div><span class="text-xs text-gray-500 uppercase">Created By</span><p>${cbu.created_by || 'N/A'}</p></div>
        </div>
        ${cbu.description ? `<div class="mb-4"><span class="text-xs text-gray-500 uppercase">Description</span><p class="text-sm">${cbu.description}</p></div>` : ''}
        ${cbu.verbal_narrative ? `<div class="mb-6 bg-blue-50 rounded-lg p-4"><span class="text-xs text-blue-600 uppercase font-medium">Installation Narrative</span><p class="text-sm mt-1">${cbu.verbal_narrative}</p></div>` : ''}

        <h2 class="text-lg font-bold mt-6 mb-3">Line Items</h2>
        <div class="overflow-x-auto">
          <table class="w-full border-collapse">
            <thead>
              <tr class="bg-slate-800 text-white text-xs uppercase">
                <th class="px-3 py-2 text-left w-10">#</th>
                <th class="px-3 py-2 text-left">SKU</th>
                <th class="px-3 py-2 text-left">Item</th>
                <th class="px-3 py-2 text-right">Unit Price</th>
                <th class="px-3 py-2 text-center">Qty</th>
                <th class="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>${itemRows}</tbody>
            <tfoot>
              <tr class="border-t-2 border-slate-200">
                <td colspan="5" class="px-3 py-2 text-right font-semibold text-sm">Items Subtotal:</td>
                <td class="px-3 py-2 text-right font-bold text-sm">${fmt(cbu.items_total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        ${cbu.misc_charges.length ? `
        <h2 class="text-lg font-bold mt-6 mb-3">Additional Charges</h2>
        <div class="overflow-x-auto">
          <table class="w-full border-collapse">
            <thead>
              <tr class="bg-slate-700 text-white text-xs uppercase">
                <th class="px-3 py-2 text-left w-10">#</th>
                <th class="px-3 py-2 text-left">Name</th>
                <th class="px-3 py-2 text-left">Description</th>
                <th class="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>${miscRows}</tbody>
            <tfoot>
              <tr class="border-t-2 border-slate-200">
                <td colspan="3" class="px-3 py-2 text-right font-semibold text-sm">Misc Subtotal:</td>
                <td class="px-3 py-2 text-right font-bold text-sm">${fmt(cbu.misc_total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        ` : ''}

        <div class="mt-8 bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl p-6 text-white flex justify-between items-center">
          <span class="text-lg font-medium">Grand Total</span>
          <span class="text-3xl font-bold">${fmt(cbu.grand_total)}</span>
        </div>
      </div>
      <div class="px-8 py-4 bg-gray-50 text-center text-xs text-gray-400">
        Generated by Basic ITS - Cost Build Up System &bull; ${new Date().toLocaleDateString()}
      </div>
    </div>
    <div class="text-center mt-4 no-print">
      <button onclick="window.print()" class="bg-slate-800 text-white px-6 py-2 rounded-lg text-sm hover:bg-slate-700">Print / Save as PDF</button>
    </div>
  </div>
</body>
</html>`;
}

module.exports = router;
module.exports.generateHtml = generateHtml;
module.exports.getCbuData = getCbuData;
