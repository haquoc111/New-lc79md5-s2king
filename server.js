const http = require("http");
const https = require("https");

const API_URL = "https://treo-lc79.onrender.com";
const PORT = process.env.PORT || 3000;
const BOT_ID = "s2king";

// ─── Fetch dữ liệu từ API ──────────────────────────────────────────────────
function fetchData() {
  return new Promise((resolve, reject) => {
    https
      .get(API_URL, (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

// ─── Nhận diện cầu (streak) hiện tại ────────────────────────────────────────
function detectStreak(history) {
  if (!history || history.length === 0) return { type: null, length: 0 };
  const latest = history[0].result;
  let length = 0;
  for (const h of history) {
    if (h.result === latest) length++;
    else break;
  }
  return { type: latest, length };
}

// ─── Phân tích pattern N phiên gần nhất ─────────────────────────────────────
function analyzePattern(history, n = 20) {
  const recent = history.slice(0, n);
  const taiCount = recent.filter((h) => h.result === "TAI").length;
  const xiuCount = recent.filter((h) => h.result === "XIU").length;
  return { taiCount, xiuCount, total: recent.length };
}

// ─── Tỷ lệ chuyển trạng thái (Markov) ───────────────────────────────────────
function markovTransition(history) {
  const transitions = { TAI_TAI: 0, TAI_XIU: 0, XIU_TAI: 0, XIU_XIU: 0 };
  for (let i = 0; i < history.length - 1; i++) {
    const cur = history[i].result;
    const prev = history[i + 1].result;
    const key = `${prev}_${cur}`;
    if (transitions[key] !== undefined) transitions[key]++;
  }
  return transitions;
}

// ─── Thuật toán dự đoán chính ────────────────────────────────────────────────
function predict(data) {
  const history = data.history || [];
  if (history.length < 5) {
    return { prediction: "XIU", confidence: 50, reason: "Không đủ dữ liệu" };
  }

  const streak = detectStreak(history);
  const pattern20 = analyzePattern(history, 20);
  const pattern10 = analyzePattern(history, 10);
  const markov = markovTransition(history);

  let scoreTAI = 0;
  let scoreXIU = 0;
  const reasons = [];

  // ── 1. Phân tích Markov (xác suất chuyển trạng thái) ──
  const lastResult = history[0].result;
  if (lastResult === "TAI") {
    const total = markov.TAI_TAI + markov.TAI_XIU || 1;
    const pTAI = markov.TAI_TAI / total;
    const pXIU = markov.TAI_XIU / total;
    scoreTAI += pTAI * 30;
    scoreXIU += pXIU * 30;
    reasons.push(`Markov sau TAI → TAI:${(pTAI * 100).toFixed(0)}% XIU:${(pXIU * 100).toFixed(0)}%`);
  } else {
    const total = markov.XIU_TAI + markov.XIU_XIU || 1;
    const pTAI = markov.XIU_TAI / total;
    const pXIU = markov.XIU_XIU / total;
    scoreTAI += pTAI * 30;
    scoreXIU += pXIU * 30;
    reasons.push(`Markov sau XIU → TAI:${(pTAI * 100).toFixed(0)}% XIU:${(pXIU * 100).toFixed(0)}%`);
  }

  // ── 2. Phát hiện cầu và quyết định bẻ cầu ──
  const BREAK_THRESHOLD = 4; // Bẻ cầu sau 4 phiên liên tiếp
  if (streak.length >= BREAK_THRESHOLD) {
    // Cầu dài → nên bẻ
    if (streak.type === "TAI") {
      scoreXIU += 35;
      reasons.push(`Cầu TAI ${streak.length} phiên → Bẻ sang XIU`);
    } else {
      scoreTAI += 35;
      reasons.push(`Cầu XIU ${streak.length} phiên → Bẻ sang TAI`);
    }
  } else if (streak.length >= 2 && streak.length < BREAK_THRESHOLD) {
    // Cầu ngắn → đi theo
    if (streak.type === "TAI") {
      scoreTAI += 15;
      reasons.push(`Cầu TAI ${streak.length} phiên → Theo cầu`);
    } else {
      scoreXIU += 15;
      reasons.push(`Cầu XIU ${streak.length} phiên → Theo cầu`);
    }
  }

  // ── 3. Xu hướng 10 phiên gần nhất ──
  const ratio10 = pattern10.taiCount / pattern10.total;
  if (ratio10 > 0.6) {
    scoreXIU += 15; // Nhiều TAI → thiên về XIU
    reasons.push(`10 phiên: TAI chiếm ${(ratio10 * 100).toFixed(0)}% → xu hướng XIU`);
  } else if (ratio10 < 0.4) {
    scoreTAI += 15;
    reasons.push(`10 phiên: XIU chiếm ${((1 - ratio10) * 100).toFixed(0)}% → xu hướng TAI`);
  }

  // ── 4. Tổng quan 20 phiên ──
  const ratio20 = pattern20.taiCount / pattern20.total;
  if (ratio20 > 0.65) {
    scoreXIU += 10;
  } else if (ratio20 < 0.35) {
    scoreTAI += 10;
  }

  // ── 5. Điểm số xúc xắc phiên mới nhất ──
  const lastPoint = history[0].point;
  if (lastPoint >= 15) {
    scoreXIU += 8; // Điểm cao → dễ về xỉu
  } else if (lastPoint <= 6) {
    scoreTAI += 8; // Điểm thấp → dễ về tài
  }

  // ── Tổng hợp kết quả ──
  const total = scoreTAI + scoreXIU || 1;
  const finalPrediction = scoreTAI >= scoreXIU ? "TAI" : "XIU";
  const winScore = Math.max(scoreTAI, scoreXIU);
  const rawConfidence = Math.round((winScore / total) * 100);
  // Giới hạn độ tin cậy trong khoảng thực tế
  const confidence = Math.min(Math.max(rawConfidence, 51), 85);

  return {
    prediction: finalPrediction,
    confidence,
    streak,
    reasons,
    scoreTAI: scoreTAI.toFixed(1),
    scoreXIU: scoreXIU.toFixed(1),
  };
}

// ─── Format kết quả dạng text ────────────────────────────────────────────────
function formatOutput(data, pred) {
  const latest = data.latest;
  const dices = latest.dices.join("-");
  const ketQua = latest.result === "TAI" ? "tài" : "xỉu";
  const duDoan = pred.prediction === "TAI" ? "tài" : "xỉu";
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
  console.log(`✅ Server đang chạy tại port ${PORT}`);
});
