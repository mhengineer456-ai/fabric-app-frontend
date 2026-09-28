import React, { useState, useEffect, useMemo, useRef } from 'react';
import { store } from '../store.js';
import {
  Calendar, Search, Download, RefreshCw, Layers, Scissors, CheckCircle, Table as TableIcon, ChevronDown, X
} from 'lucide-react';
import * as XLSX from "xlsx-js-style";
import { jsPDF } from 'jspdf';

const monthMap = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
};

const normalizeDateToYMD = (val) => {
  if (!val || val === 'all' || val === '—') return '';
  const s = String(val).replace(/[\u00a0\r\n\t]+/g, ' ').trim();
  if (!s || s === 'null' || s === 'undefined') return '';

  // 1. Exact ISO or YYYY-MM-DD
  const ymd = s.match(/\b(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})\b/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  }

  // 2. Exact DD-MM-YYYY or DD/MM/YYYY
  const dmy = s.match(/\b(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})\b/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }

  // 3. String containing year and English month (e.g. "Sat Aug 22 2026 ...", "22 Aug 2026", "Aug 22 2026")
  const yrMatch = s.match(/\b(20\d{2})\b/);
  const monMatch = s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i);

  if (yrMatch && monMatch) {
    const yr = yrMatch[1];
    const mNum = monthMap[monMatch[1].toLowerCase()];
    let day = '01';
    const allNums = s.match(/\b(\d{1,2})\b/g) || [];
    for (const num of allNums) {
      const n = parseInt(num, 10);
      if (n >= 1 && n <= 31 && num.length <= 2) {
        day = num.padStart(2, '0');
        break;
      }
    }
    return `${yr}-${mNum}-${day}`;
  }

  // 4. Native Date parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${da}`;
  }

  return '';
};

const BUDGET_SHEET_ID = "1Hj3JeJEKB43aYYWv8gk2UhdU6BWuEQfCg5pBlTdBMNA";
const API_KEY = "AIzaSyAomDFBkOySlIxKWSKGHe6ATv9gvaBr7uk";

const fetchLiveCuttingTablesFromGoogle = async () => {
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${BUDGET_SHEET_ID}/values/Cutting!A:F?key=${API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return {};
    const json = await res.json();
    const values = json.values || [];

    const lotTableMap = {};
    let currentLot = null;

    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      if (!row || row.length === 0) continue;

      const colA = String(row[0] || '').trim();
      const colB = String(row[1] || '').trim();

      const lotMatchA = colA.match(/lot\s*(?:number:?)?\s*(\d+)/i);
      if (lotMatchA) {
        currentLot = lotMatchA[1];
      }

      if (colA.toLowerCase().replace(/[^a-z]/g, '').includes('lotnumber') && colB && !isNaN(Number(colB))) {
        currentLot = String(colB).trim();
      }

      if (currentLot && colB && !colB.toLowerCase().includes('table') && !isNaN(Number(colB))) {
        const tableNum = Number(colB);
        if (tableNum >= 1 && tableNum <= 50) {
          lotTableMap[currentLot] = `Table ${tableNum}`;
        }
      } else if (currentLot && colB && colB.toLowerCase().startsWith('table')) {
        lotTableMap[currentLot] = colB;
      }
    }
    return lotTableMap;
  } catch (err) {
    console.warn("Could not fetch Cutting sheet table map:", err);
    return {};
  }
};

const fetchLiveIndexSheetFromGoogle = async () => {
  const [indexRes, cuttingTableMap] = await Promise.all([
    fetch(`https://sheets.googleapis.com/v4/spreadsheets/${BUDGET_SHEET_ID}/values/Index!A:AZ?key=${API_KEY}`),
    fetchLiveCuttingTablesFromGoogle()
  ]);

  if (!indexRes.ok) throw new Error(`Google Sheets fetch error: ${indexRes.statusText}`);
  const json = await indexRes.json();
  const values = json.values || [];
  if (values.length === 0) return [];

  const rawHeaders = values[0] || [];
  const hmap = {};
  rawHeaders.forEach((h, i) => {
    const clean = String(h || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (clean) hmap[clean] = i;
  });

  const getCol = (row, ...aliases) => {
    for (const a of aliases) {
      const key = a.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (hmap[key] != null && hmap[key] < row.length) {
        const val = String(row[hmap[key]] || '').trim();
        if (val) return val;
      }
    }
    return '';
  };

  const records = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row || row.length === 0) continue;

    const lot = getCol(row, 'lot number', 'lot no', 'lot') || String(row[0] || '').trim();
    if (!lot || isNaN(Number(lot))) continue;

    const fabric = getCol(row, 'fabric', 'fabric description', 'fabric name') || String(row[4] || '—').trim();
    const garmentType = getCol(row, 'garment type', 'garment') || String(row[5] || '—').trim();
    const style = getCol(row, 'style') || String(row[6] || '—').trim();
    const supervisor = getCol(row, 'supervisor', 'fabric supervisor') || String(row[11] || 'System').trim();
    const partyName = getCol(row, 'party name', 'party') || String(row[13] || '—').trim();
    const brand = getCol(row, 'brand') || String(row[14] || '—').trim();
    const savedAt = getCol(row, 'saved at', 'savedat', 'saved date', 'cutting date', 'date') || String(row[23] || '').trim();
    const qtyStr = getCol(row, 'cutting qty', 'cuttingqty', 'qty', 'total qty', 'pcs') || String(row[25] || '0').trim();
    const cuttingQty = parseFloat(qtyStr.replace(/,/g, '')) || 0;

    const rawTable = getCol(row, 'cutting table', 'table');
    const cuttingTable = cuttingTableMap[lot] || (rawTable ? (rawTable.toLowerCase().startsWith('table') ? rawTable : `Table ${rawTable}`) : 'Table 1');

    // Only include rows where Saved at is populated (completed cuts)
    if (savedAt) {
      records.push({
        "Lot No": lot,
        "Fabric": fabric || '—',
        "Style": style || '—',
        "Brand": brand || '—',
        "Garment Type": garmentType || '—',
        "Party Name": partyName || '—',
        "Cutting Table": cuttingTable,
        "Saved At": savedAt,
        "Supervisor": supervisor || 'System',
        "Total Qty": cuttingQty
      });
    }
  }

  // Reverse so newest lots appear on top
  return records.reverse();
};

