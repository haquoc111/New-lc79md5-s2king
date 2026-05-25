const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

async function fetchHistory() {
    try {
        const res = await axios.get('https://treo-lc79.onrender.com/');
        return res.data;
    } catch (err) {
        console.error('Lỗi lấy dữ liệu:', err.message);
        return null;
    }
}

function normalize(r) {
    return r === 'TAI' ? 'T' : 'X';
}

function buildFullPattern(history) {
    // Sắp xếp phiên tăng dần (cũ -> mới)
    const sorted = [...history].sort((a, b) => a.phien - b.phien);
    return sorted.map(item => normalize(item.result)).join('');
}

// Thuật toán dự đoán dựa trên mẫu 4 phiên cuối cùng
function predictWithPattern(fullPattern) {
    const len = fullPattern.length;
    if (len < 5) {
        return { pred: 'TAI', conf: '50%' };
    }

    const last4 = fullPattern.slice(-4);
    let positions = [];
    // Tìm tất cả vị trí xuất hiện của last4 trong toàn bộ chuỗi (không tính vị trí cuối cùng)
    for (let i = 0; i <= len - 5; i++) {
        if (fullPattern.slice(i, i + 4) === last4) {
            positions.push(i);
        }
    }

    if (positions.length === 0) {
        // Không tìm thấy mẫu 4 -> dùng mẫu 3
        const last3 = fullPattern.slice(-3);
        for (let i = 0; i <= len - 4; i++) {
            if (fullPattern.slice(i, i + 3) === last3) {
                positions.push(i);
            }
        }
        if (positions.length === 0) {
            // Vẫn không có -> dùng tổng thể
            const tTotal = (fullPattern.match(/T/g) || []).length;
            const xTotal = (fullPattern.match(/X/g) || []).length;
            const pred = tTotal >= xTotal ? 'TAI' : 'XIU';
            const conf = Math.floor((Math.max(tTotal, xTotal) / fullPattern.length) * 100);
            return { pred, conf: `${conf}%` };
        }
    }

    // Lấy kết quả ngay sau mỗi vị trí khớp
    const nextResults = positions.map(pos => fullPattern[pos + 4]);
    const tCount = nextResults.filter(r => r === 'T').length;
    const xCount = nextResults.filter(r => r === 'X').length;
    const total = nextResults.length;

    let pred = tCount >= xCount ? 'TAI' : 'XIU';
    let confidence = Math.floor((Math.max(tCount, xCount) / total) * 100);

    // Điều chỉnh độ tin cậy theo số lần lặp mẫu
    if (total >= 5) confidence = Math.min(confidence + 12, 95);
    else if (total >= 3) confidence = Math.min(confidence + 7, 90);
    else if (total === 2) confidence = Math.min(confidence + 3, 80);

    return { pred, conf: `${confidence}%` };
}

app.get('/', async (req, res) => {
    const data = await fetchHistory();
    if (!data || !data.history || data.history.length === 0) {
        return res.status(500).json({ error: 'Không lấy được lịch sử' });
    }

    const history = data.history;
    const sorted = [...history].sort((a, b) => a.phien - b.phien);
    const latest = sorted[sorted.length - 1];
    const nextPhien = latest.phien + 1;

    const fullPattern = buildFullPattern(history);
    const { pred, conf } = predictWithPattern(fullPattern);

    const response = {
        Id: "S2king",
        Phien: latest.phien,
        Ket_qua: latest.result === 'TAI' ? 'tài' : 'xỉu',
        Xuc_xac: latest.dices.join('-'),
        Phien_hien_tai: nextPhien,
        Du_doan: pred === 'TAI' ? 'tài' : 'xỉu',
        Do_tin_cay: conf,
        Chuoi_cau: fullPattern   // toàn bộ chuỗi cầu từ tất cả phiên
    };

    res.json(response);
});

app.listen(PORT, () => {
    console.log(`Server chạy tại cổng ${PORT}`);
});