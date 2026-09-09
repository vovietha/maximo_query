const axios = require('axios');

const response = await axios.post(url, paginatedSql, {
    headers: { 'MAXAUTH': maxauth, 'Content-Type': 'text/plain' },
    timeout: 30000,
    maxContentLength: 10 * 1024 * 1024 // Giới hạn Response tối đa 10MB (Tránh Tràn RAM)
});

/**
 * Thực thi SQL với cấu hình bắt buộc từ giao diện UI
 */
exports.execute = async (sqlString, page = 1, config = {}) => {
    const { host, context, username, password, safeMode } = config; // Nhận biến context và safeMode

    if (safeMode) {
        const upper = sqlString.trim().toUpperCase();
        if (!upper.startsWith('SELECT') && !upper.startsWith('WITH') && upper !== 'COMMIT' && upper !== 'ROLLBACK') {
            throw new Error('🛡️ Server đã từ chối lệnh DML do Chế độ Safe Mode đang BẬT.');
        }
    }



    if (!host || !username || !password) {
        throw new Error('Chưa cấu hình thông tin kết nối Maximo (Host, Username, Password). Vui lòng bổ sung thông tin.');
    }

    if (!sqlString || !sqlString.trim()) {
        throw new Error('Câu lệnh SQL không được để trống.');
    }

    const maxauth = Buffer.from(`${username}:${password}`).toString('base64');
    const cleanHost = host.trim().replace(/\/+$/, '');
    const cleanContext = (context || 'maximo').trim().replace(/^\/+|\/+$/g, '');

    let url;
    if (cleanHost.includes('/oslc/script/EXEC_SQL')) {
        url = cleanHost;
    } else {
        try {
            const parsed = new URL(cleanHost);
            if (parsed.pathname && parsed.pathname !== '/') {
                url = `${cleanHost}/oslc/script/EXEC_SQL`;
            } else {
                // Ghép cleanContext động (VD: /max76)
                url = `${cleanHost}/${cleanContext}/oslc/script/EXEC_SQL`;
            }
        } catch (e) {
            url = `${cleanHost}/${cleanContext}/oslc/script/EXEC_SQL`;
        }
    }

    try {
        const response = await axios.post(url, sqlString.trim(), {
            headers: {
                'MAXAUTH': maxauth,
                'Content-Type': 'text/plain'
            },
            timeout: 30000
        });

        const result = response.data;
        if (!result.success) {
            throw new Error(result.error || 'Lỗi thực thi SQL từ Maximo Database');
        }

        if (result.action === 'SELECT') {
            const allRows = result.data || [];
            const pageSize = 50;
            const startIndex = (page - 1) * pageSize;
            const pagedRows = allRows.slice(startIndex, startIndex + pageSize);

            return {
                action: 'SELECT',
                page: Number(page),
                pageSize,
                hasMore: startIndex + pageSize < allRows.length,
                data: pagedRows
            };
        }

        return {
            action: 'EXECUTE',
            success: true,
            message: result.message
        };

    } catch (error) {
        const errDetail = error.response ? JSON.stringify(error.response.data) : error.message;
        throw new Error(errDetail);
    }
};