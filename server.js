const axios = require("axios");

const API_URL = "https://treo-lc79.onrender.com/";
const ID = "S2king";

// ─── Thuật toán dự đoán dựa trên toàn bộ lịch sử ───────────────────────────

function buildChuoiCau(history) {
  // history đã được sort tăng dần (cũ → mới)
  return history
    .map((h) => (h.result === "TAI" ? "T" : "X"))
    .join("");
}

function detectPattern(chuoi) {
  const len = chuoi.length;
  if (len < 4) return null;

  // Kiểm tra nhiều độ dài pattern (2-6) để tìm pattern lặp lại nhiều nhất
  let bestScore = 0;
  let bestNext = null;

  for (let patLen = 2; patLen <= 6; patLen++) {
    const pat = chuoi.slice(-patLen);
    let count = 0;
    let nextAfterPat = [];
    for (let i = 0; i <= len - patLen - 1; i++) {
      if (chuoi.slice(i, i + patLen) === pat) {
        count++;
        nextAfterPat.push(chuoi[i + patLen]);
      }
    }
    if (count > 0) {
      const tCount = nextAfterPat.filter((c) => c === "T").length;
      const xCount = nextAfterPat.filter((c) => c === "X").length;
      const dominantNext = tCount >= xCount ? "T" : "X";
      const score = Math.max(tCount, xCount) * count;
      if (score > bestScore) {
        bestScore = score;
        bestNext = dominantNext;
      }
    }
  }
  return bestNext;
}

function analyzeStreak(chuoi) {
  // Phân tích chuỗi liên tiếp hiện tại
  if (!chuoi.length) return null;
  const last = chuoi[chuoi.length - 1];
  let streak = 1;
  for (let i = chuoi.length - 2; i >= 0; i--) {
    if (chuoi[i] === last) streak++;
    else break;
  }
  // Cầu dài (>= 4) thường gãy → đoán ngược
  if (streak >= 4) return last === "T" ? "X" : "T";
  // Cầu 1-2 → tiếp tục
  if (streak <= 2) return last;
  return null;
}

function countTaiXiu(history) {
  const t = history.filter((h) => h.result === "TAI").length;
  const x = history.filter((h) => h.result === "XIU").length;
  return { t, x };
}

function predict(history) {
  if (!history || history.length === 0) return { du_doan: "tài", do_tin_cay: 50 };

  // Sort cũ → mới
  const sorted = [...history].sort((a, b) => a.phien - b.phien);
  const chuoi = buildChuoiCau(sorted);

  // Phiếu bầu từ 3 thuật toán
  const votes = { T: 0, X: 0 };
  const reasons = [];

  // 1. Pattern matching (trọng số 3)
  const patternNext = detectPattern(chuoi);
  if (patternNext) {
    votes[patternNext] += 3;
    reasons.push(`pattern→${patternNext}`);
  }

  // 2. Streak analysis (trọng số 2)
  const streakNext = analyzeStreak(chuoi);
  if (streakNext) {
    votes[streakNext] += 2;
    reasons.push(`streak→${streakNext}`);
  }

  // 3. Tần suất toàn lịch sử (trọng số 1)
  const { t, x } = countTaiXiu(sorted);
  const freqNext = t < x ? "T" : "X"; // thiên về bên ít hơn để cân bằng
  votes[freqNext] += 1;
  reasons.push(`freq→${freqNext}`);

  // Kết quả
  const totalVotes = votes.T + votes.X;
  const winVotes = Math.max(votes.T, votes.X);
  const winner = votes.T >= votes.X ? "T" : "X";
  const confidence = Math.round((winVotes / totalVotes) * 100);

  return {
    du_doan: winner === "T" ? "tài" : "xỉu",
    do_tin_cay: Math.min(confidence, 95),
  };
}

// ─── Main loop ───────────────────────────────────────────────────────────────

async function run() {
  try {
    const res = await axios.get(API_URL);
    const data = res.data;

    const latest = data.latest;
    const history = data.history; // mảng ~100 phiên gần nhất

    // Sort cũ → mới để lấy chuỗi cầu đúng chiều
    const sorted = [...history].sort((a, b) => a.phien - b.phien);
    const chuoiCau = buildChuoiCau(sorted);

    // Lấy thông tin phiên mới nhất
    const phienHienTai = latest.phien;
    const phienDaDoan = latest.phien;
    const ketQua = latest.result === "TAI" ? "tài" : "xỉu";
    const xucXac = latest.dices.join("-");

    // Dự đoán cho phiên tiếp theo
    const { du_doan, do_tin_cay } = predict(history);

    // In kết quả theo mẫu
    console.log(`Id: ${ID}`);
    console.log(`Phien: ${phienDaDoan}`);
    console.log(`Ket_qua: ${ketQua}`);
    console.log(`Xuc_xac: ${xucXac}`);
    console.log(`Phien_hien_tai: ${phienHienTai + 1}`);
    console.log(`Du_doan: ${du_doan}`);
    console.log(`Do_tin_cay: ${do_tin_cay}%`);
    console.log(`Chuoi_cau: ${chuoiCau.slice(-20)}`); // 20 ký tự gần nhất
  } catch (err) {
    console.error("Lỗi:", err.message);
  }
}

// Chạy ngay lập tức, sau đó cứ 30 giây chạy lại
run();
setInterval(run, 30000);
