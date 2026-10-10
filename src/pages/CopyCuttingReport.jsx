import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Scissors, Cpu, UploadCloud } from 'lucide-react';

const CopyCuttingReport = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Your Google Sheets configuration
  const API_KEY = 'AIzaSyAomDFBkOySlIxKWSKGHe6ATv9gvaBr7uk';
  const SPREADSHEET_ID = '1n_hG3rOH3G0O2ijYAv-pxj_keDxkLZAef2SV0Nw7TPk';
  const RANGE = 'StickerPrints!A:N';

  // Your exact headers from Google Sheet
  const SHEET_HEADERS = [
    'Timestamp',
    'Bill Number',
    'Sticker Printed',
    'Date',
    'User',
    'Categories Printed',
    'Total Stickers',
    'Entry Type',
    'Party Name',
    'Image URL/Path',
    'Notes',
    'Location',
    'Received By',
    'Authorized By'
  ];

  useEffect(() => {
    fetchGoogleSheetData();
  }, []);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterType]);

  const handleViewImage = (driveUrl) => {
    if (!driveUrl) {
      alert('No image URL available');
      return;
    }
    
    window.open(driveUrl, '_blank');
  };

  const fetchGoogleSheetData = async () => {
    try {
      setLoading(true);
      
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${RANGE}?key=${API_KEY}&majorDimension=ROWS`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.values && result.values.length > 0) {
        const rows = result.values.slice(1);
        
        const formattedData = rows.map(row => {
          const obj = {};
          SHEET_HEADERS.forEach((header, index) => {
            obj[header] = row[index] || '';
          });
          return obj;
        });
        
        const combinedData = combineDataByBillNumber(formattedData);
        setData(combinedData);
      } else {
        setData([]);
      }
      
      setError(null);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to fetch data from Google Sheets. Please check your API key and spreadsheet ID.');
    } finally {
      setLoading(false);
    }
  };

  const combineDataByBillNumber = (rawData) => {
    const billMap = new Map();

    rawData.forEach(record => {
      const billNumber = record['Bill Number'];
      
      if (!billNumber || billNumber.trim() === '') return;
      
      if (!billMap.has(billNumber)) {
        billMap.set(billNumber, {
          'Bill Number': billNumber,
          'Timestamp': '',
          'Date': '',
          'User': '',
          'Sticker Printed': '',
          'Categories Printed': '',
          'Total Stickers': '',
          'Entry Type': 'COMBINED',
          'Party Name': '',
          'Image URL/Path': '',
          'Notes': '',
          'Location': '',
          'Received By': '',
          'Authorized By': '',
          'HasPrint': false,
          'HasUpload': false,
          'DriveFileUrl': ''
        });
      }

      const combined = billMap.get(billNumber);
      
      if (record['Sticker Printed'] && record['Sticker Printed'].trim() !== '') {
        combined['Sticker Printed'] = record['Sticker Printed'];
        combined['HasPrint'] = true;
      }
      
      if (record['Categories Printed'] && record['Categories Printed'].trim() !== '') {
        combined['Categories Printed'] = record['Categories Printed'];
      }
      
      if (record['Total Stickers'] && record['Total Stickers'].trim() !== '') {
        combined['Total Stickers'] = record['Total Stickers'];
      }
      
      if (record['Location'] && record['Location'].trim() !== '') {
        combined['Location'] = record['Location'];
      }
      
      if (record['Received By'] && record['Received By'].trim() !== '') {
        combined['Received By'] = record['Received By'];
      }
      
      if (record['Authorized By'] && record['Authorized By'].trim() !== '') {
        combined['Authorized By'] = record['Authorized By'];
      }
      
      if (record['Date'] && record['Date'].trim() !== '') {
        combined['Date'] = record['Date'];
      }
      
      if (record['User'] && record['User'].trim() !== '') {
        combined['User'] = record['User'];
      }
      
      if (record['Timestamp'] && record['Timestamp'].trim() !== '') {
        combined['Timestamp'] = record['Timestamp'];
      }
      
      if (record['Party Name'] && record['Party Name'].trim() !== '') {
        combined['Party Name'] = record['Party Name'];
      }
      
      if (record['Image URL/Path'] && record['Image URL/Path'].trim() !== '') {
        combined['Image URL/Path'] = record['Image URL/Path'];
        combined['DriveFileUrl'] = record['Image URL/Path'];
        combined['HasUpload'] = true;
      }
      
      if (record['Notes'] && record['Notes'].trim() !== '') {
        combined['Notes'] = record['Notes'];
        if (record['Notes'].includes('drive.google.com')) {
          combined['DriveFileUrl'] = record['Notes'];
          combined['HasUpload'] = true;
        }
      }
      
      if (record['Entry Type'] === 'UPLOAD') {
        combined['HasUpload'] = true;
      }
    });

    return Array.from(billMap.values())
      .sort((a, b) => {
        const numA = parseInt(a['Bill Number']) || 0;
        const numB = parseInt(b['Bill Number']) || 0;
        return numB - numA;
      });
  };

  const getFilteredData = () => {
    let filtered = [...data];
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(item => 
        item['Bill Number'].toLowerCase().includes(term) ||
        item['Party Name'].toLowerCase().includes(term) ||
        (item['Sticker Printed'] && item['Sticker Printed'].toLowerCase().includes(term)) ||
        (item['User'] && item['User'].toLowerCase().includes(term))
      );
    }
    
    if (filterType === 'withUpload') {
      filtered = filtered.filter(item => item['HasUpload'] === true);
    } else if (filterType === 'withoutUpload') {
      filtered = filtered.filter(item => item['HasUpload'] === false);
    } else if (filterType === 'withPrint') {
      filtered = filtered.filter(item => item['HasPrint'] === true);
    } else if (filterType === 'printOnly') {
      filtered = filtered.filter(item => item['HasPrint'] === true && item['HasUpload'] === false);
    } else if (filterType === 'uploadOnly') {
      filtered = filtered.filter(item => item['HasUpload'] === true && item['HasPrint'] === false);
    }
    
    return filtered;
  };

  const filteredData = getFilteredData();
  const totalPages = Math.ceil(filteredData.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const paginatedData = filteredData.slice(startIndex, startIndex + rowsPerPage);

  const handlePageChange = (page) => {
    setCurrentPage(page);
    setSelectedRows(new Set());
    setSelectAll(false);
  };

  const handleSelectRow = (billNumber) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(billNumber)) {
      newSelected.delete(billNumber);
    } else {
      newSelected.add(billNumber);
    }
    setSelectedRows(newSelected);
    setSelectAll(newSelected.size === paginatedData.length);
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedRows(new Set());
    } else {
      const allBillNumbers = paginatedData.map(item => item['Bill Number']);
      setSelectedRows(new Set(allBillNumbers));
    }
    setSelectAll(!selectAll);
  };

  const refreshData = () => {
    fetchGoogleSheetData();
    setSelectedRows(new Set());
    setSelectAll(false);
  };

  const goBack = () => {
    window.history.back();
  };

  const generatePDF = () => {
    try {
      setIsGeneratingPDF(true);
      
      // Get data to export
      const dataToExport = selectedRows.size > 0 
        ? filteredData.filter(item => selectedRows.has(item['Bill Number']))
        : filteredData;
      
      if (dataToExport.length === 0) {
        alert('No data to export! Please select at least one row or ensure data is available.');
        setIsGeneratingPDF(false);
        return;
      }
      
      // Create PDF in landscape orientation
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });
      
      // Get page dimensions for full width usage
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 10; // Reduced margin for full width (10mm on each side)
      const contentWidth = pageWidth - (margin * 2);
      
      // Add Header (Black and White)
      doc.setFontSize(18);
      doc.setTextColor(0, 0, 0); // Black text
      doc.text('Copy Cutting Report', margin, 20);
      
      doc.setFontSize(10);
      const dateStr = new Date().toLocaleString();
      doc.text(`Generated on: ${dateStr}`, margin, 30);
      
      // Add Summary Stats (Black and White)
      const exportStats = {
        totalBills: dataToExport.length,
        totalStickers: dataToExport.reduce((sum, item) => {
          const stickers = parseInt(item['Total Stickers']);
          return sum + (isNaN(stickers) ? 0 : stickers);
        }, 0),
        billsWithPrint: dataToExport.filter(item => item['HasPrint']).length,
        billsWithUpload: dataToExport.filter(item => item['HasUpload']).length,
        bothPresent: dataToExport.filter(item => item['HasPrint'] && item['HasUpload']).length
      };
      
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0); // Black text
      let yPos = 42;
      doc.text(`Total Bills: ${exportStats.totalBills} | Total Stickers: ${exportStats.totalStickers}`, margin, yPos);
      doc.text(`Printed: ${exportStats.billsWithPrint} | Uploaded: ${exportStats.billsWithUpload} | Complete: ${exportStats.bothPresent}`, margin, yPos + 5);
      
      // Draw a black line separator
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.5);
      doc.line(margin, yPos + 10, pageWidth - margin, yPos + 10);
      
      // Prepare table data
      const tableData = dataToExport.map(item => [
        item['Bill Number'],
        item['Date'] || '-',
        item['User'] || '-',
        item['Sticker Printed'] || '-',
        item['Categories Printed'] || '-',
        item['Total Stickers'] || '-',
        item['Party Name'] || '-',
        item['HasPrint'] && item['HasUpload'] ? 'Complete' : (item['HasPrint'] ? 'Print Only' : 'Upload Only'),
        item['Location'] || '-',
        item['Received By'] || '-',
        item['Authorized By'] || '-'
      ]);
      
      // Calculate column widths based on content width
      const columnWidths = {
        0: contentWidth * 0.06,  // Bill No.
        1: contentWidth * 0.08,  // Date
        2: contentWidth * 0.08,  // User
        3: contentWidth * 0.10,  // Sticker Printed
        4: contentWidth * 0.10,  // Categories
        5: contentWidth * 0.05,  // Total
        6: contentWidth * 0.12,  // Party Name
        7: contentWidth * 0.08,  // Status
        8: contentWidth * 0.09,  // Location
        9: contentWidth * 0.08,  // Received By
        10: contentWidth * 0.08   // Authorized By
      };
      
      // Generate table using autoTable - Black and White theme with full width
      autoTable(doc, {
        startY: yPos + 18,
        head: [[
          'Bill No.', 'Date', 'User', 'Sticker Printed', 'Categories', 
          'Total', 'Party Name', 'Status', 'Location', 'Received By', 'Authorized By'
        ]],
        body: tableData,
        theme: 'plain', // Plain theme for black and white
        styles: {
          fontSize: 8,
          cellPadding: 3,
          lineColor: [0, 0, 0], // Black borders
          lineWidth: 0.1,
          textColor: [0, 0, 0] // Black text
        },
        headStyles: {
          fillColor: [240, 240, 240], // Light gray background for header
          textColor: [0, 0, 0], // Black text
          fontSize: 8,
          fontStyle: 'bold',
          halign: 'center',
          valign: 'middle',
          lineColor: [0, 0, 0],
          lineWidth: 0.2
        },
        bodyStyles: {
          textColor: [0, 0, 0], // Black text
          fillColor: [255, 255, 255], // White background
          lineColor: [0, 0, 0], // Black borders
          lineWidth: 0.1
        },
        alternateRowStyles: {
          fillColor: [250, 250, 250] // Very light gray for alternate rows
        },
        columnStyles: {
          0: { cellWidth: columnWidths[0], halign: 'center' },
          1: { cellWidth: columnWidths[1], halign: 'center' },
          2: { cellWidth: columnWidths[2], halign: 'center' },
          3: { cellWidth: columnWidths[3] },
          4: { cellWidth: columnWidths[4] },
          5: { cellWidth: columnWidths[5], halign: 'center' },
          6: { cellWidth: columnWidths[6] },
          7: { cellWidth: columnWidths[7], halign: 'center' },
          8: { cellWidth: columnWidths[8] },
          9: { cellWidth: columnWidths[9], halign: 'center' },
          10: { cellWidth: columnWidths[10], halign: 'center' }
        },
        margin: { left: margin, right: margin },
        tableWidth: contentWidth,
        pageBreak: 'auto',
        rowPageBreak: 'avoid',
        showHead: 'everyPage'
      });
      
      // Add footer with page numbers (Black and White)
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        
        // Add a black line at the bottom of each page
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.3);
        doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
        
        // Add page number
        doc.setFontSize(8);
        doc.setTextColor(0, 0, 0);
        doc.text(
          `Page ${i} of ${pageCount}`,
          pageWidth / 2,
          pageHeight - 6,
          { align: 'center' }
        );
        
        // Add report title on left side of footer
        doc.setFontSize(7);
        doc.text(
          'Copy Cutting Report',
          margin,
          pageHeight - 6,
          { align: 'left' }
        );
        
        // Add generation date on right side of footer
        doc.text(
          dateStr,
          pageWidth - margin,
          pageHeight - 6,
          { align: 'right' }
        );
      }
      
      // Save PDF
      doc.save(`copy-cutting-report-${new Date().toISOString().split('T')[0]}.pdf`);
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Error: ' + error.message);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const getSummaryStats = () => {
    const totalBills = data.length;
    const billsWithUpload = data.filter(item => item['HasUpload']).length;
    const billsWithPrint = data.filter(item => item['HasPrint']).length;
    const bothPresent = data.filter(item => item['HasPrint'] && item['HasUpload']).length;
    const totalStickers = data.reduce((sum, item) => {
      const stickers = parseInt(item['Total Stickers']);
      return sum + (isNaN(stickers) ? 0 : stickers);
    }, 0);
    
    return { totalBills, billsWithUpload, billsWithPrint, bothPresent, totalStickers };
  };

  const stats = getSummaryStats();

  if (loading) {
    return (
      <div className="copy-cutting-report">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading report data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="copy-cutting-report">
        <div className="error-container">
          <div className="error-icon">⚠️</div>
          <div className="error-message">{error}</div>
          <button onClick={refreshData} className="retry-button">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="copy-cutting-report">
      <div className="animated-bg"></div>
      
      <div className="report-container">
        {/* Navigation Tabs Bar for Fabric Copy suite */}
        <div className="fabric-copy-nav-tabs">
          <button
            className={`fc-nav-tab active`}
            onClick={() => navigate('/fabric-copy/cutting-copy')}
          >
            <Scissors size={16} />
            <span>Cutting Copy</span>
            <span className="fc-tab-badge">{stats.totalBills}</span>
          </button>
          <button
            className={`fc-nav-tab`}
            onClick={() => navigate('/fabric-copy/digitalize-gatta')}
          >
            <Cpu size={16} />
            <span>Digitalize Gatta</span>
          </button>
          <button
            className={`fc-nav-tab`}
            onClick={() => navigate('/fabric-copy/upload-copy')}
          >
            <UploadCloud size={16} />
            <span>Upload Copy</span>
          </button>
        </div>

        <div className="header-section">
          <div className="header-left">
            <button onClick={goBack} className="back-button">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Back
            </button>
            <div className="header-title">
              <h1>📋 Copy Cutting Report</h1>
              <p>Complete tracking of sticker prints and uploaded copies</p>
            </div>
          </div>
          <div className="header-right">
            <button onClick={refreshData} className="refresh-button" title="Refresh Data">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 12C1 12 4 4 12 4C20 4 23 12 23 12M23 12C23 12 20 20 12 20C4 20 1 12 1 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M17 12H23V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Refresh
            </button>
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">📄</div>
            <div className="stat-content">
              <h3>{stats.totalBills}</h3>
              <p>Total Bills</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">🖨️</div>
            <div className="stat-content">
              <h3>{stats.billsWithPrint}</h3>
              <p>Printed Stickers</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">📸</div>
            <div className="stat-content">
              <h3>{stats.billsWithUpload}</h3>
              <p>Uploaded Copies</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">✅</div>
            <div className="stat-content">
              <h3>{stats.bothPresent}</h3>
              <p>Complete Records</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">🏷️</div>
            <div className="stat-content">
              <h3>{stats.totalStickers}</h3>
              <p>Total Stickers</p>
            </div>
          </div>
        </div>

        <div className="actions-section">
          <div className="filters-section">
            <div className="search-wrapper">
              <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 21L16.65 16.65M19 11C19 15.4183 15.4183 19 11 19C6.58172 19 3 15.4183 3 11C3 6.58172 6.58172 3 11 3C15.4183 3 19 6.58172 19 11Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <input
                type="text"
                placeholder="Search by bill number, party name, or user..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>
            <div className="filter-chips">
              <button className={`filter-chip ${filterType === 'all' ? 'active' : ''}`} onClick={() => setFilterType('all')}>
                All Bills
              </button>
              <button className={`filter-chip ${filterType === 'withPrint' ? 'active' : ''}`} onClick={() => setFilterType('withPrint')}>
                🖨️ Printed
              </button>
              <button className={`filter-chip ${filterType === 'withUpload' ? 'active' : ''}`} onClick={() => setFilterType('withUpload')}>
                📸 With Uploads
              </button>
              <button className={`filter-chip ${filterType === 'withoutUpload' ? 'active' : ''}`} onClick={() => setFilterType('withoutUpload')}>
                ⚠️ Missing Uploads
              </button>
            </div>
          </div>
          <div className="export-section">
            <button onClick={generatePDF} className="export-button" disabled={isGeneratingPDF}>
              {isGeneratingPDF ? (
                <>
                  <div className="spinner-small"></div>
                  Generating PDF...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2V16M12 16L8 12M12 16L16 12M5 20H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Download PDF
                </>
              )}
            </button>
          </div>
        </div>

        <div className="table-section">
          {filteredData.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <h3>No Data Found</h3>
              <p>No records match your search criteria.</p>
            </div>
          ) : (
            <>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="checkbox-col">
                        <input type="checkbox" checked={selectAll} onChange={handleSelectAll} className="checkbox" />
                      </th>
                      <th>Bill No.</th>
                      <th>Date</th>
                      <th>User</th>
                      <th>Sticker Printed</th>
                      <th>Categories</th>
                      <th>Total</th>
                      <th>Party Name</th>
                      <th>Status</th>
                      <th>Uploaded Copy</th>
                      <th>Location</th>
                      <th>Received By</th>
                      <th>Authorized By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedData.map((row) => (
                      <tr key={row['Bill Number']} className={
                        row['HasPrint'] && row['HasUpload'] ? 'row-complete' :
                        row['HasPrint'] ? 'row-print' : 'row-upload'
                      }>
                        <td className="checkbox-col">
                          <input type="checkbox" checked={selectedRows.has(row['Bill Number'])} onChange={() => handleSelectRow(row['Bill Number'])} className="checkbox" />
                        </td>
                        <td className="bill-number">{row['Bill Number']}</td>
                        <td>{row['Date'] || '-'}</td>
                        <td>{row['User'] || '-'}</td>
                        <td className="sticker-cell">{row['Sticker Printed'] || '-'}</td>
                        <td className="categories-cell">{row['Categories Printed'] || '-'}</td>
                        <td className="total-cell">{row['Total Stickers'] || '-'}</td>
                        <td className="party-cell">{row['Party Name'] || '-'}</td>
                        <td>
                          {row['HasPrint'] && row['HasUpload'] && (
                            <span className="badge badge-complete">Complete</span>
                          )}
                          {row['HasPrint'] && !row['HasUpload'] && (
                            <span className="badge badge-print">Print Only</span>
                          )}
                          {!row['HasPrint'] && row['HasUpload'] && (
                            <span className="badge badge-upload">Upload Only</span>
                          )}
                        </td>
                        <td>
                          {row['DriveFileUrl'] ? (
                            <button onClick={() => handleViewImage(row['DriveFileUrl'])} className="view-image-btn">
                              📷 View Image
                            </button>
                          ) : '-'}
                        </td>
                        <td>{row['Location'] || '-'}</td>
                        <td>{row['Received By'] || '-'}</td>
                        <td>{row['Authorized By'] || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="pagination">
                  <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} className="page-btn">
                    Previous
                  </button>
                  <div className="page-numbers">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                      <button key={page} onClick={() => handlePageChange(page)} className={`page-number ${currentPage === page ? 'active' : ''}`}>
                        {page}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages} className="page-btn">
                    Next
                  </button>
                </div>
              )}

              <div className="table-footer">
                <div className="rows-info">
                  Showing {startIndex + 1} to {Math.min(startIndex + rowsPerPage, filteredData.length)} of {filteredData.length} entries
                </div>
                <div className="rows-per-page">
                  <label>Rows per page:</label>
                  <select value={rowsPerPage} onChange={(e) => setRowsPerPage(Number(e.target.value))}>
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
                {selectedRows.size > 0 && (
                  <div className="selection-info">
                    {selectedRows.size} row(s) selected for export
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        .copy-cutting-report {
          min-height: 100vh;
          background: linear-gradient(135deg, #ffffff 0%, #ffffff 100%);
          padding: 20px;
          position: relative;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }

        .dark .copy-cutting-report {
          background: #0f172a;
          color: #f1f5f9;
        }

        .fabric-copy-nav-tabs {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #f1f5f9;
          padding: 6px;
          border-radius: 14px;
          margin-bottom: 20px;
          border: 1px solid #e2e8f0;
          overflow-x: auto;
        }

        .dark .fabric-copy-nav-tabs {
          background: #1e293b;
          border-color: #334155;
        }

        .fc-nav-tab {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 9px 18px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 700;
          color: #64748b;
          background: transparent;
          border: none;
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
        }

        .fc-nav-tab:hover {
          color: #1e293b;
          background: rgba(255, 255, 255, 0.6);
        }

        .fc-nav-tab.active {
          background: white;
          color: #2563eb;
          box-shadow: 0 4px 12px rgba(0,0,0,0.06);
        }

        .dark .fc-nav-tab.active {
          background: #0f172a;
          color: #60a5fa;
        }

        .fc-tab-badge {
          font-size: 11px;
          padding: 2px 7px;
          border-radius: 12px;
          background: #dbeafe;
          color: #1d4ed8;
          font-weight: 700;
        }

        .animated-bg {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: radial-gradient(circle at 20% 50%, rgba(0,0,0,0.03) 0%, transparent 50%);
          pointer-events: none;
          animation: pulse 10s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.05); }
        }

        .report-container {
          max-width: 2200px;
          margin: 0 auto;
          position: relative;
          z-index: 1;
        }

        .header-section {
          background: white;
          border-radius: 20px;
          padding: 24px 32px;
          margin-bottom: 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: 0 20px 40px rgba(0,0,0,0.1);
        }

        .dark .header-section {
          background: #1e293b;
          box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .back-button {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          background: #f0f0f0;
          border: none;
          border-radius: 12px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          color: #333;
          transition: all 0.3s;
        }

        .dark .back-button {
          background: #334155;
          color: #f1f5f9;
        }

        .back-button:hover {
          background: #e0e0e0;
          transform: translateX(-2px);
        }

        .dark .back-button:hover {
          background: #475569;
        }

        .header-title h1 {
          margin: 0;
          font-size: 28px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .header-title p {
          margin: 5px 0 0;
          color: #666;
          font-size: 14px;
        }

        .dark .header-title p {
          color: #94a3b8;
        }

        .refresh-button {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 24px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 12px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.3s;
        }

        .refresh-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 20px rgba(102,126,234,0.3);
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 20px;
          margin-bottom: 24px;
        }

        .stat-card {
          background: white;
          border-radius: 16px;
          padding: 20px;
          display: flex;
          align-items: center;
          gap: 15px;
          transition: all 0.3s;
          cursor: pointer;
          box-shadow: 0 10px 20px rgba(0,0,0,0.05);
        }

        .dark .stat-card {
          background: #1e293b;
        }

        .stat-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 15px 30px rgba(0,0,0,0.15);
        }

        .stat-icon {
          font-size: 40px;
        }

        .stat-content h3 {
          margin: 0;
          font-size: 28px;
          font-weight: 700;
          color: #d40000;
        }

        .stat-content p {
          margin: 5px 0 0;
          color: #000ba7;
          font-size: 13px;
          font-weight: 500;
        }

        .dark .stat-content p {
          color: #60a5fa;
        }

        .actions-section {
          background: white;
          border-radius: 16px;
          padding: 20px;
          margin-bottom: 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
          flex-wrap: wrap;
          box-shadow: 0 10px 20px rgba(0,0,0,0.05);
        }

        .dark .actions-section {
          background: #1e293b;
        }

        .filters-section {
          flex: 1;
          display: flex;
          gap: 20px;
          align-items: center;
          flex-wrap: wrap;
        }

        .search-wrapper {
          position: relative;
          flex: 1;
          min-width: 250px;
        }

        .search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #999;
        }

        .search-input {
          width: 100%;
          padding: 12px 12px 12px 40px;
          border: 2px solid #e0e0e0;
          border-radius: 12px;
          font-size: 14px;
          transition: all 0.3s;
          background: inherit;
          color: inherit;
        }

        .dark .search-input {
          border-color: #334155;
        }

        .search-input:focus {
          outline: none;
          border-color: #667eea;
        }

        .filter-chips {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .filter-chip {
          padding: 8px 16px;
          background: white;
          border: 2px solid #e0e0e0;
          border-radius: 12px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          transition: all 0.3s;
        }

        .dark .filter-chip {
          background: #0f172a;
          border-color: #334155;
          color: #e2e8f0;
        }

        .filter-chip:hover {
          border-color: #667eea;
          transform: translateY(-1px);
        }

        .filter-chip.active {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border-color: transparent;
        }

        .export-button {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 24px;
          background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
          color: white;
          border: none;
          border-radius: 12px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.3s;
        }

        .export-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 20px rgba(40,167,69,0.3);
        }

        .export-button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .table-section {
          background: white;
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 20px 40px rgba(0,0,0,0.1);
        }

        .dark .table-section {
          background: #1e293b;
        }

        .table-wrapper {
          overflow-x: auto;
        }

        .data-table {
          width: 100%;
          border-collapse: collapse;
        }

        .data-table thead {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .data-table th {
          padding: 16px 12px;
          text-align: center;
          font-size: 13px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .data-table td {
          padding: 14px 12px;
          border: 1px solid #f0f0f0;
          font-size: 13px;
          text-align: center;
        }

        .dark .data-table td {
          border-color: #334155;
        }

        .data-table tbody tr:hover {
          background: rgba(102,126,234,0.05);
        }

        .row-complete {
          background: rgba(40,167,69,0.05);
        }

        .row-print {
          background: rgba(0,123,255,0.05);
        }

        .row-upload {
          background: rgba(255,193,7,0.05);
        }

        .checkbox-col {
          width: 40px;
          text-align: center;
        }

        .checkbox {
          width: 18px;
          height: 18px;
          cursor: pointer;
        }

        .bill-number {
          font-weight: 700;
          color: #667eea;
        }

        .sticker-cell, .categories-cell {
          max-width: 150px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .total-cell {
          font-weight: 600;
        }

        .party-cell {
          font-weight: 500;
        }

        .badge {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 600;
        }

        .badge-complete {
          background: #d4edda;
          color: #155724;
        }

        .badge-print {
          background: #cfe2ff;
          color: #084298;
        }

        .badge-upload {
          background: #fff3cd;
          color: #856404;
        }

        .view-image-btn {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
          transition: all 0.3s;
          white-space: nowrap;
        }

        .view-image-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 5px 10px rgba(102,126,234,0.3);
        }

        .pagination {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 15px;
          padding: 20px;
          border-top: 1px solid #e0e0e0;
        }

        .dark .pagination {
          border-color: #334155;
        }

        .page-btn {
          padding: 8px 16px;
          background: white;
          border: 2px solid #e0e0e0;
          border-radius: 10px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          transition: all 0.3s;
        }

        .dark .page-btn {
          background: #0f172a;
          border-color: #334155;
          color: #f1f5f9;
        }

        .page-btn:hover:not(:disabled) {
          border-color: #667eea;
          transform: translateY(-1px);
        }

        .page-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .page-numbers {
          display: flex;
          gap: 8px;
        }

        .page-number {
          width: 35px;
          height: 35px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: white;
          border: 2px solid #e0e0e0;
          border-radius: 8px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          transition: all 0.3s;
        }

        .dark .page-number {
          background: #0f172a;
          border-color: #334155;
          color: #f1f5f9;
        }

        .page-number:hover {
          border-color: #667eea;
          transform: translateY(-1px);
        }

        .page-number.active {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border-color: transparent;
        }

        .table-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          background: #f8f9fa;
          border-top: 1px solid #e0e0e0;
          font-size: 13px;
          color: #666;
        }

        .dark .table-footer {
          background: #0f172a;
          border-color: #334155;
          color: #94a3b8;
        }

        .rows-per-page {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .rows-per-page select {
          padding: 6px 10px;
          border: 2px solid #e0e0e0;
          border-radius: 8px;
          cursor: pointer;
        }

        .dark .rows-per-page select {
          background: #1e293b;
          border-color: #334155;
          color: #f1f5f9;
        }

        .selection-info {
          color: #667eea;
          font-weight: 600;
        }

        .empty-state {
          text-align: center;
          padding: 80px 20px;
        }

        .empty-icon {
          font-size: 64px;
          margin-bottom: 20px;
        }

        .empty-state h3 {
          margin: 0 0 10px;
          color: #333;
        }

        .empty-state p {
          color: #666;
        }

        .loading-container {
          text-align: center;
          padding: 80px;
          background: white;
          border-radius: 20px;
        }

        .dark .loading-container {
          background: #1e293b;
        }

        .loading-spinner {
          width: 50px;
          height: 50px;
          border: 4px solid #f0f0f0;
          border-top: 4px solid #667eea;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 20px;
        }

        .spinner-small {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top: 2px solid white;
          border-radius: 50%;
          animation: spin 0.5s linear infinite;
          display: inline-block;
          margin-right: 8px;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .error-container {
          text-align: center;
          padding: 80px;
          background: white;
          border-radius: 20px;
        }

        .dark .error-container {
          background: #1e293b;
        }

        .error-icon {
          font-size: 48px;
          margin-bottom: 20px;
        }

        .error-message {
          color: #d32f2f;
          margin-bottom: 20px;
        }

        .retry-button {
          padding: 10px 24px;
          background: #d32f2f;
          color: white;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          font-size: 14px;
        }

        @media (max-width: 768px) {
          .copy-cutting-report {
            padding: 12px;
          }

          .header-section {
            flex-direction: column;
            align-items: flex-start;
            gap: 15px;
            padding: 20px;
          }

          .header-left {
            flex-direction: column;
            align-items: flex-start;
            width: 100%;
          }

          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
          }

          .stat-card {
            padding: 15px;
          }

          .stat-icon {
            font-size: 30px;
          }

          .stat-content h3 {
            font-size: 22px;
          }

          .actions-section {
            flex-direction: column;
          }

          .filters-section {
            width: 100%;
            flex-direction: column;
          }

          .search-wrapper {
            width: 100%;
          }

          .filter-chips {
            width: 100%;
            justify-content: center;
          }

          .export-button {
            width: 100%;
            justify-content: center;
          }

          .pagination {
            flex-direction: column;
          }

          .table-footer {
            flex-direction: column;
            gap: 10px;
            text-align: center;
          }

          .view-image-btn {
            padding: 6px 12px;
            font-size: 11px;
          }
        }
      `}</style>
    </div>
  );
};

export default CopyCuttingReport;