export default function DailyCuttingReport() {
  const [selectedDate, setSelectedDate] = useState(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [cachedAttendance, setCachedAttendance] = useState(null);
  const [reportData, setReportData] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [tableCutterMap, setTableCutterMap] = useState({});
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
  const [dateSearchQuery, setDateSearchQuery] = useState('');
  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDateDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchReport = async (refresh = false) => {
    setLoading(true);
    try {
      // Pre-fetch attendance in parallel for instant PDF export
      getTodayAttendanceText().then(att => {
        if (att) setCachedAttendance(att);
      }).catch(() => {});

      // 1. Fetch live Google Sheets Index tab directly for 100% real-time accuracy
      let rawList = [];
      try {
        rawList = await fetchLiveIndexSheetFromGoogle();
      } catch (sheetErr) {
        console.warn("Direct Google Sheet fetch failed, falling back to database API:", sheetErr);
        const response = await store.getDailyCuttingCompletedReport(refresh, 'all');
        if (response && response.success) {
          rawList = response.data || [];
        }
      }

      setReportData(rawList);

      // Auto-select latest available cut date if today has 0 entries
      const datesCount = {};
      rawList.forEach(r => {
        const raw = r["Saved At"] || r["savedAt"] || r["Saved at"] || r["Cutting Date"] || '';
        const ymd = normalizeDateToYMD(raw);
        if (ymd) datesCount[ymd] = (datesCount[ymd] || 0) + 1;
      });

      const sortedDates = Object.keys(datesCount).sort((a, b) => b.localeCompare(a));
      const todayYMD = new Date().toISOString().slice(0, 10);
      if (!datesCount[todayYMD] && sortedDates.length > 0) {
        setSelectedDate(sortedDates[0]);
      }
      setLoading(false);

      store.getTables().then(tablesRes => {
        if (tablesRes && tablesRes.success) {
          const mapping = {};
          (tablesRes.data || []).forEach(t => {
            if (t.name && t.CutterMaster && t.CutterMaster.name) {
              const cleanName = String(t.name).toLowerCase().replace('table', '').trim();
              mapping[cleanName] = t.CutterMaster.name;
              mapping[String(t.name).toLowerCase().trim()] = t.CutterMaster.name;
            }
          });
          setTableCutterMap(mapping);
        }
      }).catch(() => {});

    } catch (err) {
      console.error("Error loading daily cutting report:", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport(false);
  }, []);

  // Compute available dates with lot counts
  const availableDates = useMemo(() => {
    const counts = {};
    (reportData || []).forEach(item => {
      const raw = item["Saved At"] || item["savedAt"] || item["Saved at"] || item["Cutting Date"] || '';
      const ymd = normalizeDateToYMD(raw);
      if (ymd) {
        counts[ymd] = (counts[ymd] || 0) + 1;
      }
    });
    return Object.entries(counts).sort((a, b) => b[0].localeCompare(a[0]));
  }, [reportData]);

  // Filter available dates based on search query inside dropdown
  const filteredAvailableDates = useMemo(() => {
    if (!dateSearchQuery.trim()) return availableDates;
    const q = dateSearchQuery.trim().toLowerCase();
    return availableDates.filter(([d]) => {
      return d.toLowerCase().includes(q);
    });
  }, [availableDates, dateSearchQuery]);

  const targetDateYMD = normalizeDateToYMD(selectedDate);

  // Filter based on selected date and search term
  const filteredData = useMemo(() => {
    return reportData.filter(item => {
      const rawSavedAt = item["Saved At"] || item["savedAt"] || item["Saved at"] || item["Cutting Date"] || '';
      const itemYMD = normalizeDateToYMD(rawSavedAt);

      if (selectedDate && selectedDate !== 'all' && targetDateYMD) {
        if (!itemYMD || itemYMD !== targetDateYMD) return false;
      }

      const q = searchTerm.trim().toLowerCase();
      const searchMatch = !q ||
        String(item["Lot No"] || '').toLowerCase().includes(q) ||
        String(item["Job Order No"] || '').toLowerCase().includes(q) ||
        String(item["Fabric"] || '').toLowerCase().includes(q) ||
        String(item["Brand"] || '').toLowerCase().includes(q) ||
        String(item["Garment Type"] || '').toLowerCase().includes(q) ||
        String(item["Party Name"] || '').toLowerCase().includes(q) ||
        String(item["Cutting Table"] || '').toLowerCase().includes(q);

      return searchMatch;
    });
  }, [reportData, selectedDate, targetDateYMD, searchTerm]);

  // Statistics calculation
  const stats = useMemo(() => {
    let totalQty = 0;
    const activeTables = new Set();
    const uniqueFabrics = new Set();

    filteredData.forEach(item => {
      totalQty += parseFloat(item["Total Qty"]) || 0;
      if (item["Cutting Table"]) activeTables.add(item["Cutting Table"]);
      if (item["Fabric"]) uniqueFabrics.add(item["Fabric"]);
    });

    return {
      totalLots: filteredData.length,
      totalQty,
      activeTablesCount: activeTables.size,
      uniqueFabricsCount: uniqueFabrics.size
    };
  }, [filteredData]);

  const cutterMasterTotals = useMemo(() => {
    const cmTotals = {};
    filteredData.forEach(item => {
      const tableStr = String(item["Cutting Table"] || '').trim();
      const tables = tableStr.split(/[, \s]+/).map(t => t.toLowerCase().replace('table', '').trim()).filter(Boolean);
      const qty = parseFloat(item["Total Qty"]) || 0;

      if (tables.length > 0) {
        const resolvedCMs = new Set();
        tables.forEach(t => {
          const cmName = tableCutterMap[t] || tableCutterMap['table ' + t];
          if (cmName) resolvedCMs.add(cmName);
        });

        if (resolvedCMs.size > 0) {
          const cmList = Array.from(resolvedCMs);
          const share = qty / cmList.length;
          cmList.forEach(cm => {
            cmTotals[cm] = (cmTotals[cm] || 0) + share;
          });
        } else {
          cmTotals['Unassigned'] = (cmTotals['Unassigned'] || 0) + qty;
        }
      } else {
        cmTotals['Unassigned'] = (cmTotals['Unassigned'] || 0) + qty;
      }
    });

    const roundedTotals = {};
    Object.entries(cmTotals).forEach(([name, val]) => {
      roundedTotals[name] = Math.round(val);
    });
    return roundedTotals;
  }, [filteredData, tableCutterMap]);

  // Helper to fetch today's attendance (reused with cache)
  const getTodayAttendanceText = async () => {
    if (cachedAttendance) return cachedAttendance;

    const todayStr = new Date().toISOString().slice(0, 10);
    let hodsPresent = 0;
    let supervisorsPresent = 0;
    let helpersPresent = 0;
    const absentees = [];

    const safeParseJSON = (val) => {
      if (!val) return [];
      if (typeof val === 'object') return val;
      try { return JSON.parse(val); } catch (e) { return []; }
    };

    try {
      const attRes = await Promise.race([
        store.getAttendance(todayStr),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 600))
      ]).catch(() => null);

      if (attRes && attRes.success && attRes.data) {
        attRes.data.forEach(record => {
          const recordHods = safeParseJSON(record.hods);
          const recordSups = safeParseJSON(record.supervisors);
          const recordHelpers = safeParseJSON(record.helpers);

          recordHods.forEach(h => {
            if (h.status === 'Present' || h.status === 'Half Day') {
              hodsPresent++;
            } else if (h.status === 'Absent') {
              absentees.push(`${h.name} (HOD)`);
            }
          });

          recordSups.forEach(s => {
            if (s.status === 'Present' || s.status === 'Half Day') {
              supervisorsPresent++;
            } else if (s.status === 'Absent') {
              absentees.push(`${s.name} (Supervisor)`);
            }
          });

          recordHelpers.forEach(hp => {
            if (hp.status === 'Present' || hp.status === 'Half Day') {
              helpersPresent++;
            } else if (hp.status === 'Absent') {
              absentees.push(`${hp.name} (Helper)`);
            }
          });
        });
      }
    } catch (e) {
      console.error("Failed to load today's attendance for PDF:", e);
    }

    const uniqueAbsentees = [...new Set(absentees)];

    const resObj = {
      summary: `HODs Present: ${hodsPresent} | Supervisors Present: ${supervisorsPresent} | Helpers Present: ${helpersPresent}`,
      absenteesText: uniqueAbsentees.length > 0 ? `Absentees: ${uniqueAbsentees.join(', ')}` : "Absentees: None"
    };

    setCachedAttendance(resObj);
    return resObj;
  };

  // Export to Excel
  const exportToExcel = () => {
    if (filteredData.length === 0) {
      alert("No data available to export.");
      return;
    }

    const headers = [
      "SR", "Lot No", "Fabric", "Style", "Brand",
      "Garment Type", "Party Name", "Cutting Table", "Saved At", "Total Qty"
    ];

    const rows = filteredData.map((item, idx) => [
      idx + 1,
      item["Lot No"] || '—',
      item["Fabric"] || '—',
      item["Style"] || '—',
      item["Brand"] || '—',
      item["Garment Type"] || '—',
      item["Party Name"] || '—',
      item["Cutting Table"] || '—',
      item["Saved At"] || item["Cutting Date"] || '—',
      parseFloat(item["Total Qty"]) || 0
    ]);

    // Append total row
    rows.push([
      "Total", "", "", "", "", "", "", "", "",
      filteredData.reduce((sum, item) => sum + (parseFloat(item["Total Qty"]) || 0), 0)
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const range = XLSX.utils.decode_range(ws['!ref']);

    // Style Header Row
    for (let c = range.s.c; c <= range.e.c; c++) {
      const headerCell = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[headerCell]) {
        ws[headerCell].s = {
          fill: { fgColor: { rgb: "4F46E5" } }, // Indigo 600
          font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
          alignment: { horizontal: "center", vertical: "center" }
        };
      }
    }

    // Set Column Widths
    ws['!cols'] = [
      { wch: 6 }, { wch: 12 }, { wch: 15 }, { wch: 25 }, { wch: 15 },
      { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 12 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Daily Cutting Summary");
    XLSX.writeFile(wb, `Daily_Cutting_Report_${selectedDate}.xlsx`);
  };

  // Export to PDF with Today's Attendance Summary (Side-by-Side)
  const exportToPdf = async () => {
    if (filteredData.length === 0) {
      alert("No data available to export.");
      return;
    }

    setPdfLoading(true);

    setTimeout(async () => {
      try {
        const attData = await getTodayAttendanceText();

        const doc = new jsPDF({
          orientation: "landscape",
          unit: "pt",
          format: "a4"
        });

    const PAGE_W = doc.internal.pageSize.getWidth();
    const PAGE_H = doc.internal.pageSize.getHeight();
    const M = 30; // Margins
    let y = 35;

    const setFont = (style, size) => {
      doc.setFont("helvetica", style);
      doc.setFontSize(size);
    };

    const drawPageBorder = () => {
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(1.2);
      doc.rect(M - 10, 15, PAGE_W - 2 * (M - 10), PAGE_H - 30);
    };

    drawPageBorder();

    // Left Side - Blank Circle with Number inside (Non-colorful Black & White)
    const circleR = 12;
    const circleX = M + 15 + circleR;
    const circleY = y + 17;

    // Draw Blank Circle with clean solid black border
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(1.4);
    doc.circle(circleX, circleY, circleR, "FD");

    // Round number written inside the circle
    doc.setTextColor(0, 0, 0);
    setFont("bold", 12);
    doc.text("2", circleX, circleY + 4, { align: "center" });

    // Numbering Label & Title
    setFont("bold", 8);
    doc.setTextColor(0, 0, 0);
    doc.text("2ND REPORT", M + 45, y + 11);

    setFont("bold", 13);
    doc.setTextColor(0, 0, 0);
    doc.text("DAILY CUTTING PRODUCTION REPORT", M + 45, y + 25);

    setFont("normal", 8);
    doc.setTextColor(80, 80, 80);
    doc.text(`Date: ${selectedDate}  |  Generated on: ${new Date().toLocaleString()}`, M + 45, y + 36);

    // Right Side - Today's Attendance Block
    doc.setTextColor(0, 0, 0);
    setFont("bold", 8);
    doc.text("TODAY'S ATTENDANCE SUMMARY", PAGE_W - M - 290, y + 10);
    setFont("normal", 7.5);
    doc.setTextColor(60, 60, 60);
    doc.text(attData.summary, PAGE_W - M - 290, y + 21);
    doc.text(attData.absenteesText, PAGE_W - M - 290, y + 31);

    // Divider Line
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(1);
    doc.line(M, y + 44, PAGE_W - M, y + 44);

    y += 58;

    // Summary Metrics Box
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(1);
    doc.rect(M, y, PAGE_W - 2 * M, 45); // Outer border box

    const colWidth = (PAGE_W - 2 * M) / 4;
    doc.line(M + colWidth, y, M + colWidth, y + 45);
    doc.line(M + 2 * colWidth, y, M + 2 * colWidth, y + 45);
    doc.line(M + 3 * colWidth, y, M + 3 * colWidth, y + 45);

    doc.setTextColor(0, 0, 0);
    setFont("bold", 8.5);
    doc.text("TOTAL LOTS CUT", M + 15, y + 16);
    doc.text("TOTAL QUANTITY (PCS)", M + colWidth + 15, y + 16);
    doc.text("ACTIVE CUTTING TABLES", M + 2 * colWidth + 15, y + 16);
    doc.text("UNIQUE FABRIC TYPES", M + 3 * colWidth + 15, y + 16);

    setFont("bold", 11);
    doc.text(`${stats.totalLots} Lots`, M + 15, y + 34);
    doc.text(`${stats.totalQty.toLocaleString()} PCS`, M + colWidth + 15, y + 34);
    doc.text(`${stats.activeTablesCount} Tables`, M + 2 * colWidth + 15, y + 34);
    doc.text(`${stats.uniqueFabricsCount} Fabrics`, M + 3 * colWidth + 15, y + 34);

    y += 65;

    const cmTextParts = Object.entries(cutterMasterTotals).map(([name, qty]) => `${name}: ${qty.toLocaleString()} PCS`);
    const cmSummaryString = cmTextParts.length > 0 ? "Cutter Master Wise Summary:  " + cmTextParts.join("  |  ") : "";

    if (cmSummaryString) {
      setFont("bold", 9);
      doc.setTextColor(30, 41, 59);
      doc.text(cmSummaryString, M + 15, y);
      y += 18;
    }

    // --- Table Column Settings ---
    const headers = [
      { label: "SR", w: 30, align: "center" },
      { label: "Lot No", w: 60, align: "center" },
      { label: "Fabric Description", w: 120, align: "center" },
      { label: "Style", w: 140, align: "center" },
      { label: "Brand", w: 90, align: "center" },
      { label: "Garment Type", w: 90, align: "center" },
      { label: "Cutting Table", w: 100, align: "center" },
      { label: "Total Qty", w: 70, align: "center" }
    ];

    const totalTableWidth = headers.reduce((sum, h) => sum + h.w, 0);
    const scaleFactor = (PAGE_W - 2 * M) / totalTableWidth;
    headers.forEach(h => { h.w = h.w * scaleFactor; });

    const drawTableHeader = (currentY) => {
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(1.1);
      doc.rect(M, currentY, PAGE_W - 2 * M, 22);

      doc.setTextColor(0, 0, 0);
      setFont("bold", 9);

      let curX = M;
      headers.forEach(h => {
        let xOffset = 5;
        if (h.align === "right") xOffset = h.w - 5;
        else if (h.align === "center") xOffset = h.w / 2;

        doc.text(h.label, curX + xOffset, currentY + 14, { align: h.align });

        if (curX > M) {
          doc.line(curX, currentY, curX, currentY + 22);
        }
        curX += h.w;
      });
    };

    drawTableHeader(y);
    y += 22;

    // Draw Rows
    filteredData.forEach((item, idx) => {
      if (y > PAGE_H - 55) {
        doc.addPage();
        drawPageBorder();
        y = 40;
        drawTableHeader(y);
        y += 22;
      }

      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.7);
      doc.rect(M, y, PAGE_W - 2 * M, 20);

      doc.setTextColor(0, 0, 0);
      setFont("normal", 8.5);

      const rowVals = [
        (idx + 1).toString(),
        item["Lot No"] || '—',
        String(item["Fabric"] || '—').length > 40 ? String(item["Fabric"]).substring(0, 37) + "..." : (item["Fabric"] || '—'),
        item["Style"] || '—',
        item["Brand"] || '—',
        item["Garment Type"] || '—',
        item["Cutting Table"] || '—',
        parseFloat(item["Total Qty"] || 0).toLocaleString()
      ];

      let rowX = M;
      headers.forEach((h, colIdx) => {
        let xOffset = 5;
        if (h.align === "right") xOffset = h.w - 5;
        else if (h.align === "center") xOffset = h.w / 2;

        doc.text(rowVals[colIdx], rowX + xOffset, y + 13, { align: h.align });

        if (rowX > M) {
          doc.line(rowX, y, rowX, y + 20);
        }
        rowX += h.w;
      });

      y += 20;
    });

    // Check page overflow for total row
    if (y > PAGE_H - 55) {
      doc.addPage();
      drawPageBorder();
      y = 40;
      drawTableHeader(y);
      y += 22;
    }

    // Draw Total Row
    doc.setFillColor(250, 250, 250);
    doc.rect(M, y, PAGE_W - 2 * M, 20, "F");
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(1.1);
    doc.rect(M, y, PAGE_W - 2 * M, 20);

    doc.setTextColor(0, 0, 0);
    setFont("bold", 8.5);

    let rowX = M;
    headers.forEach((h, colIdx) => {
      let xOffset = 5;
      if (h.align === "right") xOffset = h.w - 5;
      else if (h.align === "center") xOffset = h.w / 2;

      let val = "";
      if (colIdx === 6) {
        val = "Total:";
      } else if (colIdx === 7) {
        val = stats.totalQty.toLocaleString();
      }

      if (val) {
        doc.text(val, rowX + xOffset, y + 13, { align: h.align });
      }

      if (rowX > M) {
        doc.line(rowX, y, rowX, y + 20);
      }
      rowX += h.w;
    });

    // --- ADD FABRIC & GARMENT TYPE SUMMARY DASHBOARD PAGE ---
    // Aggregate data
    const fabricMap = {};
    const garmentMap = {};
    filteredData.forEach(item => {
      const qty = parseFloat(item["Total Qty"]) || 0;
      const fabric = item["Fabric"] || 'Unknown Fabric';
      const gType = item["Garment Type"] || 'Unknown Garment Type';
      fabricMap[fabric] = (fabricMap[fabric] || 0) + qty;
      garmentMap[gType] = (garmentMap[gType] || 0) + qty;
    });

    const fabricSummaries = Object.entries(fabricMap)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty);
    const garmentSummaries = Object.entries(garmentMap)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty);

    const neededHeight = Math.max(fabricSummaries.length, garmentSummaries.length) * 18 + 40;
    const samePage = (y + neededHeight <= PAGE_H - 45);

    if (!samePage) {
      doc.addPage();
      drawPageBorder();
      y = 35;

      // Header for Summary Page
      setFont("bold", 11);
      doc.setTextColor(0, 0, 0);
      doc.text("DAILY CUTTING SUMMARY DASHBOARD", M + 15, y + 10);
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(1);
      doc.line(M, y + 18, PAGE_W - M, y + 18);
      y += 35;
    } else {
      y += 20; // Add space below the main table
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.8);
      doc.line(M, y, PAGE_W - M, y);
      y += 18;
    }

    const halfWidth = (PAGE_W - 2 * M - 20) / 2;
    const rightColumnX = M + halfWidth + 20;
    const startY = y;

    // 1. Left Side: Fabric Summary Table
    setFont("bold", 9.5);
    doc.setTextColor(30, 41, 59); // slate-800
    doc.text("Fabric Wise Summary", M + 10, y - 6);
    
    // Table Header
    doc.setFillColor(30, 27, 75); // Dark Indigo #1e1b4b
    doc.setDrawColor(30, 27, 75);
    doc.setLineWidth(0.8);
    doc.rect(M, y, halfWidth, 20, "FD");
    
    doc.setTextColor(255, 255, 255);
    setFont("bold", 8.5);
    doc.text("Fabric Description", M + 8, y + 13);
    doc.text("Qty (Pcs)", M + halfWidth - 8, y + 13, { align: "right" });
    
    y += 20;

    doc.setLineWidth(0.5);
    doc.setDrawColor(226, 232, 240); // light gray #e2e8f0

    fabricSummaries.forEach((f, fIdx) => {
      if (y > PAGE_H - 45) {
        doc.addPage();
        drawPageBorder();
        y = 40;
      }
      
      // Alternating row background
      if (fIdx % 2 === 0) {
        doc.setFillColor(248, 250, 252); // #f8fafc
        doc.rect(M, y, halfWidth, 18, "FD");
      } else {
        doc.setFillColor(255, 255, 255);
        doc.rect(M, y, halfWidth, 18, "FD");
      }
      
      doc.setTextColor(51, 65, 85); // slate-700
      setFont("normal", 8);
      const displayName = String(f.name).length > 38 ? String(f.name).substring(0, 35) + "..." : f.name;
      doc.text(displayName, M + 8, y + 12);
      
      doc.setTextColor(15, 23, 42); // slate-900
      setFont("bold", 8);
      doc.text(f.qty.toLocaleString(), M + halfWidth - 8, y + 12, { align: "right" });
      y += 18;
    });

    // Fabric Total Row
    doc.setFillColor(241, 245, 249); // #f1f5f9
    doc.setDrawColor(203, 213, 225); // #cbd5e1
    doc.rect(M, y, halfWidth, 18, "FD");
    doc.setTextColor(15, 23, 42);
    setFont("bold", 8);
    doc.text("Total Pieces:", M + 8, y + 12);
    doc.text(stats.totalQty.toLocaleString(), M + halfWidth - 8, y + 12, { align: "right" });

    // 2. Right Side: Garment Type Summary Table
    let yRight = startY;
    setFont("bold", 9.5);
    doc.setTextColor(30, 41, 59);
    doc.text("Garment Type Wise Summary", rightColumnX + 10, yRight - 6);

    // Table Header
    doc.setFillColor(30, 27, 75);
    doc.setDrawColor(30, 27, 75);
    doc.setLineWidth(0.8);
    doc.rect(rightColumnX, yRight, halfWidth, 20, "FD");
    
    doc.setTextColor(255, 255, 255);
    setFont("bold", 8.5);
    doc.text("Garment Type", rightColumnX + 8, yRight + 13);
    doc.text("Qty (Pcs)", rightColumnX + halfWidth - 8, yRight + 13, { align: "right" });

    yRight += 20;

    doc.setLineWidth(0.5);
    doc.setDrawColor(226, 232, 240);

    garmentSummaries.forEach((g, gIdx) => {
      if (yRight > PAGE_H - 45) {
        yRight = 40;
      }
      
      if (gIdx % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(rightColumnX, yRight, halfWidth, 18, "FD");
      } else {
        doc.setFillColor(255, 255, 255);
        doc.rect(rightColumnX, yRight, halfWidth, 18, "FD");
      }
      
      doc.setTextColor(51, 65, 85);
      setFont("normal", 8);
      const displayName = String(g.name).length > 38 ? String(g.name).substring(0, 35) + "..." : g.name;
      doc.text(displayName, rightColumnX + 8, yRight + 12);
      
      doc.setTextColor(15, 23, 42);
      setFont("bold", 8);
      doc.text(g.qty.toLocaleString(), rightColumnX + halfWidth - 8, yRight + 12, { align: "right" });
      yRight += 18;
    });

    // Garment Total Row
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.rect(rightColumnX, yRight, halfWidth, 18, "FD");
    doc.setTextColor(15, 23, 42);
    setFont("bold", 8);
    doc.text("Total Pieces:", rightColumnX + 8, yRight + 12);
    doc.text(stats.totalQty.toLocaleString(), rightColumnX + halfWidth - 8, yRight + 12, { align: "right" });

    doc.save(`Daily_Cutting_Report_${selectedDate}.pdf`);
      } catch (pdfErr) {
        console.error("Failed to generate PDF:", pdfErr);
        alert("Failed to generate PDF. Please try again.");
      } finally {
        setPdfLoading(false);
      }
    }, 10);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%' }}>

      {/* HEADER SECTION */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
        padding: '24px 32px',
        borderRadius: 16,
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
        color: '#ffffff'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '3px 12px 3px 4px',
              borderRadius: '20px',
              border: '1.5px solid #FFFFFF',
              background: 'rgba(255, 255, 255, 0.1)',
              color: '#FFFFFF'
            }}>
              <span style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                border: '1.5px solid #FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: '12px',
                color: '#FFFFFF',
                background: 'rgba(0,0,0,0.2)'
              }}>
                2
              </span>
              <span style={{ fontWeight: 800, fontSize: '11px', letterSpacing: '0.6px', textTransform: 'uppercase' }}>
                2nd Report
              </span>
            </div>
            <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700, color: '#C7D2FE' }}>
              Cutting Operations · 2nd Report
            </span>
          </div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Scissors size={26} style={{ color: '#818cf8' }} /> Daily Cutting Production Report (2nd Report)
          </h1>
          <p style={{ margin: '6px 0 0 0', fontSize: 13, color: '#c7d2fe', fontWeight: 500 }}>
            Completed cutting production lots, style-wise pieces & yield totals.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Refresh Button */}
          <button
            className="btn btn-secondary"
            onClick={() => fetchReport(true)}
            disabled={loading}
            style={{
              height: 40,
              width: 40,
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#ffffff',
              cursor: 'pointer'
            }}
            title="Refresh from Google Sheets"
          >
            <RefreshCw size={16} className={loading ? "spin-animation" : ""} />
          </button>

          {/* Searchable Cut Date Dropdown */}
          <div style={{ position: 'relative' }} ref={dropdownRef}>
            <button
              onClick={() => setDateDropdownOpen(!dateDropdownOpen)}
              style={{
                height: 40,
                padding: '0 14px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.25)',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
              }}
            >
              <Calendar size={15} style={{ color: '#818cf8' }} />
              <span>
                {selectedDate === 'all' 
                  ? `♾️ All Dates (${reportData.length})` 
                  : `📅 ${selectedDate} (${filteredData.length} Lots)`}
              </span>
              <ChevronDown size={14} style={{ transform: dateDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>

            {/* Dropdown Menu with Search */}
            {dateDropdownOpen && (
              <div style={{
                position: 'absolute',
                top: '115%',
                right: 0,
                zIndex: 1000,
                width: '320px',
                backgroundColor: '#1e1b4b',
                border: '1px solid rgba(129, 140, 248, 0.35)',
                borderRadius: 12,
                boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
                padding: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 10
              }}>
                {/* Search Input inside Dropdown */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, color: '#94a3b8' }} />
                  <input
                    type="text"
                    autoFocus
                    placeholder="Search cut date (e.g. 22-08, Aug)..."
                    value={dateSearchQuery}
                    onChange={(e) => setDateSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      height: 36,
                      paddingLeft: 32,
                      paddingRight: 28,
                      backgroundColor: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: 8,
                      color: '#ffffff',
                      fontSize: 12,
                      outline: 'none'
                    }}
                  />
                  {dateSearchQuery && (
                    <X 
                      size={14} 
                      onClick={() => setDateSearchQuery('')} 
                      style={{ position: 'absolute', right: 8, color: '#94a3b8', cursor: 'pointer' }} 
                    />
                  )}
                </div>

                {/* Quick Presets */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => { setSelectedDate('all'); setDateDropdownOpen(false); }}
                    style={{
                      padding: '5px 10px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      backgroundColor: selectedDate === 'all' ? '#4f46e5' : 'rgba(255,255,255,0.08)',
                      color: '#ffffff',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    ♾️ All Dates ({reportData.length})
                  </button>
                  <button
                    onClick={() => { setSelectedDate(new Date().toISOString().slice(0, 10)); setDateDropdownOpen(false); }}
                    style={{
                      padding: '5px 10px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      backgroundColor: selectedDate === new Date().toISOString().slice(0, 10) ? '#4f46e5' : 'rgba(255,255,255,0.08)',
                      color: '#ffffff',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    ⚡ Today
                  </button>
                </div>

                {/* Scrollable list of available dates */}
                <div style={{
                  maxHeight: '260px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4
                }}>
                  {filteredAvailableDates.length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                      No cut dates matching "{dateSearchQuery}"
                    </div>
                  ) : (
                    filteredAvailableDates.map(([d, count]) => {
                      const isSelected = selectedDate === d || targetDateYMD === d;
                      return (
                        <div
                          key={d}
                          onClick={() => {
                            setSelectedDate(d);
                            setDateDropdownOpen(false);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 10px',
                            borderRadius: 8,
                            backgroundColor: isSelected ? 'rgba(79, 70, 229, 0.4)' : 'rgba(255,255,255,0.04)',
                            border: isSelected ? '1px solid #818cf8' : '1px solid transparent',
                            cursor: 'pointer',
                            transition: 'background-color 0.15s'
                          }}
                          onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'; }}
                          onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)'; }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Calendar size={13} style={{ color: isSelected ? '#818cf8' : '#94a3b8' }} />
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#ffffff' }}>{d}</span>
                          </div>
                          <span style={{
                            fontSize: 11,
                            fontWeight: 700,
                            backgroundColor: isSelected ? '#4f46e5' : 'rgba(255,255,255,0.12)',
                            padding: '2px 7px',
                            borderRadius: 12,
                            color: isSelected ? '#ffffff' : '#cbd5e1'
                          }}>
                            {count} {count === 1 ? 'lot' : 'lots'}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Calendar Picker for custom dates */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Calendar size={15} style={{ position: 'absolute', left: 12, color: '#c7d2fe' }} />
            <input
              type="date"
              className="form-control"
              value={selectedDate === 'all' ? '' : selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{
                paddingLeft: 36,
                height: 40,
                width: 155,
                borderRadius: 10,
                backgroundColor: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: 13
              }}
            />
          </div>

          {/* Download PDF */}
          <button
            className="btn btn-secondary"
            onClick={exportToPdf}
            disabled={loading || pdfLoading || filteredData.length === 0}
            style={{
              height: 40,
              borderRadius: 10,
              padding: '0 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: 13,
              opacity: (loading || pdfLoading || filteredData.length === 0) ? 0.6 : 1,
              cursor: (loading || pdfLoading || filteredData.length === 0) ? 'not-allowed' : 'pointer'
            }}
          >
            <Download size={14} className={pdfLoading ? "spin-animation" : ""} />
            {pdfLoading ? "Generating..." : "PDF"}
          </button>

          {/* Excel Export */}
          <button
            className="btn btn-primary"
            onClick={exportToExcel}
            disabled={loading || filteredData.length === 0}
            style={{
              height: 40,
              borderRadius: 10,
              padding: '0 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: '#4f46e5',
              border: '1px solid #4f46e5',
              boxShadow: '0 4px 14px rgba(79, 70, 229, 0.3)',
              color: '#ffffff',
              fontWeight: 750,
              fontSize: 13
            }}
          >
            <Download size={14} /> Export Excel
          </button>
        </div>
      </div>

      {/* STATISTICS CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {/* Card 1: Total Lots */}
        <div className="card premium-card" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', backgroundColor: 'rgba(79,70,229,0.08)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justify: 'center', flexShrink: 0 }}>
            <CheckCircle size={22} style={{ margin: '0 auto' }} />
          </div>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Lots Completed Today</span>
            <strong style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>{stats.totalLots} Lots</strong>
          </div>
        </div>

        {/* Card 2: Total Qty (PCS) */}
        <div className="card premium-card" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', backgroundColor: 'rgba(16,185,129,0.08)', color: '#10b981', display: 'flex', alignItems: 'center', justify: 'center', flexShrink: 0 }}>
            <Layers size={22} style={{ margin: '0 auto' }} />
          </div>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Total Quantity (PCS)</span>
            <strong style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>{stats.totalQty.toLocaleString()}</strong>
          </div>
        </div>

        {/* Card 3: Active Tables */}
        <div className="card premium-card" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', backgroundColor: 'rgba(245,158,11,0.08)', color: '#f59e0b', display: 'flex', alignItems: 'center', justify: 'center', flexShrink: 0 }}>
            <TableIcon size={22} style={{ margin: '0 auto' }} />
          </div>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Active Tables</span>
            <strong style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>{stats.activeTablesCount} Tables</strong>
          </div>
        </div>

        {/* Card 4: Fabrics */}
        <div className="card premium-card" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', backgroundColor: 'rgba(239,68,68,0.08)', color: '#ef4444', display: 'flex', alignItems: 'center', justify: 'center', flexShrink: 0 }}>
            <Scissors size={22} style={{ margin: '0 auto' }} />
          </div>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Fabric Varieties</span>
            <strong style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>{stats.uniqueFabricsCount} Types</strong>
          </div>
        </div>
      </div>

      {/* FILTER & TABLE SECTION */}
      <div className="card premium-card" style={{ padding: 24 }}>

        {/* Cutter Master Summaries */}
        {Object.keys(cutterMasterTotals).length > 0 && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            padding: '12px 16px',
            backgroundColor: 'rgba(79, 70, 229, 0.04)',
            border: '1px solid rgba(79, 70, 229, 0.15)',
            borderRadius: 10,
            marginBottom: 20,
            alignItems: 'center'
          }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Cutter Master Wise Summary:
            </span>
            {Object.entries(cutterMasterTotals).map(([name, qty]) => (
              <div key={name} style={{
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--text-primary)',
                backgroundColor: 'var(--surface)',
                padding: '4px 10px',
                borderRadius: 6,
                border: '1px solid var(--border-light)',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}>
                <span>{name}:</span>
                <strong style={{ color: 'var(--primary)' }}>{qty.toLocaleString()} PCS</strong>
              </div>
            ))}
          </div>
        )}

        {/* Search Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: 1, maxWidth: '400px' }}>
            <Search size={16} style={{ position: 'absolute', left: 14, color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search by lot, order, fabric, table, brand..."
              className="form-control"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: 38, height: 40, borderRadius: 10 }}
            />
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Showing <strong>{filteredData.length}</strong> cut lots
          </div>
        </div>

        {/* TABLE WRAP */}
        <div className="table-wrap" style={{ margin: 0, overflowX: 'auto', border: 'none' }}>
          <table className="custom-report-table" style={{ width: '100%' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-hover)' }}>
                <th style={{ width: '50px', textAlign: 'center' }}>SR</th>
                <th>Lot No</th>
                <th>Fabric Description</th>
                <th>Style</th>
                <th>Brand</th>
                <th>Garment Type</th>
                <th>Party Name</th>
                <th>Cutting Table</th>
                <th>Saved At</th>
                <th style={{ textAlign: 'right' }}>Total Quantity</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '60px 0' }}>
                    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: '38px',
                        height: '38px',
                        border: '4px solid #e2e8f0',
                        borderTop: '4px solid #4f46e5',
                        borderRadius: '50%',
                        animation: 'spin 0.7s linear infinite'
                      }}></div>
                      <span style={{ fontWeight: 700, color: '#334155', fontSize: '14px' }}>
                        ⚡ Syncing Daily Production Data...
                      </span>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>
                        Fetching live cutting indices from database & Google Sheets
                      </span>
                    </div>
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={10}>
                    <div className="empty-state" style={{ padding: '60px 20px', textAlign: 'center' }}>
                      <div style={{
                        display: 'inline-flex',
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        backgroundColor: 'var(--bg)',
                        color: 'var(--text-muted)',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 12
                      }}><Layers size={22} /></div>
                      <h3 style={{ margin: '0 0 6px 0', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>No completed cuts found</h3>
                      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>
                        No completed lot cutting remarks were registered on {selectedDate}.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                <>
                  {filteredData.map((item, idx) => (
                    <tr key={`${item["Lot No"]}-${idx}`} className="hover-row" style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--text-muted)' }}>{idx + 1}</td>
                      <td style={{ fontWeight: 700, color: 'var(--primary)' }}>
                        <span style={{ display: 'inline-block', padding: '3px 6px', borderRadius: 4, backgroundColor: 'var(--primary-light)', fontSize: 11 }}>
                          {item["Lot No"]}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item["Fabric"]}</td>
                      <td style={{ fontWeight: 600 }}>{item["Style"]}</td>
                      <td>{item["Brand"] || '—'}</td>
                      <td>{item["Garment Type"] || '—'}</td>
                      <td>{item["Party Name"] || '—'}</td>
                      <td>
                        {item["Cutting Table"] ? (
                          <span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: 4, backgroundColor: 'rgba(59, 130, 246, 0.08)', color: 'var(--primary)', fontWeight: 600 }}>
                            {item["Cutting Table"]}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }} title={item["Saved At"]}>
                        {(() => {
                          const raw = item["Saved At"] || item["Cutting Date"] || '—';
                          if (!raw || raw === '—') return '—';
                          const match = String(raw).match(/([a-zA-Z]+)\s+([a-zA-Z]+)\s+(\d{1,2})\s+(\d{4})\s+(\d{2}:\d{2}:\d{2})/);
                          if (match) {
                            return `${match[3]} ${match[2]} ${match[4]}, ${match[5]}`;
                          }
                          return String(raw).length > 25 ? String(raw).slice(0, 25) : raw;
                        })()}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {parseFloat(item["Total Qty"] || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ backgroundColor: 'var(--bg-hover)', fontWeight: 800, borderTop: '2.5px double var(--border)', borderBottom: '2.5px double var(--border)' }}>
                    <td colSpan={9} style={{ textAlign: 'right', padding: '10px 15px', color: 'var(--text-primary)', fontSize: 13, fontWeight: 800 }}>
                      Total Quantity (PCS):
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--text-primary)', fontSize: 13, fontWeight: 800 }}>
                      {stats.totalQty.toLocaleString()}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}
