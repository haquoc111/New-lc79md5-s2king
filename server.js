// server.js

const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

const API_URL = "https://treo-lc79.onrender.com";

let DATA = [];
let LAST_SESSION = null;

function getTaiXiu(total) {
  return total >= 11 ? "tài" : "xỉu";
}

function randomDiceByType(type) {
  if (type === "tài") {
    while (true) {
      let a = Math.floor(Math.random() * 6) + 1;
      let b = Math.floor(Math.random() * 6) + 1;
      let c = Math.floor(Math.random() * 6) + 1;
      if (a + b + c >= 11) return [a, b, c];
    }
  } else {
    while (true) {
      let a = Math.floor(Math.random() * 6) + 1;
      let b = Math.floor(Math.random() * 6) + 1;
      let c = Math.floor(Math.random() * 6) + 1;
      if (a + b + c <= 10) return [a, b, c];
    }
  }
}

function analyzePattern(history) {
  if (history.length < 5) {
    return {
      prediction: "tài",
      confidence: 50
    };
  }

  let tai = 0;
  let xiu = 0;

  for (let item of history) {
    if (item.result === "tài") tai++;
    else xiu++;
  }

  let last3 = history.slice(-3).map(i => i.result);

  let prediction = tai >= xiu ? "tài" : "xỉu";
  let confidence = 50;

  if (
    last3[0] === last3[1] &&
    last3[1] === last3[2]
  ) {
    prediction = last3[0] === "tài" ? "xỉu" : "tài";
    confidence = 88;
  }

  let streak = 1;

  for (let i = history.length - 1; i > 0; i--) {
    if (history[i].result === history[i - 1].result) {
      streak++;
    } else {
      break;
    }
  }

  if (streak >= 4) {
    prediction =
      history[history.length - 1].result === "tài"
        ? "xỉu"
        : "tài";

    confidence = 95;
  }

  let recent = history.slice(-20);

  let recentTai = recent.filter(i => i.result === "tài").length;
  let recentXiu = recent.filter(i => i.result === "xỉu").length;

  if (recentTai > recentXiu + 5) {
    prediction = "xỉu";
    confidence += 3;
  }

  if (recentXiu > recentTai + 5) {
    prediction = "tài";
    confidence += 3;
  }

  if (confidence > 100) confidence = 100;

  return {
    prediction,
    confidence
  };
}

async function fetchData() {
  try {
    const response = await axios.get(API_URL, {
      timeout: 10000
    });

    let raw = response.data;

    if (!Array.isArray(raw)) {
      raw = raw.history || raw.data || [];
    }

    const parsed = [];

    for (let item of raw) {
      let phien =
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

      let total = dice.reduce((a, b) => a + b, 0);

      let result =
        item.ket_qua ||
        item.result ||
        getTaiXiu(total);

      parsed.push({
        phien,
        result: result.toLowerCase(),
        dice,
        total
      });
    }

    DATA = parsed.sort((a, b) => a.phien - b.phien);

    if (DATA.length > 0) {
      LAST_SESSION = DATA[DATA.length - 1];
    }

    console.log("Updated:", DATA.length, "sessions");
  } catch (err) {
    console.log("Fetch Error:", err.message);
  }
}

setInterval(fetchData, 5000);
fetchData();

app.get("/", async (req, res) => {
  if (!LAST_SESSION) {
    return res.send("Loading...");
  }

  const predictData = analyzePattern(DATA);

  const nextSession = Number(LAST_SESSION.phien) + 1;

  const fakeDice = randomDiceByType(predictData.prediction);

  const text =
`Id:s2king
Phien:${LAST_SESSION.phien}
Ket_qua:${LAST_SESSION.result}
Xuc_xac:${LAST_SESSION.dice.join("-")}
Phien_hien_tai:${nextSession}
Du_doan:${predictData.prediction}
Do_tin_cay:${predictData.confidence}%`;

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send(text);
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});