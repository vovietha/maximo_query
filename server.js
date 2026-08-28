require('dotenv').config();
const express = require('express');
const path = require('path');
const queryEngineService = require('./src/services/queryEngineService');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

// Hàm xử lý chung
const handleExecuteSql = async (req, res) => {
    try {
        const { sql, page } = req.body;

        const config = {
            host: req.headers['x-maximo-host'],
            context: req.headers['x-maximo-context'] || 'maximo',
            username: req.headers['x-maximo-username'],
            password: req.headers['x-maximo-password'],
            safeMode: req.headers['x-safe-mode'] === 'true' // Đọc trạng thái Safe Mode
        };

        const result = await queryEngineService.execute(sql, page, config);
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Đăng ký route khớp cả 2 kiểu gọi từ Frontend
app.post('/api/execute-sql', handleExecuteSql);
app.post('/execute-sql', handleExecuteSql);

app.listen(PORT, () => {
    console.log(`Maximo SQL Console server running on http://localhost:${PORT}`);
});