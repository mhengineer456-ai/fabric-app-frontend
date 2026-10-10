import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Scissors, Cpu, UploadCloud } from 'lucide-react';

// Google Apps Script URL - Deployed web app URL
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxsLXVcD6MXK_AV5hqbmHtnJ3rf0nDj-RMfxR2sSW1TzZRWAsmOuchpHLsvpLHOhhb_KQ/exec';

// Spreadsheet configuration
const SPREADSHEET_ID = '1n_hG3rOH3G0O2ijYAv-pxj_keDxkLZAef2SV0Nw7TPk';
const STICKER_PRINTS_SHEET_NAME = 'StickerPrints';
const STICKER_PRINTS_RANGE = `${STICKER_PRINTS_SHEET_NAME}!A:O`;
const PARTY_CODES_API_KEY = 'AIzaSyAomDFBkOySlIxKWSKGHe6ATv9gvaBr7uk';

function UploadCopy() {
  const navigate = useNavigate();
  const [uploadedImage, setUploadedImage] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [billNumber, setBillNumber] = useState('');
  const [partyName, setPartyName] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [userName, setUserName] = useState('');
  const [driveFileUrl, setDriveFileUrl] = useState('');
  
  // State for checking bill print status
  const [billPrintStatus, setBillPrintStatus] = useState(null); // 'printed', 'pending', 'checking', 'not-found', 'uploaded'
  const [isCheckingBill, setIsCheckingBill] = useState(false);
  const [existingUploads, setExistingUploads] = useState([]);

  useEffect(() => {
    const savedUser = localStorage.getItem('userName');
    if (savedUser) {
      setUserName(savedUser);
    } else {
      const name = prompt('Please enter your name:', 'Store Keeper');
      if (name) {
        setUserName(name);
        localStorage.setItem('userName', name);
      }
    }
  }, []);

  // Function to check if bill has sticker prints
  const checkBillPrintStatus = useCallback(async (billNum) => {
    if (!billNum || billNum.trim() === '') {
      setBillPrintStatus(null);
      return;
    }

    setIsCheckingBill(true);
    setBillPrintStatus('checking');

    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${STICKER_PRINTS_RANGE}?key=${PARTY_CODES_API_KEY}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        console.warn(`Failed to fetch sticker prints: ${response.status}`);
        setBillPrintStatus('not-found');
        return;
      }
      
      const result = await response.json();
      
      if (result.values && result.values.length > 0) {
        const headers = result.values[0];
        const billNumberIndex = headers.findIndex(header => 
          header && header.toLowerCase().includes('bill') && header.toLowerCase().includes('number')
        );
        const stickerPrintedIndex = headers.findIndex(header => 
          header && header.toLowerCase().includes('sticker printed')
        );
        const entryTypeIndex = headers.findIndex(header => 
          header && header.toLowerCase().includes('entry type')
        );
        
        let hasStickerPrint = false;
        let existingUploadEntries = [];
        
        for (let i = 1; i < result.values.length; i++) {
          const row = result.values[i];
          const rowBillNumber = row[billNumberIndex]?.trim();
          
          if (rowBillNumber === billNum) {
            // Check if this is a sticker print entry
            const stickerPrinted = stickerPrintedIndex !== -1 ? row[stickerPrintedIndex]?.trim() : '';
            const entryType = entryTypeIndex !== -1 ? row[entryTypeIndex]?.trim() : '';
            
            if (stickerPrinted && stickerPrinted.includes('Printed')) {
              hasStickerPrint = true;
            }
            
            // Track existing upload entries
            if (entryType === 'UPLOAD' || (stickerPrinted && stickerPrinted.includes('UPLOAD'))) {
              existingUploadEntries.push({
                rowIndex: i,
                timestamp: row[0],
                imageUrl: row[9] || row[10] || 'No image URL',
                notes: row[11]
              });
            }
          }
        }
        
        setExistingUploads(existingUploadEntries);
        
        if (hasStickerPrint) {
          setBillPrintStatus('printed');
        } else if (existingUploadEntries.length > 0) {
          setBillPrintStatus('uploaded');
        } else {
          setBillPrintStatus('pending');
        }
      } else {
        setBillPrintStatus('pending');
      }
    } catch (err) {
      console.error('Error checking bill status:', err);
      setBillPrintStatus('not-found');
    } finally {
      setIsCheckingBill(false);
    }
  }, [PARTY_CODES_API_KEY]);

  // Debounced bill number check
  useEffect(() => {
    const timer = setTimeout(() => {
      if (billNumber && billNumber.trim() !== '') {
        checkBillPrintStatus(billNumber);
      } else {
        setBillPrintStatus(null);
        setExistingUploads([]);
      }
    }, 500);
    
    return () => clearTimeout(timer);
  }, [billNumber, checkBillPrintStatus]);

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file && (file.type === 'image/jpeg' || file.type === 'image/jpg' || file.type === 'image/png')) {
      if (file.size > 10 * 1024 * 1024) {
        alert('File size should be less than 10MB');
        return;
      }
      
      setUploadProgress(0);
      const reader = new FileReader();
      reader.onloadstart = () => setUploadProgress(30);
      reader.onprogress = (e) => {
        if (e.lengthComputable) {
          const progress = (e.loaded / e.total) * 100;
          setUploadProgress(Math.min(progress, 90));
        }
      };
      reader.onload = (e) => {
        setUploadProgress(100);
        setUploadedImage(e.target.result);
        setTimeout(() => setUploadProgress(0), 500);
      };
      reader.onerror = () => {
        setUploadProgress(0);
        alert('Error uploading image. Please try again.');
      };
      reader.readAsDataURL(file);
    } else {
      alert('Please upload a valid image file (JPEG or PNG)');
    }
  };

  const saveUploadedCopyToSheet = async () => {
    try {
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'saveUploadedCopy',
          billNumber: billNumber,
          partyName: partyName,
          notes: notes,
          imageData: uploadedImage,
          user: userName || 'Anonymous',
          timestamp: new Date().toISOString(),
          entryType: 'UPLOAD'
        })
      });
      
      console.log('Uploaded copy saved to Google Drive and Sheet');
      return true;
    } catch (error) {
      console.error('Error saving:', error);
      return false;
    }
  };

  const handleSave = async () => {
    if (!billNumber) {
      alert('Please enter a bill number');
      return;
    }
    
    if (billPrintStatus === 'printed') {
      alert(`❌ Cannot upload copy for Bill #${billNumber}\n\nThis bill already has stickers printed. Uploads are only allowed for pending bills.`);
      return;
    }
    
    if (!uploadedImage) {
      alert('Please upload an image first');
      return;
    }
    
    setIsSaving(true);
    
    try {
      const saved = await saveUploadedCopyToSheet();
      
      if (saved) {
        alert(`✅ Uploaded copy saved successfully for Bill #${billNumber}!\n📁 Image stored in Google Drive`);
        // Reset form after successful upload
        setUploadedImage(null);
        setBillNumber('');
        setPartyName('');
        setNotes('');
        setBillPrintStatus(null);
        setExistingUploads([]);
        window.history.back();
      } else {
        alert('Error saving to Google Drive. Please try again.');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('An error occurred while saving. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    if (uploadedImage || billNumber || partyName || notes) {
      if (window.confirm('Are you sure you want to go back? Unsaved changes will be lost.')) {
        window.history.back();
      }
    } else {
      window.history.back();
    }
  };

  // Get status badge styling
  const getStatusBadge = () => {
    switch (billPrintStatus) {
      case 'printed':
        return {
          text: '✓ Stickers Printed',
          className: 'status-printed',
          icon: '🖨️',
          message: 'Stickers have already been printed for this bill. Uploads are not allowed.'
        };
      case 'uploaded':
        return {
          text: '📎 Copy Already Uploaded',
          className: 'status-uploaded',
          icon: '📎',
          message: 'A copy has already been uploaded for this bill.'
        };
      case 'pending':
        return {
          text: '⏳ Pending - Ready for Upload',
          className: 'status-pending',
          icon: '⏳',
          message: 'No stickers printed yet. You can upload a copy.'
        };
      case 'checking':
        return {
          text: '🔍 Checking Bill Status...',
          className: 'status-checking',
          icon: '🔍',
          message: 'Verifying if stickers have been printed...'
        };
      default:
        return null;
    }
  };

  const statusInfo = getStatusBadge();
  const canUpload = billPrintStatus === 'pending' && uploadedImage && !isSaving;
  const isBillPrinted = billPrintStatus === 'printed';
  const hasExistingUpload = billPrintStatus === 'uploaded';

  return (
    <div className={`upload-copy-container ${isDarkMode ? 'dark' : ''}`}>
      <div className="animated-bg">
        <div className="gradient-sphere sphere-1"></div>
        <div className="gradient-sphere sphere-2"></div>
        <div className="gradient-sphere sphere-3"></div>
      </div>

      <div className="upload-copy-content">
        {/* Navigation Tabs Bar for Fabric Copy suite */}
        <div className="fabric-copy-nav-tabs">
          <button
            className={`fc-nav-tab`}
            onClick={() => navigate('/fabric-copy/cutting-copy')}
          >
            <Scissors size={16} />
            <span>Cutting Copy</span>
          </button>
          <button
            className={`fc-nav-tab`}
            onClick={() => navigate('/fabric-copy/digitalize-gatta')}
          >
            <Cpu size={16} />
            <span>Digitalize Gatta</span>
          </button>
          <button
            className={`fc-nav-tab active`}
            onClick={() => navigate('/fabric-copy/upload-copy')}
          >
            <UploadCloud size={16} />
            <span>Upload Copy</span>
          </button>
        </div>

        {/* Page Header */}
        <div className="page-header">
          <div className="header-left">
            <button onClick={handleBack} className="back-button">
              ← Back
            </button>
            <div className="breadcrumb">
              <span className="breadcrumb-item" onClick={() => navigate('/fabric-copy')}>Fabric Copy</span>
              <span className="breadcrumb-separator">/</span>
              <span className="breadcrumb-item active">Upload Copy</span>
            </div>
          </div>
          <div className="header-right">
            <button onClick={() => setIsDarkMode(!isDarkMode)} className="dark-mode-btn">
              {isDarkMode ? '☀️' : '🌙'}
            </button>
          </div>
        </div>

        {/* Page Title */}
        <div className="page-title-section">
          <h1 className="page-main-title">
            <span className="title-icon">📸</span>
            Upload Copy Image Against Bill
          </h1>
          <p className="page-subtitle">
            Upload scanned copies or photos of bills to Google Drive for digital record keeping
          </p>
        </div>

        {/* Two Column Layout - Equal Width and Height */}
        <div className="two-column-layout">
          {/* Left Column - Form */}
          <div className="form-column">
            <div className="upload-main-card equal-height-card">
              <div className="upload-form">
                <div className="form-group">
                  <label>Bill Number *</label>
                  <input
                    type="text"
                    value={billNumber}
                    onChange={(e) => setBillNumber(e.target.value.toUpperCase())}
                    placeholder="Enter bill number (e.g., 18521)"
                    className="form-input"
                    disabled={isSaving}
                  />
                  {isCheckingBill && (
                    <div className="status-message checking">
                      <span className="status-icon">🔍</span>
                      Checking bill status...
                    </div>
                  )}
                  {statusInfo && !isCheckingBill && (
                    <div className={`status-message ${statusInfo.className}`}>
                      <span className="status-icon">{statusInfo.icon}</span>
                      <span className="status-text">{statusInfo.text}</span>
                    </div>
                  )}
                  {statusInfo && statusInfo.message && (
                    <div className={`status-info ${statusInfo.className}`}>
                      ℹ️ {statusInfo.message}
                    </div>
                  )}
                </div>

                {existingUploads.length > 0 && (
                  <div className="form-group">
                    <label>Existing Uploads</label>
                    <div className="existing-uploads">
                      {existingUploads.map((upload, index) => (
                        <div key={index} className="upload-record">
                          <span className="upload-date">{new Date(upload.timestamp).toLocaleString()}</span>
                          {upload.imageUrl && upload.imageUrl !== 'No image URL' && (
                            <a href={upload.imageUrl} target="_blank" rel="noopener noreferrer" className="view-link">
                              View Existing Copy →
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label>Party Name</label>
                  <input
                    type="text"
                    value={partyName}
                    onChange={(e) => setPartyName(e.target.value)}
                    placeholder="Enter party name (optional)"
                    className="form-input"
                    disabled={isSaving}
                  />
                </div>

                <div className="form-group">
                  <label>Upload Image {!isBillPrinted && !hasExistingUpload && '*'}</label>
                  <div 
                    className={`upload-area ${(isBillPrinted || hasExistingUpload) ? 'disabled-area' : ''}`} 
                    onClick={() => !isSaving && !isBillPrinted && !hasExistingUpload && document.getElementById('fileInput').click()}
                  >
                    {uploadProgress > 0 && uploadProgress < 100 ? (
                      <div className="upload-progress">
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${uploadProgress}%` }}></div>
                        </div>
                        <p>{Math.round(uploadProgress)}% Uploading...</p>
                      </div>
                    ) : uploadedImage ? (
                      <div className="image-preview">
                        <img src={uploadedImage} alt="Preview" />
                        <div className="image-overlay">
                          <button 
                            className="change-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setUploadedImage(null);
                            }}
                            disabled={isSaving || isBillPrinted || hasExistingUpload}
                          >
                            Change Image
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="upload-placeholder">
                        <div className="upload-icon-large">
                          {(isBillPrinted || hasExistingUpload) ? '🚫' : '📷'}
                        </div>
                        <p className="upload-text">
                          {(isBillPrinted || hasExistingUpload) ? 'Upload Not Available' : 'Click to upload image'}
                        </p>
                        <p className="upload-subtext">
                          {(isBillPrinted || hasExistingUpload) 
                            ? 'This bill already has stickers printed or copy uploaded' 
                            : 'Supports JPEG, PNG (Max 10MB)'}
                        </p>
                      </div>
                    )}
                    <input
                      id="fileInput"
                      type="file"
                      accept="image/jpeg,image/jpg,image/png"
                      onChange={handleImageUpload}
                      style={{ display: 'none' }}
                      disabled={isSaving || isBillPrinted || hasExistingUpload}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Notes (Optional)</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add any additional notes..."
                    className="form-textarea"
                    rows="3"
                    disabled={isSaving || isBillPrinted}
                  />
                </div>

                <div className="form-group">
                  <label>User Name</label>
                  <input
                    type="text"
                    value={userName}
                    onChange={(e) => {
                      setUserName(e.target.value);
                      localStorage.setItem('userName', e.target.value);
                    }}
                    placeholder="Your name"
                    className="form-input"
                    disabled={isSaving}
                  />
                </div>

                <div className="form-actions">
                  <button onClick={handleBack} className="btn-secondary" disabled={isSaving}>
                    Cancel
                  </button>
                  <button 
                    onClick={handleSave} 
                    disabled={!canUpload} 
                    className="btn-primary"
                    title={!canUpload ? (isBillPrinted ? 'Stickers already printed for this bill' : 'Please enter bill number and upload image') : ''}
                  >
                    {isSaving ? '💾 Saving to Drive...' : 
                     isBillPrinted ? '🚫 Cannot Upload' :
                     hasExistingUpload ? '📎 Upload Already Exists' :
                     billPrintStatus === 'pending' && uploadedImage ? '💾 Save to Google Drive' :
                     '💾 Save to Google Drive'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Information Panel */}
          <div className="info-column">
            <div className="info-card equal-height-card">
              <div className="info-header">
                <span className="info-icon">ℹ️</span>
                <h3>Upload Guidelines</h3>
              </div>
              <div className="info-content">
                <div className="info-section">
                  <h4>📋 Bill Information</h4>
                  <ul>
                    <li>Enter the exact bill number as it appears in the system</li>
                    <li>The system will automatically check if stickers have been printed</li>
                    <li>Only bills with "Pending" status can be uploaded</li>
                  </ul>
                </div>

                <div className="info-section">
                  <h4>🖼️ Image Requirements</h4>
                  <ul>
                    <li>Supported formats: JPEG, PNG</li>
                    <li>Maximum file size: 10MB</li>
                    <li>Ensure the copy is clear and readable</li>
                    <li>Good lighting and proper orientation recommended</li>
                  </ul>
                </div>

                <div className="info-section">
                  <h4>✅ Status Meanings</h4>
                  <ul>
                    <li><span className="status-badge pending-badge">⏳ Pending</span> - Ready for upload</li>
                    <li><span className="status-badge printed-badge">🖨️ Printed</span> - Stickers already printed</li>
                    <li><span className="status-badge uploaded-badge">📎 Uploaded</span> - Copy already exists</li>
                  </ul>
                </div>

                <div className="info-section">
                  <h4>📤 After Upload</h4>
                  <ul>
                    <li>Images are stored securely in Google Drive</li>
                    <li>Each upload is linked to the bill number</li>
                    <li>You'll be redirected back after successful upload</li>
                    <li>Upload history can be viewed in the main dashboard</li>
                  </ul>
                </div>

                <div className="info-tip">
                  <span className="tip-icon">💡</span>
                  <div>
                    <strong>Pro Tip:</strong> Make sure to double-check the bill number before uploading to avoid linking to the wrong bill.
                  </div>
                </div>
              </div>
            </div>

            <div className="info-card quick-stats">
              <div className="info-header">
                <span className="info-icon">📊</span>
                <h3>Quick Stats</h3>
              </div>
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-value">{existingUploads.length}</div>
                  <div className="stat-label">Existing Uploads</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{uploadedImage ? '✓' : '—'}</div>
                  <div className="stat-label">Image Ready</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{billNumber ? '✓' : '—'}</div>
                  <div className="stat-label">Bill Number</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .upload-copy-container {
          min-height: 100vh;
          position: relative;
          overflow-x: hidden;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: #ffffff;
        }

        .upload-copy-container.dark {
          background: #0a0e27;
          color: #ffffff;
        }

        .fabric-copy-nav-tabs {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #f1f5f9;
          padding: 6px;
          border-radius: 14px;
          margin-bottom: 24px;
          border: 1px solid #e2e8f0;
          overflow-x: auto;
        }

        .upload-copy-container.dark .fabric-copy-nav-tabs {
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

        .upload-copy-container.dark .fc-nav-tab.active {
          background: #0f172a;
          color: #60a5fa;
        }

        .animated-bg {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          z-index: 0;
        }

        .gradient-sphere {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.6;
          animation: float 20s infinite ease-in-out;
        }

        .sphere-1 {
          width: 500px;
          height: 500px;
          background: radial-gradient(circle, rgba(102,126,234,0.4) 0%, rgba(118,75,162,0.2) 100%);
          top: -200px;
          right: -100px;
          animation-delay: 0s;
        }

        .sphere-2 {
          width: 400px;
          height: 400px;
          background: radial-gradient(circle, rgba(118,75,162,0.3) 0%, rgba(102,126,234,0.1) 100%);
          bottom: -150px;
          left: -100px;
          animation-delay: 5s;
        }

        .sphere-3 {
          width: 350px;
          height: 350px;
          background: radial-gradient(circle, rgba(0,201,255,0.3) 0%, rgba(146,254,157,0.1) 100%);
          bottom: 30%;
          right: 20%;
          animation-delay: 10s;
        }

        @keyframes float {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          33% { transform: translate(30px, -30px) rotate(5deg); }
          66% { transform: translate(-20px, 20px) rotate(-3deg); }
        }

        .upload-copy-content {
          position: relative;
          z-index: 1;
          max-width: 1800px;
          margin: 0 auto;
          padding: 24px 30px;
        }

        /* Page Header Styles */
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
          padding-bottom: 16px;
          border-bottom: 1px solid rgba(102,126,234,0.2);
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .back-button {
          background: rgba(102,126,234,0.1);
          border: 1px solid rgba(102,126,234,0.3);
          color: #667eea;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          padding: 8px 16px;
          border-radius: 8px;
          transition: all 0.3s;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .back-button:hover {
          background: rgba(102,126,234,0.2);
          transform: translateX(-2px);
        }

        .breadcrumb {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
        }

        .breadcrumb-item {
          color: #667eea;
          cursor: pointer;
          transition: color 0.3s;
        }

        .breadcrumb-item:hover {
          color: #764ba2;
        }

        .breadcrumb-item.active {
          color: #666;
          cursor: default;
        }

        .upload-copy-container.dark .breadcrumb-item.active {
          color: #aaa;
        }

        .breadcrumb-separator {
          color: #ccc;
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .dark-mode-btn {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          background: rgba(102,126,234,0.1);
          border: none;
          cursor: pointer;
          font-size: 20px;
          transition: all 0.3s;
        }

        .dark-mode-btn:hover {
          background: #667eea;
          color: white;
        }

        /* Page Title Section */
        .page-title-section {
          text-align: center;
          margin-bottom: 30px;
        }

        .page-main-title {
          font-size: 32px;
          font-weight: 800;
          background: linear-gradient(135deg, #667eea 0%, #0010a1 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
        }

        .title-icon {
          font-size: 36px;
          background: none;
          -webkit-text-fill-color: initial;
        }

        .page-subtitle {
          color: #666;
          font-size: 15px;
          max-width: 650px;
          margin: 0 auto;
        }

        .upload-copy-container.dark .page-subtitle {
          color: #aaa;
        }

        /* Two Column Layout */
        .two-column-layout {
          display: flex;
          gap: 24px;
          min-height: calc(100vh - 220px);
        }

        .form-column {
          flex: 1.1;
          min-width: 0;
          display: flex;
        }

        .info-column {
          flex: 0.9;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .equal-height-card {
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        .upload-main-card {
          background: rgba(255,255,255,0.95);
          backdrop-filter: blur(10px);
          border-radius: 20px;
          padding: 28px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.08);
          flex: 1;
          overflow-y: auto;
          border: 1px solid #e2e8f0;
        }

        .upload-copy-container.dark .upload-main-card {
          background: rgba(20,24,50,0.95);
          border-color: #334155;
        }

        .upload-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
          flex: 1;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .form-group label {
          font-weight: 700;
          color: #333;
          font-size: 13.5px;
        }

        .upload-copy-container.dark .form-group label {
          color: #fff;
        }

        .form-input, .form-textarea {
          padding: 11px 14px;
          border: 1px solid rgba(102,126,234,0.25);
          border-radius: 10px;
          font-size: 13.5px;
          transition: all 0.3s;
          background: white;
          color: inherit;
        }

        .upload-copy-container.dark .form-input, .upload-copy-container.dark .form-textarea {
          background: rgba(30,35,60,0.8);
          color: white;
          border-color: rgba(102,126,234,0.3);
        }

        .form-input:focus, .form-textarea:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102,126,234,0.12);
        }

        .form-input:disabled, .form-textarea:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* Status Message Styles */
        .status-message {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 13px;
          margin-top: 4px;
        }

        .status-message.checking {
          background: #e0e7ff;
          color: #4338ca;
        }

        .status-message.status-printed {
          background: #fee2e2;
          color: #991b1b;
        }

        .status-message.status-uploaded {
          background: #fef3c7;
          color: #92400e;
        }

        .status-message.status-pending {
          background: #dcfce7;
          color: #166534;
        }

        .status-info {
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 12px;
          background: #f3f4f6;
          color: #4b5563;
        }

        .status-info.status-printed {
          background: #fee2e2;
          color: #991b1b;
        }

        .status-info.status-uploaded {
          background: #fef3c7;
          color: #92400e;
        }

        .upload-copy-container.dark .status-info {
          background: rgba(30,35,60,0.8);
          color: #d1d5db;
        }

        .status-icon {
          font-size: 14px;
        }

        .status-text {
          font-weight: 600;
        }

        /* Existing Uploads */
        .existing-uploads {
          background: rgba(102,126,234,0.06);
          border-radius: 10px;
          padding: 12px;
          border: 1px dashed rgba(102,126,234,0.3);
        }

        .upload-record {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          border-bottom: 1px solid rgba(102,126,234,0.1);
        }

        .upload-record:last-child {
          border-bottom: none;
        }

        .upload-date {
          font-size: 12px;
          color: #666;
        }

        .upload-copy-container.dark .upload-date {
          color: #aaa;
        }

        .view-link {
          font-size: 12px;
          color: #667eea;
          text-decoration: none;
          font-weight: 700;
        }

        .view-link:hover {
          text-decoration: underline;
        }

        /* Upload Area */
        .upload-area {
          border: 2px dashed rgba(102,126,234,0.35);
          border-radius: 16px;
          padding: 32px 20px;
          text-align: center;
          cursor: pointer;
          transition: all 0.3s;
          background: rgba(102,126,234,0.04);
        }

        .upload-area:not(.disabled-area):hover {
          border-color: #667eea;
          background: rgba(102,126,234,0.08);
        }

        .upload-area.disabled-area {
          cursor: not-allowed;
          opacity: 0.6;
          border-color: rgba(220,38,38,0.3);
          background: rgba(220,38,38,0.05);
        }

        .upload-placeholder {
          text-align: center;
        }

        .upload-icon-large {
          font-size: 42px;
          margin-bottom: 12px;
        }

        .upload-text {
          font-size: 15px;
          font-weight: 700;
          margin-bottom: 6px;
          color: #333;
        }

        .upload-copy-container.dark .upload-text {
          color: white;
        }

        .upload-subtext {
          font-size: 12px;
          color: #666;
        }

        .upload-copy-container.dark .upload-subtext {
          color: #aaa;
        }

        .upload-progress {
          text-align: center;
        }

        .progress-bar {
          width: 100%;
          height: 8px;
          background: rgba(102,126,234,0.2);
          border-radius: 10px;
          overflow: hidden;
          margin-bottom: 12px;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #667eea, #764ba2);
          border-radius: 10px;
          transition: width 0.3s;
        }

        .image-preview {
          position: relative;
          display: inline-block;
        }

        .image-preview img {
          max-width: 100%;
          max-height: 280px;
          border-radius: 12px;
          box-shadow: 0 4px 14px rgba(0,0,0,0.1);
        }

        .image-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.65);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.3s;
        }

        .image-preview:hover .image-overlay {
          opacity: 1;
        }

        .change-btn {
          padding: 8px 16px;
          background: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 700;
          color: #667eea;
        }

        .change-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .form-actions {
          display: flex;
          gap: 14px;
          justify-content: flex-end;
          margin-top: 14px;
        }

        .btn-primary, .btn-secondary {
          padding: 11px 24px;
          border-radius: 10px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s;
          border: none;
          font-size: 13.5px;
        }

        .btn-primary {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(102,126,234,0.35);
        }

        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }

        .btn-secondary {
          background: rgba(102,126,234,0.1);
          color: #667eea;
        }

        .btn-secondary:hover:not(:disabled) {
          background: rgba(102,126,234,0.2);
        }

        .btn-secondary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* Info Column Styles */
        .info-card {
          background: rgba(255,255,255,0.95);
          backdrop-filter: blur(10px);
          border-radius: 20px;
          padding: 24px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.08);
          border: 1px solid #e2e8f0;
        }

        .upload-copy-container.dark .info-card {
          background: rgba(20,24,50,0.95);
          border-color: #334155;
        }

        .info-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 20px;
          padding-bottom: 14px;
          border-bottom: 2px solid rgba(102,126,234,0.2);
        }

        .info-icon {
          font-size: 24px;
        }

        .info-header h3 {
          font-size: 18px;
          font-weight: 700;
          margin: 0;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .info-content {
          display: flex;
          flex-direction: column;
          gap: 20px;
          flex: 1;
        }

        .info-section h4 {
          font-size: 15px;
          font-weight: 700;
          margin-bottom: 10px;
          color: #667eea;
        }

        .upload-copy-container.dark .info-section h4 {
          color: #8b9dff;
        }

        .info-section ul {
          margin: 0;
          padding-left: 18px;
        }

        .info-section li {
          margin-bottom: 7px;
          line-height: 1.5;
          color: #555;
          font-size: 13.5px;
        }

        .upload-copy-container.dark .info-section li {
          color: #ccc;
        }

        .status-badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
        }

        .pending-badge {
          background: #dcfce7;
          color: #166534;
        }

        .printed-badge {
          background: #fee2e2;
          color: #991b1b;
        }

        .uploaded-badge {
          background: #fef3c7;
          color: #92400e;
        }

        .info-tip {
          display: flex;
          gap: 12px;
          padding: 14px;
          background: linear-gradient(135deg, rgba(102,126,234,0.1) 0%, rgba(118,75,162,0.1) 100%);
          border-radius: 12px;
          border-left: 3px solid #667eea;
        }

        .tip-icon {
          font-size: 18px;
        }

        .info-tip div {
          font-size: 12.5px;
          line-height: 1.5;
          color: #555;
        }

        .upload-copy-container.dark .info-tip div {
          color: #ccc;
        }

        .quick-stats {
          background: linear-gradient(135deg, rgba(102,126,234,0.1) 0%, rgba(118,75,162,0.1) 100%);
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px;
          text-align: center;
        }

        .stat-item {
          padding: 12px;
          background: rgba(255,255,255,0.7);
          border-radius: 12px;
        }

        .upload-copy-container.dark .stat-item {
          background: rgba(30,35,60,0.6);
        }

        .stat-value {
          font-size: 24px;
          font-weight: 800;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin-bottom: 4px;
        }

        .stat-label {
          font-size: 11.5px;
          color: #666;
          font-weight: 600;
        }

        .upload-copy-container.dark .stat-label {
          color: #aaa;
        }

        @media (max-width: 968px) {
          .upload-copy-content {
            padding: 16px;
          }
          
          .two-column-layout {
            flex-direction: column;
          }
          
          .form-column, .info-column {
            flex: auto;
          }
          
          .page-main-title {
            font-size: 26px;
          }
          
          .upload-main-card {
            padding: 20px;
          }
          
          .form-actions {
            flex-direction: column;
          }
          
          .btn-primary, .btn-secondary {
            width: 100%;
            justify-content: center;
          }
          
          .header-left {
            flex-direction: column;
            align-items: flex-start;
            gap: 10px;
          }
        }
      `}</style>
    </div>
  );
}

export default UploadCopy;
