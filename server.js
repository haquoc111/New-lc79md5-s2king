const express = require("express");
const axios = require("axios");

const app = express();

const PORT = process.env.PORT || 3000;
const API_URL = "https://treo-lc79.onrender.com/";

let DATA_TEXT = "Đang tải dữ liệu...";

function toResult(v) {
  if (!v) return "xỉu";

  const t = String(v).toLowerCase();

  if (
    t.includes("tài") ||
    t.includes("tai") ||
    t === "t"
  ) {
    return "tài";
  }

  return "xỉu";
}

function getDice(item) {
  // dạng [1,2,3]
  if (Array.isArray(item?.xuc_xac)) {
    return item.xuc_xac.join("-");
  }

  if (Array.isArray(item?.dice)) {
    return item.dice.join("-");
  }

  // dạng dice1 dice2 dice3
  if (
    item?.dice1 !== undefined &&
    item?.dice2 !== undefined &&
    item?.dice3 !== undefined
  ) {
    return `${item.dice1}-${item.dice2}-${item.dice3}`;
  }

  // dạng x1 x2 x3
  if (
    item?.x1 !== undefined &&
    item?.x2 !== undefined &&
    item?.x3 !== undefined
  ) {
    return `${item.x1}-${item.x2}-${item.x3}`;
  }

  return "null-null-null";
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
  return toResult(
    item?.ket_qua ||
    item?.result ||
    item?.status
  );
}

function buildCau(list) {
  return list
    .map(i => getResult(i) === "tài" ? "T" : "X")
    .join("");
}

function predict(history) {

  const results = history.map(i => getResult(i));

  let tai = 0;
  let xiu = 0;

  // thống kê tổng
  for (const r of results) {
    if (r === "tài") tai++;
    else xiu++;
  }

  // thống kê gần
  const recent = results.slice(-12);

  let recentTai = 0;
  let recentXiu = 0;

  for (const r of recent) {
    if (r === "tài") recentTai++;
    else recentXiu++;
  }

  // phát hiện cầu
  const last = results[results.length - 1];

  let streak = 1;

  for (let i = results.length - 2; i >= 0; i--) {
    if (results[i] === last) {
      streak++;
    } else {
      break;
    }
  }

  let predict = "tài";
  let confidence = 50;

  // bệt mạnh => bẻ cầu
  if (streak >= 4) {

    predict = last === "tài"
      ? "xỉu"
      : "tài";

    confidence = 78;

  } else {

    // bên nào ra nhiều gần đây thì ưu tiên bên còn lại
    if (recentTai > recentXiu) {
      predict = "xỉu";
    } else if (recentXiu > recentTai) {
      predict = "tài";
    } else {

      // cân bằng thì theo tổng
      predict = tai > xiu
        ? "xỉu"
        : "tài";
    }

    const diff = Math.abs(recentTai - recentXiu);

    confidence = 60 + diff * 4;

    if (confidence > 90) confidence = 90;
  }

  return {
    predict,
    confidence
  };
}

async function update() {

  try {

    const res = await axios.get(API_URL, {
      timeout: 10000
    });

    let data = res.data;

    // tự nhận dạng dữ liệu
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
      DATA_TEXT = "Không có dữ liệu";
      return;
    }

    // sắp xếp phiên tăng dần
    data.sort((a, b) => {
      return Number(getSession(a)) - Number(getSession(b));
    });

    const latest = data[data.length - 1];

    const phien = getSession(latest);

    const ketQua = getResult(latest);

    // FIX lấy xúc xắc từ api
    const xucXac = getDice(latest);

    const currentSession = Number(phien) + 1;

    const pred = predict(data);

    const cau = buildCau(data);

    DATA_TEXT =
`Id: S2king
Phien: ${phien}
Ket_qua: ${ketQua}
Xuc_xac: ${xucXac}
Phien_hien_tai: ${currentSession}
Du_doan: ${pred.predict}
Do_tin_cay: ${pred.confidence}%
Chuoi_cau: ${cau}`;

  } catch (e) {

    DATA_TEXT = "Lỗi lấy dữ liệu";

  }

}

app.get("/", async (req, res) => {

  res.setHeader(
    "Content-Type",
    "text/plain; charset=utf-8"
  );

  res.send(DATA_TEXT);

});

update();

setInterval(update, 5000);

app.listen(PORT, () => {
  console.log("Server running " + PORT);
});