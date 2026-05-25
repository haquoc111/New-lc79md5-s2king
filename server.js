const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

const API_URL = 'https://treo-lc79.onrender.com/';

// Hàm chuyển kết quả (dựa trên chuỗi)
function mapResult(value) {
  if (!value) return '?';
  const str = String(value).toLowerCase().trim();
  if (str === 'tài' || str === 'tai') return 'T';
  if (str === 'xỉu' || str === 'xiu') return 'X';
  return '?';
}

// Tự động tìm mảng chứa dữ liệu phiên (đệ quy)
function findArray(obj, depth = 0) {
  if (depth > 10) return null;
  if (Array.isArray(obj) && obj.length > 0) return obj;
  if (obj && typeof obj === 'object') {
    for (let key in obj) {
      const found = findArray(obj[key], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

// Tự động map các trường từ một object phiên
function mapSessionFields(session) {
  if (!session || typeof session !== 'object') return null;

  // Các tên trường có thể có
  const possiblePhien = ['phien', 'phiên', 'session', 'session_id', 'id', 'stt', 'no'];
  const possibleKetQua = ['ket_qua', 'ketqua', 'result', 'kq', 'tai_xiu', 'value'];
  const possibleXucXac = ['xuc_xac', 'xucxac', 'dice', 'xí_ngầu', 'faces'];

  let phien = null, ketQua = null, xucXac = null;

  // Tìm trường chứa số phiên
  for (let p of possiblePhien) {
    if (session[p] !== undefined) {
      phien = session[p];
      break;
    }
  }
  // Nếu không tìm thấy, thử lấy key đầu tiên có giá trị là số
  if (phien === null) {
    for (let key in session) {
      if (typeof session[key] === 'number' || !isNaN(Number(session[key]))) {
        phien = session[key];
        break;
      }
    }
  }

  // Tìm trường chứa kết quả
  for (let k of possibleKetQua) {
    if (session[k] !== undefined) {
      ketQua = session[k];
      break;
    }
  }
  if (ketQua === null) {
    for (let key in session) {
      let val = session[key];
      if (typeof val === 'string') {
        let lower = val.toLowerCase();
        if (lower.includes('tài') || lower.includes('tai') || lower.includes('xỉu') || lower.includes('xiu')) {
          ketQua = val;
          break;
        }
      }
    }
  }

  // Tìm trường chứa xúc xắc (có thể là chuỗi "5-5-5" hoặc mảng)
  for (let x of possibleXucXac) {
    if (session[x] !== undefined) {
      xucXac = session[x];
      break;
    }
  }
  if (xucXac === null) {
    for (let key in session) {
      let val = session[key];
      if (typeof val === 'string' && /^\d+[-]\d+[-]\d+$/.test(val)) {
        xucXac = val;
        break;
      }
      if (Array.isArray(val) && val.length === 3 && val.every(v => typeof v === 'number')) {
        xucXac = val.join('-');
        break;
      }
    }
  }

  if (phien === null || ketQua === null) return null;
  return { phien: Number(phien), ketQua: String(ketQua), xucXac: xucXac ? String(xucXac) : '?' };
}

// Hàm dự đoán (giữ nguyên logic cũ)
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
    const response = await axios.get(API_URL, { timeout: 15000 });
    const rawData = response.data;

    // Ghi log cấu trúc một phần để debug (chỉ in lên console Render)
    console.log('===== DỮ LIỆU NHẬN ĐƯỢC =====');
    console.log(JSON.stringify(rawData).slice(0, 1000));
    console.log('==============================');

    // Bước 1: Tìm mảng trong dữ liệu
    let rawArray = findArray(rawData);
    if (!rawArray) {
      throw new Error('Không tìm thấy mảng dữ liệu nào trong API');
    }
    console.log(`Tìm thấy mảng với ${rawArray.length} phần tử. Mẫu phần tử đầu:`, rawArray[0]);

    // Bước 2: Chuyển đổi từng phần tử thành phiên chuẩn
    const sessions = [];
    for (let item of rawArray) {
      const mapped = mapSessionFields(item);
      if (mapped) {
        sessions.push(mapped);
      } else {
        console.log('Bỏ qua phần tử không map được:', item);
      }
    }

    if (sessions.length === 0) {
      throw new Error('Không có phiên nào được map thành công từ dữ liệu');
    }

    // Sắp xếp theo số phiên
    sessions.sort((a, b) => a.phien - b.phien);

    let historyStr = '';
    let lastSession = sessions[sessions.length - 1];
    let lastResult = lastSession.ketQua;
    let lastXucXac = lastSession.xucXac;

    for (let sess of sessions) {
      const resultChar = mapResult(sess.ketQua);
      if (resultChar !== '?') {
        historyStr += resultChar;
      }
    }

    if (historyStr.length === 0) {
      throw new Error('Sau khi lọc, không có kết quả tài/xỉu hợp lệ');
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
    console.error('Lỗi chi tiết:', error.message);
    res.status(500).send(`Lỗi server: ${error.message}`);
  }
});

app.listen(PORT, () => {
  console.log(`Server đang lắng nghe tại cổng ${PORT}`);
});