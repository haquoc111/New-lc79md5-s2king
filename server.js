const express = require("express");
const axios = require("axios");

const app = express();

const PORT = process.env.PORT || 3000;
const API_URL = "https://treo-lc79.onrender.com/";

let cache = {
  text: "Đang tải dữ liệu..."
};

function normalizeResult(text) {
  if (!text) return "xỉu";

  const t = String(text).toLowerCase();

  if (
    t.includes("tai") ||
    t.includes("tài") ||
    t === "t"
  ) {
    return "tài";
  }

  return "xỉu";
}

function getDice(item) {
  if (Array.isArray(item?.dice)) {
    return item.dice.join("-");
  }

  if (Array.isArray(item?.xuc_xac)) {
    return item.xuc_xac.join("-");
  }

  if (item?.dice1 && item?.dice2 && item?.dice3) {
    return `${item.dice1}-${item.dice2}-${item.dice3}`;
  }

  return "1-1-1";
}

function buildCau(history) {
  return history
    .map(i => {
      const r = normalizeResult(
        i.result ||
        i.ket_qua ||
        i.status
      );

      return r === "tài" ? "T" : "X";
    })
    .join("");
}

function predict(history) {
  if (!history.length) {
    return {
      prediction: "tài",
      confidence: 50,
      cau: ""
    };
  }

  const results = history.map(i =>
    normalizeResult(
      i.result ||
      i.ket_qua ||
      i.status
    )
  );

  const cau = results
    .map(r => (r === "tài" ? "T" : "X"))
    .join("");

  let taiScore = 0;
  let xiuScore = 0;

  // Phân tích toàn bộ lịch sử
  for (let i = 1; i < results.length; i++) {
    const current = results[i];
    const prev = results[i - 1];

    // Bệt
    if (current === prev) {
      if (current === "tài") taiScore += 2;
      else xiuScore += 2;
    }

    // Xen kẽ
    if (current !== prev) {
      if (current === "tài") taiScore += 1;
      else xiuScore += 1;
    }
  }

  // 5 phiên gần nhất
  const recent = results.slice(-5);

  const taiRecent = recent.filter(x => x === "tài").length;
  const xiuRecent = recent.filter(x => x === "xỉu").length;

  taiScore += taiRecent * 2;
  xiuScore += xiuRecent * 2;

  // Bẻ cầu khi bệt dài
  const last = results[results.length - 1];

  let streak = 1;

  for (let i = results.length - 2; i >= 0; i--) {
    if (results[i] === last) {
      streak++;
    } else {
      break;
    }
  }

  if (streak >= 4) {
    if (last === "tài") {
      xiuScore += streak * 3;
    } else {
      taiScore += streak * 3;
    }
  }

  // Pattern 2-2
  const last4 = cau.slice(-4);

  if (last4 === "TTXX") taiScore += 4;
  if (last4 === "XXTT") xiuScore += 4;
  if (last4 === "TXT X".replace(/\s/g, "")) xiuScore += 3;
  if (last4 === "XTXT") taiScore += 3;

  let prediction = taiScore >= xiuScore ? "tài" : "xỉu";

  let total = taiScore + xiuScore;

  let confidence = Math.floor(
    (Math.max(taiScore, xiuScore) / (total || 1)) * 100
  );

  if (confidence < 55) confidence = 55;
  if (confidence > 95) confidence = 95;

  return {
    prediction,
    confidence,
    cau
  };
}

async function updateData() {
  try {
    const response = await axios.get(API_URL, {
      timeout: 10000
    });

    let data = response.data;

    if (!Array.isArray(data)) {
      if (Array.isArray(data.history)) {
        data = data.history;
      } else if (Array.isArray(data.data)) {
        data = data.data;
      } else {
        data = [];
      }
    }

    if (!data.length) return;

    const history = data.reverse();

    const latest = history[history.length - 1];

    const phien =
      latest.session ||
      latest.phien ||
      latest.id ||
      "0";

    const ketQua = normalizeResult(
      latest.result ||
      latest.ket_qua ||
      latest.status
    );

    const xucXac = getDice(latest);

    const currentSession = Number(phien) + 1;

    const pred = predict(history);

    cache.text =
`Id: S2king
Phien: ${phien}
Ket_qua: ${ketQua}
Xuc_xac: ${xucXac}
Phien_hien_tai: ${currentSession}
Du_doan: ${pred.prediction}
Do_tin_cay: ${pred.confidence}%
Chuoi_cau: ${pred.cau}`;

  } catch (err) {
    cache.text = "Lỗi lấy dữ liệu API";
  }
}

app.get("/", async (req, res) => {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send(cache.text);
});

updateData();

setInterval(updateData, 5000);

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});