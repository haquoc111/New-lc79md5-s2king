const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Helper: gọi API lấy lịch sử
async function fetchHistory() {
    try {
        const res = await axios.get('https://treo-lc79.onrender.com/');
        return res.data;
    } catch (err) {
        console.error('Lỗi khi lấy dữ liệu:', err.message);
        return null;
    }
}

// Chuyển TAI/XIU thành T/X
function toCode(result) {
    return result === 'TAI' ? 'T' : 'X';
}

// Xây dựng chuỗi cầu đầy đủ (theo thứ tự phiên tăng dần)
function buildFullPattern(history) {
    const sorted = [...history].sort((a, b) => a.phien - b.phien);
    return sorted.map(item => toCode(item.result)).join('');
}

// Thuật toán dự đoán chính
function advancedPredict(fullPattern) {
    const len = fullPattern.length;
    if (len < 3) {
        return { prediction: 'TAI', confidence: '50%' };
    }

    // Thử các độ dài mẫu từ dài xuống ngắn (tối đa 6, tối thiểu 2)
    for (let k = Math.min(6, len - 1); k >= 2; k--) {
        const pattern = fullPattern.slice(-k);   // mẫu cần tìm (k ký tự cuối)
        const positions = [];
        
        // Dò tìm tất cả vị trí xuất hiện của pattern (không tính vị trí cuối cùng)
        for (let i = 0; i <= len - k - 1; i++) {
            if (fullPattern.slice(i, i + k) === pattern) {
                positions.push(i);
            }
        }

        // Nếu tìm thấy ít nhất 2 lần xuất hiện (hoặc 1 lần nếu k>=5) thì dùng
        if (positions.length >= 2 || (k >= 5 && positions.length >= 1)) {
            // Lấy kết quả ngay sau mỗi vị trí
            const nextResults = positions.map(pos => fullPattern[pos + k]);
            const tCount = nextResults.filter(r => r === 'T').length;
            const xCount = nextResults.filter(r => r === 'X').length;
            const total = nextResults.length;
            
            let prediction = tCount >= xCount ? 'TAI' : 'XIU';
            let confidence = Math.floor((Math.max(tCount, xCount) / total) * 100);
            
            // Thưởng thêm độ tin cậy nếu mẫu dài hoặc xuất hiện nhiều lần
            let bonus = 0;
            if (k >= 5) bonus = 15;
            else if (k >= 4) bonus = 10;
            else if (k >= 3 && positions.length >= 3) bonus = 5;
            confidence = Math.min(confidence + bonus, 95);
            
            return { prediction, confidence: `${confidence}%` };
        }
    }
    
    // Nếu không tìm thấy mẫu lặp -> dùng cửa sổ 5 phiên gần nhất (xu hướng ngắn)
    const windowSize = Math.min(5, len);
    const recentWindow = fullPattern.slice(-windowSize);
    const tRecent = (recentWindow.match(/T/g) || []).length;
    const xRecent = (recentWindow.match(/X/g) || []).length;
    
    if (tRecent !== xRecent) {
        let prediction = tRecent > xRecent ? 'TAI' : 'XIU';
        let confidence = Math.floor((Math.max(tRecent, xRecent) / windowSize) * 100);
        // Nếu cửa sổ đầy 5 mà có tỷ lệ áp đảo (4-1 hoặc 5-0) thì tăng độ tin cậy
        if (windowSize === 5 && (tRecent === 4 || xRecent === 4)) confidence += 10;
        if (windowSize === 5 && (tRecent === 5 || xRecent === 5)) confidence += 15;
        confidence = Math.min(confidence, 90);
        return { prediction, confidence: `${confidence}%` };
    }
    
    // Cuối cùng: dùng xác suất tổng thể
    const totalT = (fullPattern.match(/T/g) || []).length;
    const totalX = (fullPattern.match(/X/g) || []).length;
    let prediction = totalT >= totalX ? 'TAI' : 'XIU';
    let confidence = Math.floor((Math.max(totalT, totalX) / fullPattern.length) * 100);
    confidence = Math.min(confidence, 75);  // Dự đoán tổng thể thường kém tin cậy hơn
    return { prediction, confidence: `${confidence}%` };
}

// Endpoint chính
app.get('/', async (req, res) => {
    const data = await fetchHistory();
    if (!data || !data.history || data.history.length < 2) {
        return res.status(500).json({ error: 'Không đủ dữ liệu lịch sử' });
    }

    const history = data.history;
    const sorted = [...history].sort((a, b) => a.phien - b.phien);
    const latest = sorted[sorted.length - 1];
    const nextPhien = latest.phien + 1;

    const fullPattern = buildFullPattern(history);
    const { prediction, confidence } = advancedPredict(fullPattern);

    const response = {
        Id: "S2king",
        Phien: latest.phien,
        Ket_qua: latest.result === 'TAI' ? 'tài' : 'xỉu',
        Xuc_xac: latest.dices.join('-'),
        Phien_hien_tai: nextPhien,
        Du_doan: prediction === 'TAI' ? 'tài' : 'xỉu',
        Do_tin_cay: confidence,
        Chuoi_cau: fullPattern   // đầy đủ, không cắt
    };

    res.json(response);
});

app.listen(PORT, () => {
    console.log(`✅ Server mới chạy tại cổng ${PORT}`);
});