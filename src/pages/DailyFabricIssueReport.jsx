import { useState, useEffect, useMemo } from 'react';
import { store } from '../store.js';
import {
  Calendar, Search, Download, RefreshCw, FileText,
  Layers, Scale, Tag, Scissors
} from 'lucide-react';
import * as XLSX from "xlsx-js-style";
import { jsPDF } from 'jspdf';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  AreaChart, Area, PieChart, Pie, Legend, ComposedChart, Line, LineChart
} from 'recharts';

const CHART_COLORS = ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];

// Custom Glassmorphic Tooltip for Professional Graphs
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        padding: '10px 14px',
        borderRadius: '8px',
        boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
        color: '#fff',
        fontSize: '11px',
        fontFamily: 'inherit'
      }}>
        <p style={{ margin: '0 0 6px 0', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</p>
        {payload.map((entry, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: entry.color || entry.fill, display: 'inline-block' }} />
            <span style={{ color: '#cbd5e1' }}>{entry.name}:</span>
            <span style={{ fontWeight: 800, color: '#f8fafc' }}>
              {typeof entry.value === 'number' ? entry.value.toFixed(1) : entry.value}
              {entry.name.toLowerCase().includes('weight') ? ' KG' : ' Roll(s)'}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const normalizeDateToYMD = (val) => {
  if (!val || val === 'all' || val === '—') return '';
  const s = String(val).replace(/[\u00a0\r\n\t]+/g, ' ').trim();
  if (!s || s === 'null' || s === 'undefined') return '';

  const ymd = s.match(/\b(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})\b/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;

  const dmy = s.match(/\b(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})\b/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;

  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${da}`;
  }
  return '';
};

export default function DailyFabricIssueReport() {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30); // Default to last 30 days
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [excelLoading, setExcelLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [cachedAttendance, setCachedAttendance] = useState(null);
  const [reportData, setReportData] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchReport = async () => {
    setLoading(true);
    try {
      // Parallel fetch report data and pre-fetch attendance for instant PDF export
      const [response, attData] = await Promise.all([
        store.getDailyFabricIssuanceReport('', ''),
        getTodayAttendanceText().catch(() => null)
      ]);
      if (response && response.success) {
        setReportData(response.data || []);
      } else {
        setReportData([]);
      }
      if (attData) {
        setCachedAttendance(attData);
      }
    } catch (err) {
      console.error("Error loading daily fabric issue report:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  // Quick preset helper
  const setDatePreset = (preset) => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    if (preset === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === 'yesterday') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const yStr = y.toISOString().slice(0, 10);
      setStartDate(yStr);
      setEndDate(yStr);
    } else if (preset === '7days') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      setStartDate(d.toISOString().slice(0, 10));
      setEndDate(todayStr);
    } else if (preset === '30days') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      setStartDate(d.toISOString().slice(0, 10));
      setEndDate(todayStr);
    } else if (preset === 'all') {
      setStartDate('');
      setEndDate('');
    }
  };

  // General Date & Text Filtering
  const filteredData = useMemo(() => {
    const startYMD = normalizeDateToYMD(startDate);
    const endYMD = normalizeDateToYMD(endDate);

    return reportData.filter(item => {
      // 1. Date Range Filtering
      const rawDate = item.date || item.issuedAt || item.createdAt || '';
      const itemYMD = normalizeDateToYMD(rawDate);

      if (startYMD && itemYMD && itemYMD < startYMD) return false;
      if (endYMD && itemYMD && itemYMD > endYMD) return false;

      // 2. Text Search Filtering
      const q = searchTerm.toLowerCase().trim();
      if (!q) return true;
      return (
        String(item.tableNumber || '').toLowerCase().includes(q) ||
        String(item.fabric || '').toLowerCase().includes(q) ||
        String(item.lotNumber || '').toLowerCase().includes(q) ||
        String(item.jobOrderNo || '').toLowerCase().includes(q) ||
        String(item.shade || '').toLowerCase().includes(q) ||
        String(item.issuedBy || '').toLowerCase().includes(q)
      );
    });
  }, [reportData, startDate, endDate, searchTerm]);

  // Statistics
  const stats = useMemo(() => {
    return filteredData.reduce((acc, curr) => {
      acc.totalRolls += curr.rolls || 0;
      acc.totalWeight += curr.weight || 0;
      acc.uniqueLots.add(curr.lotNumber);
      acc.activeTables.add(curr.tableNumber);
      acc.uniqueFabrics.add(curr.fabric);
      return acc;
    }, {
      totalRolls: 0,
      totalWeight: 0,
      uniqueLots: new Set(),
      activeTables: new Set(),
      uniqueFabrics: new Set()
    });
  }, [filteredData]);

  // Aggregation 1: Table-wise Issuance Summary
  const tableSummary = useMemo(() => {
    const summaryMap = {};
    filteredData.forEach(item => {
      const tbl = item.tableNumber || 'N/A';
      if (!summaryMap[tbl]) {
        summaryMap[tbl] = { name: tbl, rolls: 0, weight: 0, lots: new Set() };
      }
      summaryMap[tbl].rolls += item.rolls || 0;
      summaryMap[tbl].weight += item.weight || 0;
      summaryMap[tbl].lots.add(item.lotNumber);
    });

    return Object.values(summaryMap)
      .map(item => ({
        ...item,
        uniqueLotsCount: item.lots.size,
        percentage: stats.totalRolls > 0 ? Math.round((item.rolls / stats.totalRolls) * 100) : 0
      }))
      .sort((a, b) => b.rolls - a.rolls);
  }, [filteredData, stats.totalRolls]);

  // Aggregation 2: Fabric-wise Summary
  const fabricSummary = useMemo(() => {
    const summaryMap = {};
    filteredData.forEach(item => {
      const fab = item.fabric || '—';
      if (!summaryMap[fab]) {
        summaryMap[fab] = { name: fab, rolls: 0, weight: 0, lots: new Set(), shades: new Set() };
      }
      summaryMap[fab].rolls += item.rolls || 0;
      summaryMap[fab].weight += item.weight || 0;
      summaryMap[fab].lots.add(item.lotNumber);
      summaryMap[fab].shades.add(item.shade);
    });

    return Object.values(summaryMap)
      .map(item => ({
        ...item,
        uniqueLotsCount: item.lots.size,
        uniqueShadesCount: item.shades.size,
        percentage: stats.totalRolls > 0 ? Math.round((item.rolls / stats.totalRolls) * 100) : 0
      }))
      .sort((a, b) => b.rolls - a.rolls);
  }, [filteredData, stats.totalRolls]);

  // Aggregation 3: Daily Issuance Trend
  const trendChartData = useMemo(() => {
    const dailyMap = {};
    filteredData.forEach(item => {
      const date = item.date || 'No Date';
      if (!dailyMap[date]) {
        dailyMap[date] = { date, rolls: 0, weight: 0 };
      }
      dailyMap[date].rolls += item.rolls || 0;
      dailyMap[date].weight += item.weight || 0;
    });
    return Object.values(dailyMap)
      .map(item => ({
        ...item,
        formattedDate: new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredData]);

  // Chart 1: Table-wise Composed Data (rolls and weight combined)
  const tableChartData = useMemo(() => {
    return tableSummary.map(item => ({
      name: item.name,
      rolls: item.rolls,
      weight: item.weight
    }));
  }, [tableSummary]);

  // Chart 2: Fabric-wise (Top 6)
  const fabricChartData = useMemo(() => {
    const data = fabricSummary.map(item => ({
      name: item.name.length > 20 ? item.name.slice(0, 18) + '...' : item.name,
      value: item.rolls
    }));
    if (data.length <= 6) return data;
    const top = data.slice(0, 5);
    const otherRolls = data.slice(5).reduce((acc, curr) => acc + curr.value, 0);
    top.push({ name: 'Other Fabrics', value: otherRolls });
    return top;
  }, [fabricSummary]);

  // Excel exporter (Multi-sheet summary with lot list)
  const exportToExcel = () => {
    if (filteredData.length === 0 || excelLoading) {
      if (filteredData.length === 0) alert("No data available to export.");
      return;
    }

    setExcelLoading(true);
    setToastMessage({ type: 'info', text: '📊 Preparing Excel report...' });

    setTimeout(() => {
      try {
        const tableData = tableSummary.map((item, idx) => ({
          "SR": idx + 1,
          "Table Name": item.name,
          "Lot Number(s)": Array.from(item.lots).sort().join(', '),
          "Total Rolls Issued": item.rolls,
          "Total Weight Issued (KG)": parseFloat(item.weight.toFixed(2)),
          "Unique Lots Count": item.uniqueLotsCount,
          "Roll Share (%)": `${item.percentage}%`
        }));

        const fabricData = fabricSummary.map((item, idx) => ({
          "SR": idx + 1,
          "Fabric Description": item.name,
          "Lot Number(s)": Array.from(item.lots).sort().join(', '),
          "Total Rolls Issued": item.rolls,
          "Total Weight Issued (KG)": parseFloat(item.weight.toFixed(2)),
          "Unique Lots Count": item.uniqueLotsCount,
          "Unique Shades Count": item.uniqueShadesCount,
          "Roll Share (%)": `${item.percentage}%`
        }));

        const wb = XLSX.utils.book_new();

        // Sheet 1: Table Summary
        const wsTable = XLSX.utils.json_to_sheet(tableData);
        let range = XLSX.utils.decode_range(wsTable['!ref']);
        for (let c = range.s.c; c <= range.e.c; c++) {
          const headerCell = XLSX.utils.encode_cell({ r: 0, c });
          if (wsTable[headerCell]) {
            wsTable[headerCell].s = {
              fill: { fgColor: { rgb: "334155" } }, // Slate-700
              font: { bold: true, color: { rgb: "FFFFFF" }, name: "Calibri", sz: 11 },
              alignment: { horizontal: "center", vertical: "center" }
            };
          }
        }
        wsTable['!cols'] = [{ wch: 6 }, { wch: 18 }, { wch: 25 }, { wch: 18 }, { wch: 22 }, { wch: 18 }, { wch: 15 }];
        XLSX.utils.book_append_sheet(wb, wsTable, "Table-wise Summary");

        // Sheet 2: Fabric Summary
        const wsFabric = XLSX.utils.json_to_sheet(fabricData);
        range = XLSX.utils.decode_range(wsFabric['!ref']);
        for (let c = range.s.c; c <= range.e.c; c++) {
          const headerCell = XLSX.utils.encode_cell({ r: 0, c });
          if (wsFabric[headerCell]) {
            wsFabric[headerCell].s = {
              fill: { fgColor: { rgb: "475569" } }, // Slate-600
              font: { bold: true, color: { rgb: "FFFFFF" }, name: "Calibri", sz: 11 },
              alignment: { horizontal: "center", vertical: "center" }
            };
          }
        }
        wsFabric['!cols'] = [{ wch: 6 }, { wch: 30 }, { wch: 25 }, { wch: 18 }, { wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 15 }];
        XLSX.utils.book_append_sheet(wb, wsFabric, "Fabric-wise Summary");

        XLSX.writeFile(wb, `Daily_Fabric_Issue_Summary_${startDate || 'all'}_to_${endDate || 'all'}.xlsx`);
        setToastMessage({ type: 'success', text: '✅ Excel report downloaded successfully!' });
        setTimeout(() => setToastMessage(null), 3500);
      } catch (err) {
        console.error('Excel generation failed:', err);
        setToastMessage({ type: 'error', text: '❌ Failed to export Excel: ' + err.message });
        setTimeout(() => setToastMessage(null), 4000);
      } finally {
        setExcelLoading(false);
      }
    }, 20);
  };

  const getTodayAttendanceText = async () => {
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
      const attRes = await store.getAttendance(todayStr);
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
      console.warn("Notice: Today attendance for PDF unavailable:", e.message);
    }

    const uniqueAbsentees = [...new Set(absentees)];

    return {
      summary: `HODs Present: ${hodsPresent} | Supervisors Present: ${supervisorsPresent} | Helpers Present: ${helpersPresent}`,
      absenteesText: uniqueAbsentees.length > 0 ? `Absentees: ${uniqueAbsentees.join(', ')}` : "Absentees: None"
    };
  };

  // High-Speed PDF exporter (Vector Graphics / Clean Minimalist Design)
  const exportToPdf = async () => {
    if (filteredData.length === 0 || pdfLoading) {
      if (filteredData.length === 0) alert("No data available to export.");
      return;
    }

    setPdfLoading(true);
    setToastMessage({ type: 'info', text: '📄 Generating Daily Fabric Issue PDF Report...' });

    // Yield control to event loop so browser repaints the button spinner and toast immediately
    await new Promise(resolve => setTimeout(resolve, 30));

    try {
      // Use pre-fetched attendance instantly (0ms network delay), or fallback to quick call
      const attData = cachedAttendance || await getTodayAttendanceText();

      const doc = new jsPDF({
        orientation: "portrait",
        unit: "pt",
        format: "a4",
        compress: true
      });

      const PAGE_W = doc.internal.pageSize.getWidth();
      const PAGE_H = doc.internal.pageSize.getHeight();
      const M = 40; // Margin
      let y = 35;

      const setFont = (style, size) => {
        doc.setFont("helvetica", style);
        doc.setFontSize(size);
      };

      // Left Side - Blank Circle with Number inside (Non-colorful Black & White)
      const circleR = 12;
      const circleX = M + circleR;
      const circleY = y + 17;

      // Draw Blank Circle with solid black stroke
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(1.4);
      doc.circle(circleX, circleY, circleR, "FD");

      // Round number written inside the circle
      doc.setTextColor(0, 0, 0);
      setFont("bold", 12);
      doc.text("1", circleX, circleY + 4, { align: "center" });

      // Numbering Label & Title
      setFont("bold", 8);
      doc.setTextColor(0, 0, 0);
      doc.text("1ST REPORT", M + 30, y + 11);

      setFont("bold", 13);
      doc.setTextColor(0, 0, 0);
      doc.text("DAILY FABRIC ISSUANCE ANALYSIS", M + 30, y + 25);

      setFont("normal", 8);
      doc.setTextColor(80, 80, 80);
      doc.text(`Period: ${startDate || 'All Time'} to ${endDate || 'All Time'}  |  Generated: ${new Date().toLocaleDateString()}`, M + 30, y + 36);

      // Right Side - Today's Attendance Block
      doc.setTextColor(0, 0, 0);
      setFont("bold", 8);
      doc.text("TODAY'S ATTENDANCE SUMMARY", PAGE_W - M - 230, y + 10);
      setFont("normal", 7.5);
      doc.setTextColor(60, 60, 60);
      doc.text(attData.summary, PAGE_W - M - 230, y + 21);
      doc.text(attData.absenteesText, PAGE_W - M - 230, y + 31);

      // Divider Line
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(1);
      doc.line(M, y + 44, PAGE_W - M, y + 44);

      y += 58;

      // Grayscale Summary Box
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.setLineWidth(0.5);
      doc.rect(M, y, PAGE_W - 2 * M, 45);

      setFont("bold", 8.5);
      doc.setTextColor(71, 85, 105); // slate-600
      doc.text("TOTAL ROLLS ISSUED", M + 20, y + 18);
      doc.text("TOTAL WEIGHT ISSUED", M + 150, y + 18);
      doc.text("ENGAGED TABLES", M + 280, y + 18);
      doc.text("UNIQUE FABRIC TYPES", M + 400, y + 18);

      setFont("bold", 12);
      doc.setTextColor(15, 23, 42);
      doc.text(`${stats.totalRolls}`, M + 20, y + 34);
      doc.text(`${stats.totalWeight.toFixed(1)} kg`, M + 150, y + 34);
      doc.text(`${stats.activeTables.size}`, M + 280, y + 34);
      doc.text(`${stats.uniqueFabrics.size}`, M + 400, y + 34);
      y += 70;

      // ── SECTION 1: CUTTING TABLE SUMMARY ──────────────────────────────────
      setFont("bold", 11);
      doc.setTextColor(30, 41, 59); // slate-800
      doc.text("1. Cutting Table Summary", M, y);
      y += 12;

      const tHeaders = ["Table", "Lot Numbers", "Rolls", "Weight (KG)", "Share (%)"];
      const tColWidths = [100, 180, 60, 100, 75];
      let tTotalW = tColWidths.reduce((a, b) => a + b, 0);

      // Thick border above table header
      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(1.5);
      doc.line(M, y, M + tTotalW, y);

      setFont("bold", 9);
      doc.setTextColor(15, 23, 42);
      let tx = M;
      tHeaders.forEach((h, idx) => {
        const align = (idx === 2 || idx === 3 || idx === 4) ? "right" : "left";
        const offset = align === "right" ? tColWidths[idx] - 10 : 10;
        doc.text(h, tx + offset, y + 14, { align });
        tx += tColWidths[idx];
      });

      // Divider line underneath headers
      doc.setLineWidth(0.75);
      doc.line(M, y + 20, M + tTotalW, y + 20);
      y += 20;

      setFont("normal", 8.5);
      doc.setTextColor(51, 65, 85);
      
      tableSummary.forEach((item) => {
        const lotsStr = Array.from(item.lots).sort().join(', ');
        const truncatedLots = lotsStr.length > 38 ? lotsStr.slice(0, 35) + '...' : lotsStr;

        let rx = M;
        doc.text(item.name, rx + 10, y + 11); rx += tColWidths[0];
        doc.text(truncatedLots, rx + 10, y + 11); rx += tColWidths[1];
        doc.text(String(item.rolls), rx + tColWidths[2] - 10, y + 11, { align: "right" }); rx += tColWidths[2];
        doc.text(item.weight.toFixed(1), rx + tColWidths[3] - 10, y + 11, { align: "right" }); rx += tColWidths[3];
        doc.text(`${item.percentage}%`, rx + tColWidths[4] - 10, y + 11, { align: "right" });

        y += 16;
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.5);
        doc.line(M, y, M + tTotalW, y);
      });

      // Total Row Table 1
      const tTotalRolls = tableSummary.reduce((sum, item) => sum + item.rolls, 0);
      const tTotalWeight = tableSummary.reduce((sum, item) => sum + item.weight, 0);

      setFont("bold", 8.5);
      doc.setTextColor(15, 23, 42);
      let rx = M;
      doc.text("Total", rx + 10, y + 11); rx += tColWidths[0];
      doc.text("", rx + 10, y + 11); rx += tColWidths[1];
      doc.text(String(tTotalRolls), rx + tColWidths[2] - 10, y + 11, { align: "right" }); rx += tColWidths[2];
      doc.text(tTotalWeight.toFixed(1), rx + tColWidths[3] - 10, y + 11, { align: "right" }); rx += tColWidths[3];
      doc.text("100%", rx + tColWidths[4] - 10, y + 11, { align: "right" });

      y += 16;
      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(1);
      doc.line(M, y, M + tTotalW, y);
      y += 35;

      // ── SECTION 2: FABRIC TYPE SUMMARY ────────────────────────────────────
      if (y + 160 > PAGE_H) {
        doc.addPage();
        y = 50;
      }

      setFont("bold", 11);
      doc.setTextColor(30, 41, 59);
      doc.text("2. Fabric Description Summary", M, y);
      y += 12;

      const fHeaders = ["Fabric Description", "Lot Numbers", "Rolls", "Weight (KG)", "Share (%)"];
      const fColWidths = [120, 150, 60, 100, 75];
      let fTotalW = fColWidths.reduce((a, b) => a + b, 0);

      // Thick border above table header
      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(1.5);
      doc.line(M, y, M + fTotalW, y);

      setFont("bold", 9);
      doc.setTextColor(15, 23, 42);
      tx = M;
      fHeaders.forEach((h, idx) => {
        const align = (idx === 2 || idx === 3 || idx === 4) ? "right" : "left";
        const offset = align === "right" ? fColWidths[idx] - 10 : 10;
        doc.text(h, tx + offset, y + 14, { align });
        tx += fColWidths[idx];
      });

      // Divider line underneath headers
      doc.setLineWidth(0.75);
      doc.line(M, y + 20, M + fTotalW, y + 20);
      y += 20;

      setFont("normal", 8.5);
      doc.setTextColor(51, 65, 85);
      fabricSummary.forEach((item) => {
        if (y + 20 > PAGE_H - 40) {
          doc.addPage();
          y = 50;
          doc.setDrawColor(15, 23, 42);
          doc.setLineWidth(1.5);
          doc.line(M, y, M + fTotalW, y);

          setFont("bold", 9);
          doc.setTextColor(15, 23, 42);
          let tfx = M;
          fHeaders.forEach((h, fIdx) => {
            const align = (fIdx === 2 || fIdx === 3 || fIdx === 4) ? "right" : "left";
            const offset = align === "right" ? fColWidths[fIdx] - 10 : 10;
            doc.text(h, tfx + offset, y + 14, { align });
            tfx += fColWidths[fIdx];
          });
          y += 20;
          setFont("normal", 8.5);
          doc.setTextColor(51, 65, 85);
        }

        const lotsStr = Array.from(item.lots).sort().join(', ');
        const truncatedLots = lotsStr.length > 32 ? lotsStr.slice(0, 29) + '...' : lotsStr;

        let rx = M;
        doc.text(item.name.length > 25 ? item.name.slice(0, 22) + '...' : item.name, rx + 10, y + 11); rx += fColWidths[0];
        doc.text(truncatedLots, rx + 10, y + 11); rx += fColWidths[1];
        doc.text(String(item.rolls), rx + fColWidths[2] - 10, y + 11, { align: "right" }); rx += fColWidths[2];
        doc.text(item.weight.toFixed(1), rx + fColWidths[3] - 10, y + 11, { align: "right" }); rx += fColWidths[3];
        doc.text(`${item.percentage}%`, rx + fColWidths[4] - 10, y + 11, { align: "right" });

        y += 16;
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.5);
        doc.line(M, y, M + fTotalW, y);
      });

      // Total Row Table 2
      const fTotalRolls = fabricSummary.reduce((sum, item) => sum + item.rolls, 0);
      const fTotalWeight = fabricSummary.reduce((sum, item) => sum + item.weight, 0);

      setFont("bold", 8.5);
      doc.setTextColor(15, 23, 42);
      let frx = M;
      doc.text("Total", frx + 10, y + 11); frx += fColWidths[0];
      doc.text("", frx + 10, y + 11); frx += fColWidths[1];
      doc.text(String(fTotalRolls), frx + fColWidths[2] - 10, y + 11, { align: "right" }); frx += fColWidths[2];
      doc.text(fTotalWeight.toFixed(1), frx + fColWidths[3] - 10, y + 11, { align: "right" }); frx += fColWidths[3];
      doc.text("100%", frx + fColWidths[4] - 10, y + 11, { align: "right" });

      y += 16;
      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(1);
      doc.line(M, y, M + fTotalW, y);

      const pages = doc.internal.getNumberOfPages();
      for (let p = 1; p <= pages; p++) {
        doc.setPage(p);
        setFont("italic", 8);
        doc.setTextColor(148, 163, 184);
        doc.text(`Daily Fabric Issuance Analysis  |  Page ${p} of ${pages}`, M, PAGE_H - 20);
      }

      doc.save(`Daily_Fabric_Issue_Summary_${startDate || 'all'}_to_${endDate || 'all'}.pdf`);
      setToastMessage({ type: 'success', text: '✅ PDF downloaded successfully!' });
      setTimeout(() => setToastMessage(null), 3500);
    } catch (err) {
      console.error('PDF export failed:', err);
      setToastMessage({ type: 'error', text: '❌ Failed to generate PDF: ' + err.message });
      setTimeout(() => setToastMessage(null), 4000);
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="daily-fabric-issue-app" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 30 }}>
      {/* Styles Injection for clean White & Royal Blue theme with Full Dark Mode Support */}
      <style>{`
        .daily-fabric-issue-app {
          font-family: 'Plus Jakarta Sans', sans-serif;
          color: var(--text-primary, #0F172A);
        }

        .gradient-title {
          background: linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          font-weight: 900;
          letter-spacing: -0.8px;
        }
        .dark .gradient-title {
          background: linear-gradient(135deg, #60a5fa 0%, #93c5fd 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        
        .premium-card {
          background: var(--surface, #ffffff) !important;
          border: 1px solid var(--border, rgba(37, 99, 235, 0.12)) !important;
          box-shadow: 0 4px 16px -2px rgba(0, 0, 0, 0.04) !important;
          border-radius: 10px !important;
          transition: all 0.25s ease;
        }
        .dark .premium-card {
          background: #1E293B !important;
          border-color: #334155 !important;
          box-shadow: 0 4px 16px -2px rgba(0, 0, 0, 0.2) !important;
        }

        .card-header-styled {
          padding: 12px 18px !important;
          border-bottom: 1.5px solid var(--border, #E2E8F0) !important;
          background: var(--bg, #F8FAFC) !important;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .dark .card-header-styled {
          background: #0F172A !important;
          border-color: #334155 !important;
        }

        .header-title-text {
          font-size: 12.5px;
          font-weight: 850;
          color: var(--text-primary, #0F172A);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .dark .header-title-text {
          color: #F8FAFC !important;
        }

        .kpi-card-glow {
          position: relative;
          overflow: hidden;
        }

        .kpi-card-glow::before {
          content: '';
          position: absolute;
          top: 0; left: 0; width: 4px; height: 100%;
        }
        
        .kpi-purple::before { background: #2563eb; }
        .kpi-emerald::before { background: #10b981; }
        .kpi-amber::before { background: #f59e0b; }
        .kpi-sky::before { background: #60a5fa; }

        .kpi-label-text {
          font-size: 10px;
          color: #64748B;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.6px;
        }
        .dark .kpi-label-text { color: #94A3B8 !important; }

        .kpi-value-text {
          font-size: 24px;
          font-weight: 900;
          color: #0F172A;
          margin-top: 2px;
          letter-spacing: -0.5px;
        }
        .dark .kpi-value-text { color: #F8FAFC !important; }

        .glow-icon-box {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: rgba(37, 99, 235, 0.08);
          color: #2563eb;
        }
        .dark .glow-icon-box {
          background: rgba(59, 130, 246, 0.15) !important;
          color: #60A5FA !important;
        }

        .custom-gradient-progress {
          background: linear-gradient(90deg, #2563eb 0%, #60a5fa 100%) !important;
        }

        .lot-pill {
          font-size: 9.5px;
          padding: 2px 7px;
          border-radius: 5px;
          font-weight: 750;
          letter-spacing: 0.2px;
          background: #DBEAFE;
          color: #1E40AF;
          border: 1px solid #93C5FD;
        }
        .dark .lot-pill {
          background: #1E3A8A !important;
          color: #BFDBFE !important;
          border-color: #3B82F6 !important;
        }

        /* High Visibility Solid Borders for Tables */
        .custom-table-bordered {
          border-collapse: collapse !important;
          width: 100% !important;
          border: 1px solid #CBD5E1 !important;
        }
        .dark .custom-table-bordered {
          border-color: #334155 !important;
        }

        .custom-table-bordered th {
          background: #F1F5F9 !important;
          color: #1E293B !important;
          font-weight: 850 !important;
          border: 1px solid #CBD5E1 !important;
          padding: 8px 12px !important;
          font-size: 11px !important;
          text-transform: uppercase;
        }
        .dark .custom-table-bordered th {
          background: #0F172A !important;
          color: #F8FAFC !important;
          border-color: #334155 !important;
        }

        .custom-table-bordered td {
          color: #1E293B !important;
          font-weight: 600 !important;
          border: 1px solid #E2E8F0 !important;
          padding: 8px 12px !important;
          background: #FFFFFF !important;
          font-size: 11.5px !important;
        }
        .dark .custom-table-bordered td {
          color: #F8FAFC !important;
          border-color: #334155 !important;
          background: #1E293B !important;
        }

        .custom-table-bordered tr:nth-child(even) td {
          background: #F8FAFC !important;
        }
        .dark .custom-table-bordered tr:nth-child(even) td {
          background: #0F172A !important;
        }

        .custom-table-bordered tr:hover td {
          background: rgba(37, 99, 235, 0.06) !important;
        }
        .dark .custom-table-bordered tr:hover td {
          background: rgba(59, 130, 246, 0.15) !important;
        }

        .modern-select-input {
          border-radius: 6px !important;
          border: 1.5px solid var(--border, #CBD5E1) !important;
          background: var(--surface, #FFFFFF) !important;
          color: var(--text-primary, #0F172A) !important;
          font-weight: 600 !important;
          padding: 6px 10px !important;
          font-size: 12px !important;
          outline: none;
        }
        .dark .modern-select-input {
          background: #0F172A !important;
          border-color: #334155 !important;
          color: #F8FAFC !important;
        }
        .modern-select-input:focus {
          border-color: #2563EB !important;
        }

        .filter-label-text {
          font-size: 10.5px;
          font-weight: 800;
          color: #475569;
          text-transform: uppercase;
          letter-spacing: 0.6px;
        }
        .dark .filter-label-text {
          color: #94A3B8 !important;
        }

        .btn-preset-filter {
          height: 32px;
          padding: 0 10px;
          border-radius: 6px;
          font-size: 11.5px;
          font-weight: 700;
          cursor: pointer;
          border: 1px solid #CBD5E1;
          background: #F1F5F9;
          color: #334155;
          transition: all 0.2s;
        }
        .btn-preset-filter:hover { background: #E2E8F0; }
        .btn-preset-filter.active-preset {
          background: #2563EB !important;
          color: #FFFFFF !important;
          border-color: #1D4ED8 !important;
        }
        .dark .btn-preset-filter {
          background: #334155;
          border-color: #475569;
          color: #E2E8F0;
        }
        .dark .btn-preset-filter:hover { background: #475569; }

        .report-loader-bar {
          position: relative;
          width: 100%;
          height: 3px;
          background: rgba(37, 99, 235, 0.12);
          overflow: hidden;
          border-radius: 2px;
        }
        .report-loader-bar::after {
          content: '';
          position: absolute;
          top: 0; left: 0; width: 45%; height: 100%;
          background: linear-gradient(90deg, transparent, #2563eb, #60a5fa, transparent);
          animation: shimmerProgress 1.1s infinite ease-in-out;
        }
        @keyframes shimmerProgress {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }

        .skeleton-bar {
          background: linear-gradient(90deg, #e2e8f0 25%, #f8fafc 50%, #e2e8f0 75%);
          background-size: 200% 100%;
          animation: pulseSkeleton 1.3s infinite ease-in-out;
          border-radius: 6px;
        }
        .dark .skeleton-bar {
          background: linear-gradient(90deg, #1e293b 25%, #334155 50%, #1e293b 75%);
        }
        @keyframes pulseSkeleton {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 0.95; }
        }

        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      {/* Top Global Progress Loading Bar */}
      {(loading || pdfLoading || excelLoading) && (
        <div className="report-loader-bar" style={{ marginBottom: -10 }} />
      )}

      {/* Header Panel with MD Daily Report Number Badge */}
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="page-title-block">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '3px 12px 3px 4px',
              borderRadius: '20px',
              border: '1.5px solid #0F172A',
              background: '#FFFFFF',
              color: '#0F172A'
            }}>
              <span style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                border: '1.5px solid #0F172A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: '12px',
                color: '#0F172A'
              }}>
                1
              </span>
              <span style={{ fontWeight: 800, fontSize: '11px', letterSpacing: '0.6px', textTransform: 'uppercase' }}>
                1st Report
              </span>
            </div>
            <div className="breadcrumb" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>
              <span>Home</span><span>/</span><span>Reports</span><span>/</span><span style={{ color: '#0F172A', fontWeight: 800 }}>1st Report</span>
            </div>
          </div>
          <h1 style={{ fontSize: '24px', marginTop: '2px', color: '#0F172A', fontWeight: 900, letterSpacing: '-0.5px' }}>
            Daily Fabric Issue Analytics (1st Report)
          </h1>
          <p className="page-sub" style={{ fontSize: '12.5px', marginTop: '2px', color: '#64748B' }}>
            Table-wise fabric rolls, meterage and weight issuance log.
          </p>
        </div>
        <div className="page-actions" style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={exportToExcel}
            disabled={loading || excelLoading || filteredData.length === 0}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              height: 34,
              borderRadius: 8,
              fontWeight: 750,
              cursor: excelLoading ? 'wait' : 'pointer'
            }}
          >
            {excelLoading ? (
              <>
                <RefreshCw size={13} className="spin-animation" />
                <span>Exporting...</span>
              </>
            ) : (
              <>
                <Download size={13} />
                <span>Export Excel</span>
              </>
            )}
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={exportToPdf}
            disabled={loading || pdfLoading || filteredData.length === 0}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              height: 34,
              borderRadius: 8,
              fontWeight: 750,
              cursor: pdfLoading ? 'wait' : 'pointer',
              background: pdfLoading ? '#1e40af' : undefined
            }}
          >
            {pdfLoading ? (
              <>
                <RefreshCw size={13} className="spin-animation" />
                <span>Generating PDF...</span>
              </>
            ) : (
              <>
                <FileText size={13} />
                <span>Export PDF</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Filter Card */}
      <div className="card premium-card">
        <div className="card-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', padding: '12px 16px' }}>

          {/* Start Date */}
          <div style={{ flex: '1 1 180px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="filter-label-text">Start Date</label>
            <div style={{ position: 'relative' }}>
              <input
                type="date"
                className="input modern-select-input"
                style={{ width: '100%', paddingLeft: 30 }}
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
              <Calendar size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#2563eb' }} />
            </div>
          </div>

          {/* End Date */}
          <div style={{ flex: '1 1 180px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="filter-label-text">End Date</label>
            <div style={{ position: 'relative' }}>
              <input
                type="date"
                className="input modern-select-input"
                style={{ width: '100%', paddingLeft: 30 }}
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
              />
              <Calendar size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#2563eb' }} />
            </div>
          </div>

          {/* Text Search */}
          <div style={{ flex: '2 1 240px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="filter-label-text">Search Filter</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="input modern-select-input"
                placeholder="Search by lot, shade, fabric name..."
                style={{ width: '100%', paddingLeft: 30 }}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
            </div>
          </div>

          {/* Refresh & Quick Presets */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`btn-preset-filter ${startDate === new Date().toISOString().slice(0, 10) && endDate === new Date().toISOString().slice(0, 10) ? 'active-preset' : ''}`}
              onClick={() => setDatePreset('today')}
            >
              ⚡ Today
            </button>
            <button
              type="button"
              className="btn-preset-filter"
              onClick={() => setDatePreset('7days')}
            >
              7 Days
            </button>
            <button
              type="button"
              className="btn-preset-filter"
              onClick={() => setDatePreset('30days')}
            >
              30 Days
            </button>
            <button
              type="button"
              className={`btn-preset-filter ${!startDate && !endDate ? 'active-preset' : ''}`}
              onClick={() => setDatePreset('all')}
            >
              ♾️ All Time
            </button>
            <button className="btn btn-primary" onClick={fetchReport} disabled={loading} style={{ height: 32, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 6, borderRadius: 6, fontWeight: 700, fontSize: 11.5 }}>
              <RefreshCw size={12} className={loading ? 'spin-animation' : ''} />
              {loading ? "Syncing..." : "Refresh"}
            </button>
          </div>

        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-4" style={{ gap: 12 }}>
        {/* KPI 1 */}
        <div className="card premium-card kpi-card-glow kpi-purple">
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
            <div className="glow-icon-box">
              <Scissors size={18} />
            </div>
            <div>
              <div className="kpi-label-text">Issued Rolls</div>
              {loading ? (
                <div className="skeleton-bar" style={{ width: 65, height: 26, margin: '4px 0' }} />
              ) : (
                <div className="kpi-value-text">{stats.totalRolls}</div>
              )}
            </div>
          </div>
        </div>

        {/* KPI 2 */}
        <div className="card premium-card kpi-card-glow kpi-emerald">
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
            <div className="glow-icon-box">
              <Scale size={18} />
            </div>
            <div>
              <div className="kpi-label-text">Total Weight</div>
              {loading ? (
                <div className="skeleton-bar" style={{ width: 95, height: 26, margin: '4px 0' }} />
              ) : (
                <div className="kpi-value-text">
                  {stats.totalWeight.toFixed(1)} <span style={{ fontSize: 12, fontWeight: 650 }}>KG</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* KPI 3 */}
        <div className="card premium-card kpi-card-glow kpi-amber">
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
            <div className="glow-icon-box">
              <Layers size={18} />
            </div>
            <div>
              <div className="kpi-label-text">Unique Lots</div>
              {loading ? (
                <div className="skeleton-bar" style={{ width: 50, height: 26, margin: '4px 0' }} />
              ) : (
                <div className="kpi-value-text">{stats.uniqueLots.size}</div>
              )}
            </div>
          </div>
        </div>

        {/* KPI 4 */}
        <div className="card premium-card kpi-card-glow kpi-sky">
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
            <div className="glow-icon-box">
              <Tag size={18} />
            </div>
            <div>
              <div className="kpi-label-text">Cutting Tables</div>
              {loading ? (
                <div className="skeleton-bar" style={{ width: 50, height: 26, margin: '4px 0' }} />
              ) : (
                <div className="kpi-value-text">{stats.activeTables.size}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Issuance Volume & Weight Trend Chart */}
      <div className="card premium-card" style={{ overflow: 'hidden' }}>
        <div className="card-header card-header-styled">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 3, height: 12, background: '#2563eb', borderRadius: 2 }} />
            <div className="header-title-text">Issuance Volume & Weight Trend</div>
          </div>
          <span style={{ fontSize: '11px', color: '#2563eb', fontWeight: 800 }}>Daily Performance Curve</span>
        </div>
        <div className="card-body" style={{ padding: '16px 14px 6px 6px' }}>
          {loading ? (
            <div style={{ height: 240, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <RefreshCw size={26} className="spin-animation" style={{ color: '#2563eb' }} />
              <span style={{ fontSize: 13, fontWeight: 750, color: 'var(--text-primary)' }}>Loading issuance volume & weight analytics...</span>
            </div>
          ) : filteredData.length === 0 ? (
            <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 13, fontWeight: 600 }}>
              No trend data available for selected filter period.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={trendChartData}>
                <defs>
                  <linearGradient id="weightTrendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.24} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="rollsTrendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.08} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" vertical={false} />
                <XAxis
                  dataKey="formattedDate"
                  tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                  label={{ value: 'Rolls', angle: -90, position: 'insideLeft', offset: 0, fill: '#2563eb', fontSize: 10, fontWeight: 700 }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                  label={{ value: 'KG', angle: 90, position: 'insideRight', offset: 0, fill: '#10b981', fontSize: 10, fontWeight: 700 }}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(37, 99, 235, 0.1)', strokeWidth: 1.5 }} />
                <Legend
                  verticalAlign="top"
                  height={32}
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: '11px', fontWeight: 700, paddingBottom: '6px' }}
                />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="weight"
                  name="Weight (KG)"
                  fill="url(#weightTrendGrad)"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 2.5, fill: '#10b981', strokeWidth: 0 }}
                  activeDot={{ r: 4, stroke: '#10b981', strokeWidth: 1.5, fill: '#ffffff' }}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="rolls"
                  name="Rolls Issued"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  dot={{ r: 3, stroke: '#2563eb', strokeWidth: 1.5, fill: '#ffffff' }}
                  activeDot={{ r: 5, stroke: '#2563eb', strokeWidth: 2, fill: '#ffffff' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Main Aggregated Summaries (Dual Cards side-by-side with proper borders) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 14 }}>

        {/* Table-wise Summary Card */}
        <div className="card premium-card" style={{ overflow: 'hidden', padding: 0 }}>
          <div className="card-header card-header-styled">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 3, height: 12, background: '#2563eb', borderRadius: 2 }} />
              <div className="header-title-text">Table-wise Summary</div>
            </div>
          </div>
          <div className="card-body" style={{ padding: 10 }}>
            {loading ? (
              <div className="table-wrap" style={{ border: 'none' }}>
                <table className="custom-table-bordered">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Table</th>
                      <th style={{ textAlign: 'left' }}>Lot Numbers</th>
                      <th style={{ textAlign: 'right' }}>Rolls</th>
                      <th style={{ textAlign: 'right' }}>Weight (KG)</th>
                      <th style={{ textAlign: 'center' }}>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3, 4, 5].map((idx) => (
                      <tr key={idx}>
                        <td><div className="skeleton-bar" style={{ width: '60px', height: '14px', borderRadius: 4 }} /></td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <div className="skeleton-bar" style={{ width: '38px', height: '14px', borderRadius: 4 }} />
                            <div className="skeleton-bar" style={{ width: '38px', height: '14px', borderRadius: 4 }} />
                            <div className="skeleton-bar" style={{ width: '38px', height: '14px', borderRadius: 4 }} />
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}><div className="skeleton-bar" style={{ width: '35px', height: '14px', marginLeft: 'auto', borderRadius: 4 }} /></td>
                        <td style={{ textAlign: 'right' }}><div className="skeleton-bar" style={{ width: '55px', height: '14px', marginLeft: 'auto', borderRadius: 4 }} /></td>
                        <td><div className="skeleton-bar" style={{ width: '65px', height: '10px', margin: '0 auto', borderRadius: 4 }} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : tableSummary.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>No records found.</div>
            ) : (
              <div className="table-wrap" style={{ border: 'none' }}>
                <table className="custom-table-bordered">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Table</th>
                      <th style={{ textAlign: 'left' }}>Lot Numbers</th>
                      <th style={{ textAlign: 'right' }}>Rolls</th>
                      <th style={{ textAlign: 'right' }}>Weight (KG)</th>
                      <th style={{ textAlign: 'center' }}>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableSummary.map(item => (
                      <tr key={item.name}>
                        <td style={{ fontWeight: 800 }}>
                          <span style={{ fontSize: '11.5px', color: '#2563eb' }}>
                            {item.name}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, maxWidth: '170px' }}>
                            {Array.from(item.lots).sort().map(lot => (
                              <span key={lot} className="lot-pill">
                                {lot}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td style={{ fontWeight: 800, textAlign: 'right', fontSize: '12px' }}>{item.rolls}</td>
                        <td style={{ fontWeight: 800, textAlign: 'right', fontSize: '12px', color: '#10b981' }}>{item.weight.toFixed(1)}</td>
                        <td style={{ width: '80px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                            <div style={{ flex: 1, height: 5, background: 'rgba(148, 163, 184, 0.2)', borderRadius: 3, overflow: 'hidden' }}>
                              <div className="custom-gradient-progress" style={{ width: `${item.percentage}%`, height: '100%', borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: '10px', fontWeight: 800, color: '#2563eb' }}>{item.percentage}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Fabric-wise Summary Card */}
        <div className="card premium-card" style={{ overflow: 'hidden', padding: 0 }}>
          <div className="card-header card-header-styled">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 3, height: 12, background: '#2563eb', borderRadius: 2 }} />
              <div className="header-title-text">Fabric-wise Summary</div>
            </div>
          </div>
          <div className="card-body" style={{ padding: 10 }}>
            {loading ? (
              <div className="table-wrap" style={{ border: 'none' }}>
                <table className="custom-table-bordered">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Fabric Description</th>
                      <th style={{ textAlign: 'left' }}>Lot Numbers</th>
                      <th style={{ textAlign: 'right' }}>Rolls</th>
                      <th style={{ textAlign: 'right' }}>Weight (KG)</th>
                      <th style={{ textAlign: 'center' }}>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3, 4, 5].map((idx) => (
                      <tr key={idx}>
                        <td><div className="skeleton-bar" style={{ width: '120px', height: '14px', borderRadius: 4 }} /></td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <div className="skeleton-bar" style={{ width: '38px', height: '14px', borderRadius: 4 }} />
                            <div className="skeleton-bar" style={{ width: '38px', height: '14px', borderRadius: 4 }} />
                            <div className="skeleton-bar" style={{ width: '38px', height: '14px', borderRadius: 4 }} />
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}><div className="skeleton-bar" style={{ width: '35px', height: '14px', marginLeft: 'auto', borderRadius: 4 }} /></td>
                        <td style={{ textAlign: 'right' }}><div className="skeleton-bar" style={{ width: '55px', height: '14px', marginLeft: 'auto', borderRadius: 4 }} /></td>
                        <td><div className="skeleton-bar" style={{ width: '65px', height: '10px', margin: '0 auto', borderRadius: 4 }} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : fabricSummary.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>No fabric records found.</div>
            ) : (
              <div className="table-wrap" style={{ border: 'none' }}>
                <table className="custom-table-bordered">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Fabric Description</th>
                      <th style={{ textAlign: 'left' }}>Lot Numbers</th>
                      <th style={{ textAlign: 'right' }}>Rolls</th>
                      <th style={{ textAlign: 'right' }}>Weight (KG)</th>
                      <th style={{ textAlign: 'center' }}>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fabricSummary.map(item => (
                      <tr key={item.name}>
                        <td style={{ fontWeight: 800, maxWidth: '140px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.name}>
                          {item.name}
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, maxWidth: '170px' }}>
                            {Array.from(item.lots).sort().map(lot => (
                              <span key={lot} className="lot-pill">
                                {lot}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td style={{ fontWeight: 800, textAlign: 'right', fontSize: '12px' }}>{item.rolls}</td>
                        <td style={{ fontWeight: 800, textAlign: 'right', fontSize: '12px', color: '#10b981' }}>{item.weight.toFixed(1)}</td>
                        <td style={{ width: '80px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                            <div style={{ flex: 1, height: 5, background: 'rgba(148, 163, 184, 0.2)', borderRadius: 3, overflow: 'hidden' }}>
                              <div className="custom-gradient-progress" style={{ width: `${item.percentage}%`, height: '100%', borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: '10px', fontWeight: 800, color: '#2563eb' }}>{item.percentage}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Sub-Charts Section: Table ComposedChart + Fabric Doughnut Chart */}
      {filteredData.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 14 }}>

          {/* Chart 2: Table-wise Composed Chart */}
          <div className="card premium-card" style={{ overflow: 'hidden' }}>
            <div className="card-header card-header-styled">
              <div className="header-title-text">Table Performance (Rolls & Weights)</div>
            </div>
            <div className="card-body" style={{ padding: '14px 8px 6px 6px' }}>
              <ResponsiveContainer width="100%" height={210}>
                <ComposedChart data={tableChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(37, 99, 235, 0.04)' }} />
                  <Legend
                    verticalAlign="top"
                    height={30}
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: '10.5px', fontWeight: 700 }}
                  />
                  <Bar yAxisId="left" dataKey="rolls" name="Rolls Issued" radius={[4, 4, 0, 0]} maxBarSize={24}>
                    {tableChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="weight"
                    name="Weight (KG)"
                    stroke="#e11d48"
                    strokeWidth={2.5}
                    dot={{ r: 3, stroke: '#e11d48', strokeWidth: 1.5, fill: '#ffffff' }}
                    activeDot={{ r: 5, stroke: '#e11d48', strokeWidth: 2, fill: '#ffffff' }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 3: Fabric-wise Doughnut (Pie) Chart */}
          <div className="card premium-card" style={{ overflow: 'hidden' }}>
            <div className="card-header card-header-styled">
              <div className="header-title-text">Fabric Share Ratio</div>
            </div>
            <div className="card-body" style={{ padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ flex: 1.2, height: 210 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={fabricChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={4}
                      dataKey="value"
                      nameKey="name"
                    >
                      {fabricChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Custom aligned side legend */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 8 }}>
                {fabricChartData.map((entry, idx) => (
                  <div key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '10.5px', fontWeight: 700 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: CHART_COLORS[idx % CHART_COLORS.length], flexShrink: 0 }} />
                    <span style={{ color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '110px' }} title={entry.name}>
                      {entry.name}
                    </span>
                    <span style={{ color: 'var(--text-secondary)', marginLeft: 'auto' }}>({entry.value})</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* Floating Status Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 99999,
            background: toastMessage.type === 'error' ? '#EF4444' : '#0F172A',
            color: '#FFFFFF',
            padding: '12px 20px',
            borderRadius: 10,
            boxShadow: '0 12px 36px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: '13px',
            fontWeight: 700,
            transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            pointerEvents: 'none'
          }}
        >
          {(pdfLoading || excelLoading) && (
            <RefreshCw size={15} className="spin-animation" style={{ color: '#60a5fa' }} />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

    </div>
  );
}
