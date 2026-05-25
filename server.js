import fetch from 'node-fetch';

// Hàm lấy toàn bộ lịch sử và chuẩn hóa dữ liệu
async function fetchHistory() {
  const response = await fetch('https://treo-lc79.onrender.com/');
  const data = await response.json();

  // Lấy mảng phiên từ mọi cấu trúc có thể
  let rawSessions = Array.isArray(data) ? data : (data.data || data.sessions || data.history || []);

  // Chuẩn hóa từng phiên về dạng { phien, ket_qua, xuc_xac }
  const sessions = rawSessions.map(item => {
    // Tìm số phiên (có thể tên là phien, Phien, ID, id...)
    const phien = item.phien || item.Phien || item.ID || item.id;
    // Tìm kết quả (ket_qua, Ket_qua, ketQua, result...)
    let ket_qua = item.ket_qua || item.Ket_qua || item.ketQua || item.result;
    // Tìm xúc xắc (xuc_xac, Xuc_xac, dice...)
    const xuc_xac = item.xuc_xac || item.Xuc_xac || item.dice || item.Dice;

    // Chuẩn hóa kết quả thành chữ thường, bỏ dấu
    if (ket_qua) {
      ket_qua = ket_qua.toLowerCase().replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a')
                             .replace(/[ìíịỉĩ]/g, 'i')
                             .replace(/[ùúụủũưừứựửữ]/g, 'u')
                             .replace(/[èéẹẻẽêềếệểễ]/g, 'e')
                             .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o')
                             .replace(/[ỳýỵỷỹ]/g, 'y')
                             .replace(/đ/g, 'd');
    }
    return { phien, ket_qua, xuc_xac };
  }).filter(s => s.phien && s.ket_qua); // bỏ phiên không hợp lệ

  // Sắp xếp tăng dần theo số phiên
  sessions.sort((a, b) => a.phien - b.phien);
  return sessions;
}

// Thuật toán dự đoán (không thay đổi)
function predictNext(history) {
  if (history.length === 0) {
    return { du_doan: 'tài', do_tin_cay: 50 };
  }

  const chuoi = history.map(item => item.ket_qua === 'tài' ? 'T' : 'X').join('');

  for (let len = Math.min(10, chuoi.length - 1); len >= 1; len--) {
    const pattern = chuoi.slice(-len);
    const nextChars = [];

    let searchIndex = 0;
    while (searchIndex < chuoi.length - len) {
      const foundIndex = chuoi.indexOf(pattern, searchIndex);
      if (foundIndex === -1 || foundIndex >= chuoi.length - len) break;
      const nextIndex = foundIndex + len;
      if (nextIndex < chuoi.length) {
        nextChars.push(chuoi[nextIndex]);
      }
      searchIndex = foundIndex + 1;
    }

    if (nextChars.length > 0) {
      const countT = nextChars.filter(c => c === 'T').length;
      const countX = nextChars.filter(c => c === 'X').length;
      const total = countT + countX;
      if (countT > countX) {
        return { du_doan: 'tài', do_tin_cay: Math.round((countT / total) * 100) };
      } else if (countX > countT) {
        return { du_doan: 'xỉu', do_tin_cay: Math.round((countX / total) * 100) };
      } else {
        return { du_doan: Math.random() < 0.5 ? 'tài' : 'xỉu', do_tin_cay: 50 };
      }
    }
  }
  return { du_doan: Math.random() < 0.5 ? 'tài' : 'xỉu', do_tin_cay: 50 };
}

// Hàm chính
async function main() {
  try {
    const sessions = await fetchHistory();

    if (sessions.length === 0) {
      console.log('Không có dữ liệu lịch sử từ API.');
      return;
    }

    // Phiên cuối cùng đã có kết quả
    const lastSession = sessions[sessions.length - 1];
    const currentPhien = lastSession.phien;
    const currentKetQua = lastSession.ket_qua; // đã là chữ thường "tài"/"xỉu"
    const currentXucXac = lastSession.xuc_xac || '???';

    const prediction = predictNext(sessions);
    const nextPhien = currentPhien + 1;

    const chuoiCau = sessions.map(s => s.ket_qua === 'tài' ? 'T' : 'X').join('');

    // In đúng mẫu
    console.log(`Id: S2king`);
    console.log(`Phien: ${currentPhien}`);
    console.log(`Ket_qua: ${currentKetQua}`);
    console.log(`Xuc_xac: ${currentXucXac}`);
    console.log(`Phien_hien_tai: ${nextPhien}`);
    console.log(`Du_doan: ${prediction.du_doan}`);
    console.log(`Do_tin_cay: ${prediction.do_tin_cay}%`);
    console.log(`Chuoi_cau: ${chuoiCau}`);
  } catch (error) {
    console.error('Lỗi:', error.message);
  }
}

main();