const http = require("http");
const https = require("https");

const API_URL = "https://treo-lc79.onrender.com";
const PORT = process.env.PORT || 3000;
const BOT_ID = "s2king";

// ─── Fetch dữ liệu từ API ─────────────────────────────────────────────────
function fetchData() {
  return new Promise((resolve, reject) => {
    https.get(API_URL, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

// ─── 1. Markov bậc 1: P(next | prev) ────────────────────────────────────────
function markov1(history) {
  const t = { TAI_TAI: 0, TAI_XIU: 0, XIU_TAI: 0, XIU_XIU: 0 };
  for (let i = 0; i < history.length - 1; i++) {
    const key = history[i + 1].result + "_" + history[i].result;
    if (t[key] !== undefined) t[key]++;
  }
  return t;
}

// ─── 2. Markov bậc 2: P(next | prev2, prev1) ────────────────────────────────
function markov2(history) {
  const t = {};
  for (let i = 0; i < history.length - 2; i++) {
    const key = history[i + 2].result + "_" + history[i + 1].result + "_" + history[i].result;
    t[key] = (t[key] || 0) + 1;
  }
  return t;
}

// ─── 3. Markov bậc 3: P(next | prev3, prev2, prev1) ─────────────────────────
function markov3(history) {
  const t = {};
  for (let i = 0; i < history.length - 3; i++) {
    const key =
      history[i + 3].result + "_" +
      history[i + 2].result + "_" +
      history[i + 1].result + "_" +
      history[i].result;
    t[key] = (t[key] || 0) + 1;
  }
  return t;
}

// ─── 4. Phân tích cầu: độ dài streak hiện tại ───────────────────────────────
function detectStreak(history) {
  if (!history.length) return { type: null, length: 0 };
  const cur = history[0].result;
  let len = 0;
  for (const h of history) {
    if (h.result === cur) len++;
    else break;
  }
  return { type: cur, length: len };
}

// ─── 5. Phân tích tần suất độ dài cầu → khi nào thường bẻ ──────────────────
function streakBreakStats(history) {
  // Tìm tất cả chuỗi, xem chuỗi dài L thường kết thúc ở đâu
  const breakAt = {}; // breakAt[L] = số lần chuỗi dài đúng L rồi bẻ
  let i = 0;
  while (i < history.length) {
    const cur = history[i].result;
    let len = 0;
    while (i < history.length && history[i].result === cur) { i++; len++; }
    breakAt[len] = (breakAt[len] || 0) + 1;
  }
  return breakAt;
}

// ─── 6. Xác suất bẻ tại độ dài cầu hiện tại ────────────────────────────────
function breakProbability(streakLen, breakStats) {
  // Tổng số chuỗi có độ dài >= streakLen
  let total = 0;
  let broke = 0;
  for (const [len, count] of Object.entries(breakStats)) {
    if (Number(len) >= streakLen) total += count;
    if (Number(len) === streakLen) broke += count;
  }
  return total === 0 ? 0.5 : broke / total;
}

// ─── 7. Xu hướng theo cửa sổ trượt ──────────────────────────────────────────
function windowTrend(history, windowSize) {
  const w = history.slice(0, windowSize);
  const tai = w.filter(h => h.result === "TAI").length;
  return tai / w.length; // > 0.5 = thiên TAI, < 0.5 = thiên XIU
}

// ─── 8. Pattern matching: tìm chuỗi N phiên gần nhất đã từng xảy ra ─────────
function patternMatch(history, lookback = 5) {
  if (history.length <= lookback) return { tai: 0, xiu: 0, total: 0 };
  const pattern = history.slice(0, lookback).map(h => h.result);
  let tai = 0, xiu = 0;
  for (let i = lookback; i < history.length - 1; i++) {
    const seg = history.slice(i, i + lookback).map(h => h.result);
    if (seg.join(",") === pattern.join(",")) {
      const next = history[i - 1] ? history[i - 1].result : null;
      if (next === "TAI") tai++;
      else if (next === "XIU") xiu++;
    }
  }
  return { tai, xiu, total: tai + xiu };
}

// ─── 9. Phân tích điểm xúc xắc phân phối ────────────────────────────────────
function pointDistribution(history) {
  // Thống kê: sau khi điểm thấp/cao, kết quả phiên sau là gì
  const afterHigh = { TAI: 0, XIU: 0 }; // sau điểm >= 15
  const afterLow  = { TAI: 0, XIU: 0 }; // sau điểm <= 6
  for (let i = 1; i < history.length; i++) {
    const prev = history[i];     // phiên trước (index cao hơn = cũ hơn)
    const next = history[i - 1]; // phiên sau
    if (prev.point >= 15) afterHigh[next.result]++;
    else if (prev.point <= 6) afterLow[next.result]++;
  }
  return { afterHigh, afterLow };
}

// ─── THUẬT TOÁN DỰ ĐOÁN CHÍNH ────────────────────────────────────────────────
function predict(data) {
  const history = data.history || [];
  if (history.length < 10) {
    return { prediction: "XIU", confidence: 51 };
  }

  let scoreTAI = 0;
  let scoreXIU = 0;

  // ══ A. MARKOV BẬC 1 (trọng số 20) ══
  const mk1 = markov1(history);
  const last1 = history[0].result;
  if (last1 === "TAI") {
    const tot = mk1.TAI_TAI + mk1.TAI_XIU || 1;
    const p = mk1.TAI_TAI / tot;
    scoreTAI += p * 20;
    scoreXIU += (1 - p) * 20;
  } else {
    const tot = mk1.XIU_TAI + mk1.XIU_XIU || 1;
    const p = mk1.XIU_TAI / tot;
    scoreTAI += p * 20;
    scoreXIU += (1 - p) * 20;
  }

  // ══ B. MARKOV BẬC 2 (trọng số 25) ══
  if (history.length >= 2) {
    const mk2 = markov2(history);
    const last2 = history[1].result + "_" + history[0].result;
    const keyTAI = "TAI_" + last2;
    const keyXIU = "XIU_" + last2;
    const cntTAI = mk2[keyTAI] || 0;
    const cntXIU = mk2[keyXIU] || 0;
    const tot2 = cntTAI + cntXIU || 1;
    scoreTAI += (cntTAI / tot2) * 25;
    scoreXIU += (cntXIU / tot2) * 25;
  }

  // ══ C. MARKOV BẬC 3 (trọng số 25) ══
  if (history.length >= 3) {
    const mk3 = markov3(history);
    const last3 = history[2].result + "_" + history[1].result + "_" + history[0].result;
    const keyTAI = "TAI_" + last3;
    const keyXIU = "XIU_" + last3;
    const cntTAI = mk3[keyTAI] || 0;
    const cntXIU = mk3[keyXIU] || 0;
    const tot3 = cntTAI + cntXIU || 1;
    if (cntTAI + cntXIU > 0) { // chỉ tính nếu pattern từng xảy ra
      scoreTAI += (cntTAI / tot3) * 25;
      scoreXIU += (cntXIU / tot3) * 25;
    } else {
      // fallback: chia đều
      scoreTAI += 12.5;
      scoreXIU += 12.5;
    }
  }

  // ══ D. PHÂN TÍCH CẦU + THỐNG KÊ BẺ CẦU LỊCH SỬ (trọng số 20) ══
  const streak = detectStreak(history);
  const breakStats = streakBreakStats(history);
  const pBreak = breakProbability(streak.length, breakStats);

  if (streak.type === "TAI") {
    // pBreak = xác suất bẻ (= XIU tiếp theo)
    scoreXIU += pBreak * 20;
    scoreTAI += (1 - pBreak) * 20;
  } else {
    scoreTAI += pBreak * 20;
    scoreXIU += (1 - pBreak) * 20;
  }

  // ══ E. PATTERN MATCHING 5 phiên gần nhất (trọng số 15) ══
  const pm = patternMatch(history, 5);
  if (pm.total >= 3) { // chỉ dùng nếu đủ mẫu
    scoreTAI += (pm.tai / pm.total) * 15;
    scoreXIU += (pm.xiu / pm.total) * 15;
  } else {
    scoreTAI += 7.5;
    scoreXIU += 7.5;
  }

  // ══ F. XU HƯỚNG CỬA SỔ TRƯỢT (trọng số 10) ══
  const trend5  = windowTrend(history, 5);
  const trend15 = windowTrend(history, 15);
  const trend50 = windowTrend(history, Math.min(50, history.length));
  // Kết hợp 3 cửa sổ (ngắn hạn quan trọng hơn dài hạn)
  const blendedTrend = trend5 * 0.5 + trend15 * 0.3 + trend50 * 0.2;
  scoreTAI += blendedTrend * 10;
  scoreXIU += (1 - blendedTrend) * 10;

  // ══ G. PHÂN PHỐI ĐIỂM XÚC XẮC THEO LỊCH SỬ (trọng số 5) ══
  const pointDist = pointDistribution(history);
  const lastPoint = history[0].point;
  if (lastPoint >= 15) {
    const tot = pointDist.afterHigh.TAI + pointDist.afterHigh.XIU || 1;
    scoreTAI += (pointDist.afterHigh.TAI / tot) * 5;
    scoreXIU += (pointDist.afterHigh.XIU / tot) * 5;
  } else if (lastPoint <= 6) {
    const tot = pointDist.afterLow.TAI + pointDist.afterLow.XIU || 1;
    scoreTAI += (pointDist.afterLow.TAI / tot) * 5;
    scoreXIU += (pointDist.afterLow.XIU / tot) * 5;
  } else {
    scoreTAI += 2.5;
    scoreXIU += 2.5;
  }

  // ══ TỔNG HỢP ══
  const total = scoreTAI + scoreXIU || 1;
  const finalPrediction = scoreTAI >= scoreXIU ? "TAI" : "XIU";
  const winScore = Math.max(scoreTAI, scoreXIU);
  const rawConf = Math.round((winScore / total) * 100);
  // Không inflate quá mức — giữ thực tế
  const confidence = Math.min(Math.max(rawConf, 52), 82);

  return { prediction: finalPrediction, confidence, streak };
}

// ─── Format output ────────────────────────────────────────────────────────────
function formatOutput(data, pred) {
  const latest = data.latest;
  const dices = latest.dices.join("-");
  const ketQua = latest.result === "TAI" ? "tài" : "xỉu";
  const duDoan  = pred.prediction === "TAI" ? "tài" : "xỉu";
  const phienHienTai = latest.phien + 1;

  return [
    `Id: ${BOT_ID}`,
    `Phien: ${latest.phien}`,
    `Ket_qua: ${ketQua}`,
    `Xuc_xac: ${dices}`,
    `Phien_hien_tai: ${phienHienTai}`,
    `Du_doan: ${duDoan}`,
    `Do_tin_cay: ${pred.confidence}%`,
  ].join("\n");
}

// ─── HTTP Server ──────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Method Not Allowed");
  }
  try {
    const data = await fetchData();
    const pred = predict(data);
    const output = formatOutput(data, pred);
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(output);
  } catch (err) {
    console.error("Lỗi:", err.message);
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Lỗi khi lấy dữ liệu: " + err.message);
  }
});

server.listen(PORT, () => {
  console.log(`✅ Server s2king đang chạy tại port ${PORT}`);
});
