const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

const API_URL = 'https://treo-lc79.onrender.com/';

const mapResult = (result) => {
  const normalized = String(result).toLowerCase().trim();
  if (normalized === 'tài' || normalized === 'tai') return 'T';
  if (normalized === 'xỉu' || normalized === 'xiu') return 'X';
  return '?';
};

// Hàm đệ quy tìm mảng đầu tiên trong object (ưu tiên mảng có chứa các phiên)
function findFirstArray(obj, depth = 0) {
  if (depth > 10) return null;
  if (Array.isArray(obj)) return obj;
  if (obj && typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      const found = findFirstArray(obj[key], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

// Hàm dự đoán (giữ nguyên)
function predictNext(historyStr) {
  if (!historyStr || historyStr.length === 0) return { prediction: 'T', confidence: 50 };
  const len = historyStr.length;
  const maxPatternLen = Math.min(10, len);
  let bestPrediction = null;
  let bestConfidence = 0;
  let bestPatternLen = 0;

  for (let patternLen = maxPatternLen; patternLen >= 1; patternLen--) {
    if (len < patternLen + 1) continue;
    const currentPattern = historyStr.slice(-patternLen);
    let countT = 0, countX = 0, totalMatches = 0;

    for (let i = 0; i <= len - patternLen - 1; i++) {
      const sub = historyStr.slice(i, i + patternLen);
      if (sub === currentPattern) {
        const nextChar = historyStr[i + patternLen];
        if (nextChar === 'T') countT++;
        else if (nextChar === 'X') countX++;
        totalMatches++;
      }
    }

    if (totalMatches > 0) {
      let prediction = countT > countX ? 'T' : (countX > countT ? 'X' : null);
      let confidence = Math.max(countT, countX) / totalMatches * 100;
      if (!prediction) {
        const totalT = (historyStr.match(/T/g) || []).length;
        const totalX = (historyStr.match(/X/g) || []).length;
        prediction = totalT >= totalX ? 'T' : 'X';
        confidence = 50;
      }
      if (patternLen > bestPatternLen || (patternLen === bestPatternLen && confidence > bestConfidence)) {
        bestPrediction = prediction;
        bestConfidence = confidence;
        bestPatternLen = patternLen;
      }
    }
  }

  if (!bestPrediction) {
    const totalT = (historyStr.match(/T/g) || []).length;
    const totalX = (historyStr.match(/X/g) || []).length;
    bestPrediction = totalT >= totalX ? 'T' : 'X';
    bestConfidence = (Math.max(totalT, totalX) / (totalT + totalX)) * 100;
  }

  return {
    prediction: bestPrediction === 'T' ? 'tài' : 'xỉu',
    confidence: Math.round(bestConfidence)
  };
}

app.get('/', async (req, res) => {
  try {
    const response = await axios.get(API_URL, { timeout: 10000 });
    const rawData = response.data;

    // Debug: in cấu trúc ra console (chỉ in 1 lần hoặc khi lỗi)
    console.log('Cấu trúc response:', JSON.stringify(rawData).slice(0, 500));

    // Tìm mảng chứa dữ liệu phiên
    let sessions = null;
    if (Array.isArray(rawData)) {
      sessions = rawData;
    } else if (rawData && typeof rawData === 'object') {
      // Thử với các key thông dụng
      const possibleKeys = ['data', 'sessions', 'results', 'history', 'items', 'list'];
      for (const key of possibleKeys) {
        if (Array.isArray(rawData[key])) {
          sessions = rawData[key];
          break;
        }
      }
      // Nếu chưa thấy, quét đệ quy tìm mảng đầu tiên
      if (!sessions) {
        sessions = findFirstArray(rawData);
      }
    }

    if (!sessions || sessions.length === 0) {
      console.error('Không tìm thấy mảng phiên hợp lệ. Dữ liệu nhận được:', JSON.stringify(rawData).slice(0, 200));
      throw new Error('Không tìm thấy mảng phiên trong dữ liệu API');
    }

    // Lọc chỉ lấy các item có trường "phien" và "ket_qua"
    sessions = sessions.filter(s => s && (s.phien !== undefined) && (s.ket_qua !== undefined));
    if (sessions.length === 0) {
      throw new Error('Không có phiên nào chứa trường phien/ket_qua hợp lệ');
    }

    sessions.sort((a, b) => Number(a.phien) - Number(b.phien));

    let historyStr = '';
    let lastSession = null;
    let lastResult = '';
    let lastXucXac = '';

    for (const sess of sessions) {
      const resultChar = mapResult(sess.ket_qua);
      if (resultChar !== '?') {
        historyStr += resultChar;
      }
      lastSession = sess;
      lastResult = sess.ket_qua;
      lastXucXac = sess.xuc_xac || '?';
    }

    if (historyStr.length === 0) {
      throw new Error('Không có kết quả hợp lệ (tài/xỉu) sau khi xử lý');
    }

    const { prediction: duDoan, confidence: doTinCay } = predictNext(historyStr);
    const phienHienTai = lastSession.phien + 1;
    const chuoiCau = historyStr;

    const output = `Id: S2king
Phien: ${lastSession.phien}
Ket_qua: ${lastResult}
Xuc_xac: ${lastXucXac}
Phien_hien_tai: ${phienHienTai}
Du_doan: ${duDoan}
Do_tin_cay: ${doTinCay}%
Chuoi_cau: ${chuoiCau}`;

    res.type('text/plain').send(output);
  } catch (error) {
    console.error('Chi tiết lỗi:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    res.status(500).send(`Lỗi server: ${error.message}`);
  }
});

app.listen(PORT, () => {
  console.log(`Server chạy tại http://localhost:${PORT}`);
});