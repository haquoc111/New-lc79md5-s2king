// server.js - ĐÃ SỬA LỖI CẤU TRÚC API
const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// ĐÚNG: URL API chính xác
const API_URL = "https://treo-lc79.onrender.com";

let HISTORY = [];
let LAST = null;
let lastError = null;

// ... (Các hàm tĩnh: getTaiXiu, streakCount, isAlternating, ... GIỮ NGUYÊN) ...
// Hàm xác định Tài/Xỉu dựa trên tổng điểm 3 mặt xúc xắc
function getTaiXiu(total) {
  return total >= 11 ? "tài" : "xỉu";
}

// Chuẩn hóa dữ liệu từ API về dạng { phien, result, dice, total }
function normalize(rawArray) {
  // ĐẢM BẢO rawArray là một mảng
  if (!Array.isArray(rawArray)) {
    console.warn("Dữ liệu đầu vào cho normalize không phải là mảng.");
    return [];
  }

  const arr = [];
  for (const item of rawArray) {
    // Lấy số phiên
    const phien = item.phien || item.session || item.id || item.issue || 0;
    // Lấy mảng xúc xắc - API trả về key là 'dices'
    let dice = item.dices || item.xuc_xac || item.dice || item.result_dice || [];
    if (typeof dice === "string") dice = dice.split("-").map(Number);
    if (!Array.isArray(dice) || dice.length !== 3) continue;
    
    const total = dice.reduce((a, b) => a + b, 0);
    // Lấy kết quả - API trả về key là 'result' (GIÁ TRỊ "TAI"/"XIU")
    let resultRaw = item.result || item.ket_qua || getTaiXiu(total);
    let result = resultRaw.toString().toLowerCase();
    // Chuẩn hóa từ "tai"/"xiu" (tiếng Việt) hoặc "tai"/"xiu" (tiếng Anh viết thường)
    if (result === "tai") result = "tài";
    if (result === "xiu") result = "xỉu";
    
    arr.push({ phien, result, dice, total });
  }
  // Sắp xếp theo số phiên tăng dần
  return arr.sort((a, b) => a.phien - b.phien);
}

// ...

// Hàm tải dữ liệu CHÍNH XÁC với cấu trúc API mới
async function loadData() {
  try {
    console.log("[LOAD] Đang gọi API...");
    const res = await axios.get(API_URL, { timeout: 10000 });
    console.log("[LOAD] API trả về status:", res.status);
    
    // --- ĐIỂM THAY ĐỔI QUAN TRỌNG ---
    // Lấy đối tượng dữ liệu gốc từ API
    const rawData = res.data;
    
    // Kiểm tra nếu rawData không phải là object hoặc không có trường 'history'
    if (!rawData || typeof rawData !== 'object' || !Array.isArray(rawData.history)) {
      throw new Error("Dữ liệu API không hợp lệ: thiếu trường 'history'");
    }
    
    // Lấy mảng lịch sử từ trường 'history' của đối tượng trả về
    const historyArray = rawData.history;
    console.log(`[LOAD] Đã lấy được mảng history với ${historyArray.length} phiên.`);
    
    // Chuẩn hóa mảng lịch sử này
    const newHistory = normalize(historyArray);
    // --------------------------------
    
    if (newHistory.length === 0) {
      throw new Error("Sau khi chuẩn hóa, không có dữ liệu hợp lệ.");
    }

    // Cập nhật HISTORY và LAST
    HISTORY = newHistory;
    LAST = HISTORY[HISTORY.length - 1];
    lastError = null;
    console.log(`[SUCCESS] Đã tải ${HISTORY.length} phiên, phiên cuối: ${LAST.phien} - ${LAST.result}`);
  } catch (e) {
    console.error("[LOAD ERROR]", e.message);
    lastError = e.message;

    // Chỉ dùng fallback nếu CHƯA có dữ liệu trong HISTORY
    if (HISTORY.length === 0) {
      console.warn("[FALLBACK] Sử dụng dữ liệu mẫu để demo.");
      HISTORY = getFallbackData();
      LAST = HISTORY[HISTORY.length - 1];
    }
  }
}

