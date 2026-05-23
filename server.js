// server.js - Phiên bản ổn định, xử lý lỗi tốt, tương thích với API thực tế
const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;
const API_URL = "https://treo-lc79.onrender.com";

let HISTORY = [];
let LAST = null;
let lastError = null;

// ---------- Hàm tiện ích ----------
function getTaiXiu(total) {
  return total >= 11 ? "tài" : "xỉu";
}

function normalize(historyArray) {
  if (!Array.isArray(historyArray)) return [];
  const arr = [];
  for (const item of historyArray) {
    const phien = item.phien || item.id || item.issue || 0;
    let dice = item.dices || item.xuc_xac || item.dice || item.result_dice || [];
    if (typeof dice === "string") dice = dice.split("-").map(Number);
    if (!Array.isArray(dice) || dice.length !== 3) continue;
    const total = dice.reduce((a, b) => a + b, 0);
    let resultRaw = item.result || item.ket_qua || getTaiXiu(total);
    let result = resultRaw.toString().toLowerCase();
    if (result === "tai") result = "tài";
    if (result === "xiu") result = "xỉu";
    arr.push({ phien, result, dice, total });
  }
  return arr.sort((a, b) => a.phien - b.phien);
}

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

function isAlternating(history, n = 6) {
  if (history.length < n) return false;
  const recent = history.slice(-n).map(h => h.result);
  for (let i = 1; i < recent.length; i++) {
    if (recent[i] === recent[i - 1]) return false;
  }
  return true;
}

function isDoubleDouble(history, n = 6) {
  if (history.length < n) return false;
  const recent = history.slice(-n).map(h => h.result);
  for (let i = 2; i < recent.length; i += 2) {
    if (recent[i] !== recent[i - 2]) return false;
  }
  if (recent[0] === recent[1] && recent[2] === recent[3] && recent[0] !== recent[2]) {
    if (n === 6 && recent[4] === recent[5] && recent[4] !== recent[2]) return true;
    if (n === 4) return true;
  }
  return false;
}

function isThreeTwo(history) {
  if (history.length < 10) return false;
  const recent = history.slice(-10).map(h => h.result);
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

function isOneTwoOne(history) {
  if (history.length < 6) return false;
  const recent = history.slice(-6).map(h => h.result);
  if (recent[0] === "tài" && recent[1] === "xỉu" && recent[2] === "xỉu" &&
      recent[3] === "tài" && recent[4] === "xỉu" && recent[5] === "xỉu") return true;
  if (recent[0] === "xỉu" && recent[1] === "tài" && recent[2] === "tài" &&
      recent[3] === "xỉu" && recent[4] === "tài" && recent[5] === "tài") return true;
  return false;
}

function getTrend(history, window = 30) {
  const slice = history.slice(-window);
  let tai = 0, xiu = 0;
  for (const h of slice) {
    if (h.result === "tài") tai++;
    else xiu++;
  }
  return { tai, xiu, total: slice.length, bias: tai - xiu };
}

function predictBreak(history) {
  if (history.length < 3) return null;
  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  const streak = streakCount(history);
  if (last.result !== prev.result && streak === 1) {
    const prevStreak = streakCount(history.slice(0, -1));
    if (prevStreak >= 3) {
      return { prediction: prev.result, confidence: 92, reason: "Bẻ cầu bệt" };
    }
  }
  return null;
}

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

  let prediction = null, confidence = 50, reason = "";
  if (breakPred) {
    prediction = breakPred.prediction;
    confidence = breakPred.confidence;
    reason = breakPred.reason;
  } else if (alt) {
    prediction = last.result === "tài" ? "xỉu" : "tài";
    confidence = 88;
    reason = "Cầu 1-1 đan xen";
  } else if (dbl) {
    const recent2 = history.slice(-2).map(h => h.result);
    if (recent2[0] === recent2[1]) {
      prediction = recent2[0] === "tài" ? "xỉu" : "tài";
    } else {
      prediction = last.result;
    }
    confidence = 85;
    reason = "Cầu 2-2";
  } else if (thrTwo) {
    const pattern = history.slice(-5).map(h => h.result).join("");
    if (pattern.startsWith("ttt")) prediction = "xỉu";
    else if (pattern.startsWith("xxx")) prediction = "tài";
    else prediction = last.result === "tài" ? "xỉu" : "tài";
    confidence = 90;
    reason = "Cầu 3-2";
  } else if (oneTwoOne) {
    prediction = last.result === "tài" ? "xỉu" : "tài";
    confidence = 86;
    reason = "Cầu 1-2-1";
  } else if (streak >= 5) {
    prediction = last.result === "tài" ? "xỉu" : "tài";
    confidence = 96;
    reason = `Bẻ cầu bệt ${streak} phiên`;
  } else if (streak === 4) {
    prediction = last.result === "tài" ? "xỉu" : "tài";
    confidence = 88;
    reason = "Bẻ cầu bệt 4 phiên";
  } else {
    const { dice, total } = last;
    const sameDice = dice[0] === dice[1] && dice[1] === dice[2];
    if (sameDice) {
      prediction = last.result === "tài" ? "xỉu" : "tài";
      confidence = 94;
      reason = "Tam hoa (dễ gãy cầu)";
    } else if (total >= 16) {
      prediction = "xỉu";
      confidence = 80;
      reason = "Tổng quá cao, nghiêng xỉu";
    } else if (total <= 5) {
      prediction = "tài";
      confidence = 80;
      reason = "Tổng quá thấp, nghiêng tài";
    } else if (trend.bias >= 8) {
      prediction = "xỉu";
      confidence = 75 + Math.min(10, trend.bias);
      reason = "Thiên lệch tài quá nhiều";
    } else if (trend.bias <= -8) {
      prediction = "tài";
      confidence = 75 + Math.min(10, -trend.bias);
      reason = "Thiên lệch xỉu quá nhiều";
    } else {
      prediction = last.result;
      confidence = 60;
      reason = "Tiếp cầu hiện tại";
    }
  }
  confidence = Math.min(100, Math.max(50, confidence));
  return { prediction, confidence, reason };
}

