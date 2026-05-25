const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// API lấy dữ liệu lịch sử
const API_URL = 'https://treo-lc79.onrender.com/';

// Hàm chuyển kết quả thành ký tự T (tài) hoặc X (xỉu)
const mapResult = (result) => {
  const normalized = result.toLowerCase().trim();
  if (normalized === 'tài' || normalized === 'tai') return 'T';
  if (normalized === 'xỉu' || normalized === 'xiu') return 'X';
  return '?';
};

// Hàm dự đoán dựa trên chuỗi lịch sử
function predictNext(historyStr) {
  if (!historyStr || historyStr.length === 0) return { prediction: 'T', confidence: 50 };

  const len = historyStr.length;
  const maxPatternLen = Math.min(10, len); // Xét pattern dài tối đa 10
  let bestPrediction = null;
  let bestConfidence = 0;
  let bestPatternLen = 0;

  // Duyệt từ pattern dài nhất đến ngắn nhất để ưu tiên mẫu dài
  for (let patternLen = maxPatternLen; patternLen >= 1; patternLen--) {
    if (len < patternLen + 1) continue;

    const currentPattern = historyStr.slice(-patternLen);
    let countT = 0, countX = 0, totalMatches = 0;

    // Duyệt tất cả các vị trí có pattern khớp (trừ vị trí cuối cùng)
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
      // Nếu hòa, dùng tổng tỷ lệ chung để quyết định
      if (!prediction) {
        const totalT = (historyStr.match(/T/g) || []).length;
        const totalX = (historyStr.match(/X/g) || []).length;
        prediction = totalT >= totalX ? 'T' : 'X';
        confidence = 50;
      }
      // Chọn kết quả tốt nhất ưu tiên pattern dài hơn và độ tin cậy cao
      if (patternLen > bestPatternLen || (patternLen === bestPatternLen && confidence > bestConfidence)) {
        bestPrediction = prediction;
        bestConfidence = confidence;
        bestPatternLen = patternLen;
      }
    }
  }

  // Nếu không tìm thấy pattern nào (rất hiếm), dùng tổng tần suất
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

// Endpoint chính trả về mẫu yêu cầu
app.get('/', async (req, res) => {
  try {
    // Gọi API lấy dữ liệu
    const response = await axios.get(API_URL);
    let data = response.data;

    // Kiểm tra cấu trúc dữ liệu (có thể là mảng trực tiếp hoặc trong data.data)
    let sessions = Array.isArray(data) ? data : (data.data && Array.isArray(data.data) ? data.data : []);
    if (sessions.length === 0) {
      throw new Error('Không lấy được dữ liệu phiên từ API');
    }

    // Sắp xếp theo phiên tăng dần
    sessions.sort((a, b) => a.phien - b.phien);

    // Xây dựng chuỗi cầu
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
      throw new Error('Không có kết quả hợp lệ để phân tích');
    }

    // Dự đoán phiên tiếp theo
    const { prediction: duDoan, confidence: doTinCay } = predictNext(historyStr);

    // Lấy phiên hiện tại (phiên cuối + 1)
    const phienHienTai = lastSession.phien + 1;

    // Chuỗi cầu đầy đủ
    const chuoiCau = historyStr;

    // Định dạng output theo mẫu
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
    console.error('Lỗi:', error.message);
    res.status(500).send('Lỗi server: ' + error.message);
  }
});

app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});