// ... (Các hàm nhận diện cầu và dự đoán GIỮ NGUYÊN) ...
// Hàm dự đoán chính - nhận diện cầu và đưa ra quyết định
function advancedPrediction(history) {
  if (history.length < 5) {
    return { prediction: "tài", confidence: 50, reason: "Chưa đủ dữ liệu" };
  }

  const last = history[history.length - 1];
  const streak = streakCount(history);
  const trend = getTrend(history, 30);
  const alt = isAlternating(history, 6);
  const dbl = isDoubleDouble(history, 6);
  const thrTwo = isThreeTwo(history);
  const oneTwoOne = isOneTwoOne(history);
  const breakPred = predictBreak(history);

  let prediction = null;
  let confidence = 50;
  let reason = "";

  // Ưu tiên bẻ cầu bệt nếu có dấu hiệu gãy
  if (breakPred) {
    prediction = breakPred.prediction;
    confidence = breakPred.confidence;
    reason = breakPred.reason;
  }
  // Cầu 1-1
  else if (alt) {
    prediction = last.result === "tài" ? "xỉu" : "tài";
    confidence = 88;
    reason = "Cầu 1-1 đan xen";
  }
  // Cầu 2-2
  else if (dbl) {
    const recent2 = history.slice(-2).map(h => h.result);
    if (recent2[0] === recent2[1]) {
      prediction = recent2[0] === "tài" ? "xỉu" : "tài";
    } else {
      prediction = last.result;
    }
    confidence = 85;
    reason = "Cầu 2-2";
  }
  // Cầu 3-2
  else if (thrTwo) {
    const pattern = history.slice(-5).map(h => h.result).join("");
    if (pattern.startsWith("ttt")) prediction = "xỉu";
    else if (pattern.startsWith("xxx")) prediction = "tài";
    else prediction = last.result === "tài" ? "xỉu" : "tài";
    confidence = 90;
    reason = "Cầu 3-2";
  }
  // Cầu 1-2-1
  else if (oneTwoOne) {
    prediction = last.result === "tài" ? "xỉu" : "tài"; // tiếp tục đan xen khối
    confidence = 86;
    reason = "Cầu 1-2-1";
  }
  // Bẻ cầu bệt dài
  else if (streak >= 5) {
    prediction = last.result === "tài" ? "xỉu" : "tài";
    confidence = 96;
    reason = `Bẻ cầu bệt ${streak} phiên`;
  }
  else if (streak === 4) {
    prediction = last.result === "tài" ? "xỉu" : "tài";
    confidence = 88;
    reason = "Bẻ cầu bệt 4 phiên";
  }
  // Phân tích xúc xắc phiên cuối
  else {
    const { dice, total } = last;
    const sameDice = dice[0] === dice[1] && dice[1] === dice[2];
    if (sameDice) {
      prediction = last.result === "tài" ? "xỉu" : "tài";
      confidence = 94;
      reason = "Tam hoa (dễ gãy cầu)";
    }
    else if (total >= 16) {
      prediction = "xỉu";
      confidence = 80;
      reason = "Tổng quá cao, nghiêng xỉu";
    }
    else if (total <= 5) {
      prediction = "tài";
      confidence = 80;
      reason = "Tổng quá thấp, nghiêng tài";
    }
    // Xu hướng thiên lệch trong 30 phiên
    else if (trend.bias >= 8) {
      prediction = "xỉu";
      confidence = 75 + Math.min(10, trend.bias);
      reason = "Thiên lệch tài quá nhiều";
    }
    else if (trend.bias <= -8) {
      prediction = "tài";
      confidence = 75 + Math.min(10, -trend.bias);
      reason = "Thiên lệch xỉu quá nhiều";
    }
    // Mặc định: tiếp tục cầu hiện tại nếu chuỗi < 4
    else {
      prediction = last.result;
      confidence = 60;
      reason = "Tiếp cầu hiện tại";
    }
  }

  // Giới hạn độ tin cậy trong [50, 100]
  confidence = Math.min(100, Math.max(50, confidence));
  return { prediction, confidence, reason };
}

// Hàm cung cấp dữ liệu mẫu (fallback) trong trường hợp API thất bại và chưa có dữ liệu
function getFallbackData() {
  // ... (giữ nguyên nội dung cũ) ...
  return [
    { phien: 100, result: "tài", dice: [4,5,6], total: 15 },
    { phien: 101, result: "tài", dice: [5,5,5], total: 15 },
    { phien: 102, result: "xỉu", dice: [1,2,3], total: 6 },
    { phien: 103, result: "xỉu", dice: [2,2,2], total: 6 },
    { phien: 104, result: "tài", dice: [4,4,4], total: 12 },
    { phien: 105, result: "tài", dice: [6,6,1], total: 13 },
    { phien: 106, result: "xỉu", dice: [1,1,4], total: 6 },
    { phien: 107, result: "tài", dice: [5,5,1], total: 11 },
    { phien: 108, result: "tài", dice: [6,5,4], total: 15 },
    { phien: 109, result: "xỉu", dice: [1,2,2], total: 5 },
  ];
}

// Cập nhật mỗi 5 giây
setInterval(loadData, 5000);
loadData();

// Endpoint trả về dự đoán dạng plain text
app.get("/", (req, res) => {
  if (!LAST) {
    let msg = "Loading...";
    if (lastError) msg += `\nLỗi API: ${lastError}\nĐang thử lại...`;
    return res.setHeader("Content-Type", "text/plain; charset=utf-8").send(msg);
  }

  const { prediction, confidence, reason } = advancedPrediction(HISTORY);
  const nextPhien = Number(LAST.phien) + 1;

  let errorNote = "";
  if (lastError) errorNote = `\n(Đang dùng dữ liệu cũ/có lỗi: ${lastError})`;

  const output = `Id:s2king
Phien:${LAST.phien}
Ket_qua:${LAST.result}
Xuc_xac:${LAST.dice.join("-")}
Phien_hien_tai:${nextPhien}
Du_doan:${prediction}
Do_tin_cay:${confidence}%
Ly_do:${reason}${errorNote}`;

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send(output);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});