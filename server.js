import fetch from 'node-fetch';

// Hàm lấy toàn bộ dữ liệu lịch sử từ API
async function fetchHistory() {
  const response = await fetch('https://treo-lc79.onrender.com/');
  const data = await response.json();

  // API có thể trả về object chứa mảng, hoặc trực tiếp là mảng
  let sessions = Array.isArray(data) ? data : (data.data || data.sessions || data.history || []);
  
  // Sắp xếp tăng dần theo số phiên
  sessions.sort((a, b) => a.phien - b.phien);
  return sessions;
}

// Thuật toán dự đoán dựa trên toàn bộ chuỗi cầu
function predictNext(history) {
  if (history.length === 0) {
    return { du_doan: 'tài', do_tin_cay: 50 };
  }

  // Xây dựng chuỗi cầu T/X
  const chuoi = history.map(item => item.ket_qua.toLowerCase() === 'tài' ? 'T' : 'X').join('');

  // Tìm mẫu cuối cùng có độ dài từ 10 đến 1
  for (let len = Math.min(10, chuoi.length - 1); len >= 1; len--) {
    const pattern = chuoi.slice(-len);
    const nextChars = [];

    // Duyệt toàn bộ chuỗi tìm pattern (trừ lần xuất hiện cuối cùng)
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

    // Nếu tìm thấy ít nhất một lần xuất hiện
    if (nextChars.length > 0) {
      const countT = nextChars.filter(c => c === 'T').length;
      const countX = nextChars.filter(c => c === 'X').length;
      const total = countT + countX;

      if (countT > countX) {
        return { du_doan: 'tài', do_tin_cay: Math.round((countT / total) * 100) };
      } else if (countX > countT) {
        return { du_doan: 'xỉu', do_tin_cay: Math.round((countX / total) * 100) };
      } else {
        // Bằng nhau thì chọn ngẫu nhiên 50%
        return { du_doan: Math.random() < 0.5 ? 'tài' : 'xỉu', do_tin_cay: 50 };
      }
    }
  }

  // Không tìm thấy mẫu nào -> dự đoán 50/50
  return { du_doan: Math.random() < 0.5 ? 'tài' : 'xỉu', do_tin_cay: 50 };
}

// Hàm chính
async function main() {
  try {
    const sessions = await fetchHistory();

    // Phiên cuối cùng đã có kết quả
    const lastSession = sessions[sessions.length - 1];
    const currentPhien = lastSession.phien;
    const currentKetQua = lastSession.ket_qua.toLowerCase();
    const currentXucXac = lastSession.xuc_xac; // Giả sử API trả về dạng "5-5-5"

    // Dự đoán phiên tiếp theo
    const prediction = predictNext(sessions);
    const nextPhien = currentPhien + 1;

    // Tạo chuỗi cầu đầy đủ
    const chuoiCau = sessions.map(s => s.ket_qua.toLowerCase() === 'tài' ? 'T' : 'X').join('');

    // In ra đúng mẫu yêu cầu
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