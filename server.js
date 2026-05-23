// server.js - Thuật toán dự đoán Tài Xỉu nâng cao
const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

const API_URL = "https://treo-lc79.onrender.com";

let HISTORY = [];      // Lưu toàn bộ lịch sử phiên đã chuẩn hóa
let LAST = null;       // Phiên mới nhất

// Hàm xác định Tài/Xỉu dựa trên tổng điểm 3 mặt xúc xắc
function getTaiXiu(total) {
  return total >= 11 ? "tài" : "xỉu";
}

// Chuẩn hóa dữ liệu từ API về dạng { phien, result, dice, total }
function normalize(raw) {
  const arr = [];
  for (const item of raw) {
    const phien = item.phien || item.session || item.id || item.issue || 0;
    let dice = item.xuc_xac || item.dice || item.result_dice || [];
    if (typeof dice === "string") dice = dice.split("-").map(Number);
    if (!Array.isArray(dice) || dice.length !== 3) continue;
    const total = dice.reduce((a, b) => a + b, 0);
    const result = (item.ket_qua || item.result || getTaiXiu(total)).toString().toLowerCase();
    arr.push({ phien, result, dice, total });
  }
  return arr.sort((a, b) => a.phien - b.phien);
}

// Đếm độ dài chuỗi trùng kết quả hiện tại (cầu bệt)
function streakCount(history) {
  if (history.length === 0) return 1;
  let streak = 1;
  const lastResult = history[history.length - 1].result;
  for (let i = history.length - 2; i >= 0; i--) {
    if (history[i].result === lastResult) streak++;
    else break;
  }
  return streak;
}

// Kiểm tra cầu 1-1 (đan xen) trong n phiên gần nhất
function isAlternating(history, n = 6) {
  if (history.length < n) return false;
  const recent = history.slice(-n).map(h => h.result);
  for (let i = 1; i < recent.length; i++) {
    if (recent[i] === recent[i - 1]) return false;
  }
  return true;
}

// Phát hiện cầu 2-2 (hai tài, hai xỉu, hai tài...)
function isDoubleDouble(history, n = 6) {
  if (history.length < n) return false;
  const recent = history.slice(-n).map(h => h.result);
  for (let i = 2; i < recent.length; i += 2) {
    if (recent[i] !== recent[i - 2]) return false;
  }
  // Kiểm tra tính ổn định: 2 đầu bằng nhau, 2 tiếp theo bằng nhau và khác cặp trước
  if (recent[0] === recent[1] && recent[2] === recent[3] && recent[0] !== recent[2]) {
    if (n === 6 && recent[4] === recent[5] && recent[4] !== recent[2]) return true;
    if (n === 4) return true;
  }
  return false;
}

// Phát hiện cầu 3-2 (ba tài, hai xỉu, ba tài...)
function isThreeTwo(history) {
  if (history.length < 10) return false;
  const recent = history.slice(-10).map(h => h.result);
  // Mẫu: T T T X X T T T X X
  let pattern = "";
  for (let i = 0; i < 5; i++) pattern += recent[i];
  if (pattern === "tttxx" || pattern === "xxxtt") {
    for (let i = 5; i < 10; i++) {
      if (recent[i] !== recent[i - 5]) return false;
    }
    return true;
  }
  return false;
}

// Phát hiện cầu 1-2-1 (T X X T X X T ...) hoặc 2-1-2
function isOneTwoOne(history) {
  if (history.length < 6) return false;
  const recent = history.slice(-6).map(h => h.result);
  // 1-2-1: T X X T X X
  if (recent[0] === "tài" && recent[1] === "xỉu" && recent[2] === "xỉu" &&
      recent[3] === "tài" && recent[4] === "xỉu" && recent[5] === "xỉu") return true;
  if (recent[0] === "xỉu" && recent[1] === "tài" && recent[2] === "tài" &&
      recent[3] === "xỉu" && recent[4] === "tài" && recent[5] === "tài") return true;
  return false;
}

// Phân tích xu hướng tổng thể: % tài/xỉu trong 30 phiên gần nhất
function getTrend(history, window = 30) {
  const slice = history.slice(-window);
  let tai = 0, xiu = 0;
  for (const h of slice) {
    if (h.result === "tài") tai++;
    else xiu++;
  }
  return { tai, xiu, total: slice.length, bias: tai - xiu };
}

// Dự đoán dựa trên nhịp gãy cầu (khi cầu đang bệt mà gãy)
function predictBreak(history) {
  if (history.length < 3) return null;
  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  const streak = streakCount(history);
  // Nếu chuỗi vừa gãy (kết quả khác với phiên trước) và trước đó chuỗi dài >=3
  if (last.result !== prev.result && streak === 1) {
    const prevStreak = streakCount(history.slice(0, -1));
    if (prevStreak >= 3) {
      return { prediction: prev.result, confidence: 92, reason: "Bẻ cầu bệt" };
    }
  }
  return null;
}

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

// Tải dữ liệu từ API và cập nhật HISTORY, LAST
async function loadData() {
  try {
    const res = await axios.get(API_URL, { timeout: 10000 });
    let raw = res.data;
    if (!Array.isArray(raw)) raw = raw.history || raw.data || [];
    const newHistory = normalize(raw);
    if (newHistory.length === 0) return;

    // So sánh để phát hiện phiên mới
    const lastPhien = HISTORY.length ? HISTORY[HISTORY.length - 1].phien : -1;
    HISTORY = newHistory;
    LAST = HISTORY[HISTORY.length - 1];

    if (LAST.phien > lastPhien) {
      console.log(`[UPDATE] Phiên mới: ${LAST.phien} - KQ: ${LAST.result} | Tổng: ${LAST.total}`);
    } else {
      console.log(`[UPDATE] Đồng bộ ${HISTORY.length} phiên`);
    }
  } catch (e) {
    console.error("[LOAD ERROR]", e.message);
  }
}

// Cập nhật mỗi 5 giây
setInterval(loadData, 5000);
loadData();

// Endpoint trả về dự đoán dạng plain text
app.get("/", (req, res) => {
  if (!LAST) {
    return res.send("Loading...");
  }

  const { prediction, confidence, reason } = advancedPrediction(HISTORY);
  const nextPhien = Number(LAST.phien) + 1;

  const output = `Id:s2king
Phien:${LAST.phien}
Ket_qua:${LAST.result}
Xuc_xac:${LAST.dice.join("-")}
Phien_hien_tai:${nextPhien}
Du_doan:${prediction}
Do_tin_cay:${confidence}%
Ly_do:${reason}`;

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send(output);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});