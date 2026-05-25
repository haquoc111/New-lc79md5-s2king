const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Hàm lấy dữ liệu lịch sử từ API
async function fetchHistoryData() {
    try {
        const response = await axios.get('https://treo-lc79.onrender.com/');
        return response.data;
    } catch (error) {
        console.error('Lỗi khi gọi API:', error.message);
        return null;
    }
}

// Hàm chuẩn hóa kết quả 'TAI'/'XIU' thành 'T'/'X'
function normalizeResult(result) {
    return result === 'TAI' ? 'T' : 'X';
}

// Hàm tạo chuỗi cầu (pattern string) từ lịch sử kết quả
function getPatternString(history) {
    return history.map(item => normalizeResult(item.result)).join('');
}

// Hàm dự đoán dựa trên chuỗi lịch sử
function predictOutcome(history) {
    if (history.length < 10) {
        return { prediction: 'TAI', confidence: '50%' };
    }

    const patternString = getPatternString(history);
    const lastPattern = patternString.slice(-4);

    const predictions = [];
    let matchCount = 0;

    for (let i = 0; i <= patternString.length - 5; i++) {
        const currentPattern = patternString.slice(i, i + 4);
        const nextResult = patternString[i + 4];

        if (currentPattern === lastPattern) {
            predictions.push(nextResult);
            matchCount++;
        }
    }

    if (predictions.length === 0) {
        const recentResults = history.slice(-5);
        const tCount = recentResults.filter(r => r.result === 'TAI').length;
        const xCount = recentResults.filter(r => r.result === 'XIU').length;

        if (tCount > xCount) {
            return { prediction: 'TAI', confidence: `${Math.floor(tCount / 5 * 100)}%` };
        } else if (xCount > tCount) {
            return { prediction: 'XIU', confidence: `${Math.floor(xCount / 5 * 100)}%` };
        } else {
            return { prediction: 'TAI', confidence: '50%' };
        }
    }

    const tPredictions = predictions.filter(p => p === 'T').length;
    const xPredictions = predictions.filter(p => p === 'X').length;
    const total = predictions.length;

    let prediction = tPredictions >= xPredictions ? 'TAI' : 'XIU';
    let confidence = Math.floor(Math.max(tPredictions, xPredictions) / total * 100);

    if (matchCount > 10) confidence = Math.min(confidence + 10, 95);
    else if (matchCount > 5) confidence = Math.min(confidence + 5, 90);

    return { prediction, confidence: `${confidence}%` };
}

// Endpoint chính trả về kết quả theo đúng format yêu cầu
app.get('/', async (req, res) => {
    const data = await fetchHistoryData();

    if (!data || !data.history || data.history.length === 0) {
        return res.status(500).json({ error: 'Không thể lấy dữ liệu lịch sử' });
    }

    const history = data.history;
    const latestSession = history[0];
    const currentPhien = latestSession.phien + 1;

    const { prediction, confidence } = predictOutcome(history);
    const patternString = getPatternString(history);

    const response = {
        Id: "S2king",
        Phien: latestSession.phien,
        Ket_qua: latestSession.result,
        Xuc_xac: latestSession.dices.join('-'),
        Phien_hien_tai: currentPhien,
        Du_doan: prediction === 'TAI' ? 'tài' : 'xỉu',
        Do_tin_cay: confidence,
        Chuoi_cau: patternString.slice(-Math.min(patternString.length, 20))
    };

    res.json(response);
});

app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});