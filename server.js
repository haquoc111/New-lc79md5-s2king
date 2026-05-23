// THAY TOÀN BỘ FILE server.js BẰNG CODE NÀY

const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

const API_URL = "https://treo-lc79.onrender.com";

let HISTORY = [];
let LAST = null;

function getTaiXiu(total) {
  return total >= 11 ? "tài" : "xỉu";
}

function normalize(raw) {
  const arr = [];

  for (const item of raw) {
    const phien =
      item.phien ||
      item.session ||
      item.id ||
      item.issue ||
      0;

    let dice =
      item.xuc_xac ||
      item.dice ||
      item.result_dice ||
      [];

    if (typeof dice === "string") {
      dice = dice.split("-").map(Number);
    }

    if (!Array.isArray(dice)) continue;

    const total = dice.reduce((a, b) => a + b, 0);

    const result =
      (item.ket_qua || item.result || getTaiXiu(total))
        .toString()
        .toLowerCase();

    arr.push({
      phien,
      result,
      dice,
      total
    });
  }

  return arr.sort((a, b) => a.phien - b.phien);
}

function streakCount(history) {
  if (history.length <= 1) return 1;

  let streak = 1;
  const last = history[history.length - 1].result;

  for (let i = history.length - 2; i >= 0; i--) {
    if (history[i].result === last) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

function alternating(history) {
  if (history.length < 6) return false;

  const recent = history.slice(-6).map(i => i.result);

  for (let i = 1; i < recent.length; i++) {
    if (recent[i] === recent[i - 1]) {
      return false;
    }
  }

  return true;
}

function detectBridge(history) {
  if (history.length < 12) {
    return {
      prediction: "tài",
      confidence: 50
    };
  }

  const recent = history.slice(-30);

  let tai = 0;
  let xiu = 0;

  for (const r of recent) {
    if (r.result === "tài") tai++;
    else xiu++;
  }

  const last = history[history.length - 1];
  const before = history[history.length - 2];
  const streak = streakCount(history);

  let prediction = last.result;
  let confidence = 50;

  // =====================
  // BẺ CẦU BỆT
  // =====================

  if (streak >= 4) {
    prediction = last.result === "tài" ? "xỉu" : "tài";
    confidence = 93;
  }

  if (streak >= 6) {
    prediction = last.result === "tài" ? "xỉu" : "tài";
    confidence = 98;
  }

  // =====================
  // CẦU 1-1
  // =====================

  if (alternating(history)) {
    prediction = last.result === "tài" ? "xỉu" : "tài";
    confidence = 88;
  }

  // =====================
  // PHÂN TÍCH XÚC XẮC
  // =====================

  const dice = last.dice;

  const sameDice =
    dice[0] === dice[1] &&
    dice[1] === dice[2];

  // tam hoa thường dễ gãy cầu
  if (sameDice) {
    prediction = last.result === "tài" ? "xỉu" : "tài";
    confidence = 97;
  }

  // tổng quá cao
  if (last.total >= 16) {
    prediction = "xỉu";
    confidence += 2;
  }

  // tổng quá thấp
  if (last.total <= 5) {
    prediction = "tài";
    confidence += 2;
  }

  // =====================
  // NHẬN DIỆN NHỊP
  // =====================

  const last5 = history.slice(-5).map(i => i.result);

  const pattern = last5.join("");

  // tài tài xỉu tài tài
  if (
    last5[0] === "tài" &&
    last5[1] === "tài" &&
    last5[2] === "xỉu" &&
    last5[3] === "tài" &&
    last5[4] === "tài"
  ) {
    prediction = "xỉu";
    confidence = 84;
  }

  // xỉu xỉu tài xỉu xỉu
  if (
    last5[0] === "xỉu" &&
    last5[1] === "xỉu" &&
    last5[2] === "tài" &&
    last5[3] === "xỉu" &&
    last5[4] === "xỉu"
  ) {
    prediction = "tài";
    confidence = 84;
  }

  // =====================
  // THIÊN LỆCH DỮ LIỆU
  // =====================

  if (tai >= xiu + 8) {
    prediction = "xỉu";
    confidence += 3;
  }

  if (xiu >= tai + 8) {
    prediction = "tài";
    confidence += 3;
  }

  // =====================
  // PHÂN TÍCH NHỊP GÃY
  // =====================

  if (
    last.result !== before.result &&
    streak === 1
  ) {
    prediction = before.result;
    confidence += 4;
  }

  if (confidence > 100) confidence = 100;

  return {
    prediction,
    confidence
  };
}

async function loadData() {
  try {
    const res = await axios.get(API_URL, {
      timeout: 10000
    });

    let raw = res.data;

    if (!Array.isArray(raw)) {
      raw = raw.history || raw.data || [];
    }

    HISTORY = normalize(raw);

    if (HISTORY.length > 0) {
      LAST = HISTORY[HISTORY.length - 1];
    }

    console.log("UPDATED:", HISTORY.length);
  } catch (e) {
    console.log("ERROR:", e.message);
  }
}

setInterval(loadData, 5000);
loadData();

app.get("/", (req, res) => {
  if (!LAST) {
    return res.send("Loading...");
  }

  const ai = detectBridge(HISTORY);

  const current = Number(LAST.phien) + 1;

  const output =
`Id:s2king
Phien:${LAST.phien}
Ket_qua:${LAST.result}
Xuc_xac:${LAST.dice.join("-")}
Phien_hien_tai:${current}
Du_doan:${ai.prediction}
Do_tin_cay:${ai.confidence}%`;

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send(output);
});

app.listen(PORT, () => {
  console.log("RUNNING PORT", PORT);
});