function getFallbackData() {
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

async function loadData() {
  try {
    console.log("[LOAD] Đang gọi API...");
    const res = await axios.get(API_URL, { timeout: 10000 });
    console.log("[LOAD] HTTP status:", res.status);
    const rawData = res.data;
    let historyArray = null;
    if (Array.isArray(rawData)) historyArray = rawData;
    else if (rawData && Array.isArray(rawData.history)) historyArray = rawData.history;
    else if (rawData && Array.isArray(rawData.data)) historyArray = rawData.data;
    else throw new Error("Không tìm thấy mảng lịch sử trong response");
    console.log(`[LOAD] Lấy được ${historyArray.length} phiên thô`);
    const newHistory = normalize(historyArray);
    if (newHistory.length === 0) throw new Error("Sau normalize không còn phiên nào");
    HISTORY = newHistory;
    LAST = HISTORY[HISTORY.length - 1];
    lastError = null;
    console.log(`[SUCCESS] Cập nhật ${HISTORY.length} phiên. Phiên cuối: ${LAST.phien} - ${LAST.result}`);
  } catch (err) {
    console.error("[LOAD ERROR]", err.message);
    lastError = err.message;
    if (HISTORY.length === 0) {
      console.warn("[FALLBACK] Dùng dữ liệu mẫu");
      HISTORY = getFallbackData();
      LAST = HISTORY[HISTORY.length - 1];
    }
  }
}

// Tải dữ liệu ngay khi khởi động và lặp mỗi 5 giây
loadData();
setInterval(loadData, 5000);

// Route chính
app.get("/", (req, res) => {
  try {
    if (!LAST) {
      let msg = "Loading...";
      if (lastError) msg += `\nLỗi: ${lastError}`;
      return res.status(200).setHeader("Content-Type", "text/plain; charset=utf-8").send(msg);
    }
    const { prediction, confidence, reason } = advancedPrediction(HISTORY);
    const nextPhien = Number(LAST.phien) + 1;
    let errorNote = lastError ? `\n(Lưu ý: ${lastError})` : "";
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
  } catch (err) {
    console.error("Lỗi xử lý request:", err);
    res.status(500).send(`Internal Server Error: ${err.message}`);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});