const express = require("express");
const axios = require("axios");

const app = express();

const PORT = process.env.PORT || 3000;
const API_URL = "https://treo-lc79.onrender.com/";

let DATA = "Đang tải dữ liệu...";

function normalizeResult(value) {
  if (!value) return "xỉu";

  const v = String(value).toLowerCase();

  if (
    v.includes("tài") ||
    v.includes("tai") ||
    v === "t"
  ) {
    return "tài";
  }

  return "xỉu";
}

function getSession(item) {
  return (
    item?.phien ||
    item?.session ||
    item?.id ||
    item?.game_id ||
    0
  );
}

function getResult(item) {
  return normalizeResult(
    item?.ket_qua ||
    item?.result ||
    item?.status
  );
}

function getDice(item) {

  if (Array.isArray(item?.xuc_xac)) {
    return item.xuc_xac.join("-");
  }

  if (Array.isArray(item?.dice)) {
    return item.dice.join("-");
  }

  if (
    item?.dice1 !== undefined &&
    item?.dice2 !== undefined &&
    item?.dice3 !== undefined
  ) {
    return `${item.dice1}-${item.dice2}-${item.dice3}`;
  }

  if (
    item?.x1 !== undefined &&
    item?.x2 !== undefined &&
    item?.x3 !== undefined
  ) {
    return `${item.x1}-${item.x2}-${item.x3}`;
  }

  return "null-null-null";
}

function buildCau(history) {
  return history
    .map(i => getResult(i) === "tài" ? "T" : "X")
    .join("");
}

function predict(history) {

  const results = history.map(i => getResult(i));

  const cau = buildCau(history);

  let taiPoint = 0;
  let xiuPoint = 0;

  // tổng lịch sử
  for (const r of results) {
    if (r === "tài") taiPoint++;
    else xiuPoint++;
  }

  // 10 phiên gần
  const recent = results.slice(-10);

  let recentTai = 0;
  let recentXiu = 0;

  for (const r of recent) {
    if (r === "tài") recentTai++;
    else recentXiu++;
  }

  taiPoint += recentTai * 2;
  xiuPoint += recentXiu * 2;

  // phát hiện bệt
  const last = results[results.length - 1];

  let streak = 1;

  for (let i = results.length - 2; i >= 0; i--) {

    if (results[i] === last) {
      streak++;
    } else {
      break;
    }

  }

  // bệt dài => bẻ cầu
  if (streak >= 4) {

    if (last === "tài") {
      xiuPoint += streak * 5;
    } else {
      taiPoint += streak * 5;
    }

  }

  // cầu 1-1
  const last6 = cau.slice(-6);

  if (
    last6 === "TXT XTX".replace(/\s/g, "") ||
    last6 === "XTXTXT"
  ) {

    if (last === "tài") {
      xiuPoint += 8;
    } else {
      taiPoint += 8;
    }

  }

  // cầu 2-2
  const last4 = cau.slice(-4);

  if (last4 === "TTXX") taiPoint += 6;
  if (last4 === "XXTT") xiuPoint += 6;

  // random nhẹ tránh fix 1 bên
  const random = Math.floor(Math.random() * 6);

  if (random <= 2) taiPoint += random;
  else xiuPoint += (random - 2);

  let predict = taiPoint > xiuPoint
    ? "tài"
    : "xỉu";

  // nếu bằng nhau => theo phiên cuối
  if (taiPoint === xiuPoint) {

    predict = last === "tài"
      ? "xỉu"
      : "tài";

  }

  let confidence = Math.floor(
    (Math.max(taiPoint, xiuPoint) /
    (taiPoint + xiuPoint)) * 100
  );

  if (confidence < 55) confidence = 55;
  if (confidence > 93) confidence = 93;

  return {
    predict,
    confidence,
    cau
  };
}

async function updateData() {

  try {

    const res = await axios.get(API_URL, {
      timeout: 10000
    });

    let data = res.data;

    if (Array.isArray(data)) {
      data = data;
    } else if (Array.isArray(data.history)) {
      data = data.history;
    } else if (Array.isArray(data.data)) {
      data = data.data;
    } else {
      data = [];
    }

    if (!data.length) {
      DATA = "Không có dữ liệu";
      return;
    }

    // sort tăng dần
    data.sort((a, b) => {
      return Number(getSession(a)) - Number(getSession(b));
    });

    const latest = data[data.length - 1];

    const phien = getSession(latest);

    const ketQua = getResult(latest);

    const xucXac = getDice(latest);

    const current = Number(phien) + 1;

    const pred = predict(data);

    DATA =
`Id: S2king
Phien: ${phien}
Ket_qua: ${ketQua}
Xuc_xac: ${xucXac}
Phien_hien_tai: ${current}
Du_doan: ${pred.predict}
Do_tin_cay: ${pred.confidence}%
Chuoi_cau: ${pred.cau}`;

  } catch (err) {

    DATA = "Lỗi API";

  }

}

app.get("/", (req, res) => {

  res.setHeader(
    "Content-Type",
    "text/plain; charset=utf-8"
  );

  res.send(DATA);

});

updateData();

setInterval(updateData, 5000);

app.listen(PORT, () => {
  console.log("Server running " + PORT);
});