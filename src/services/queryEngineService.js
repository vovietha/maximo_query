const axios = require('axios');

// Hàm tự động bọc câu lệnh SQL bằng cú pháp phân trang Oracle
function buildPaginatedSql(sqlString, page = 1, pageSize = 50) {
    const cleanSql = sqlString.trim().replace(/;+$/, '');
    const upper = cleanSql.toUpperCase();

    // Nếu không phải SELECT/WITH thì giữ nguyên câu lệnh gốc
    if (!upper.startsWith('SELECT') && !upper.startsWith('WITH')) {
        return cleanSql;
    }

    const startRow = (page - 1) * pageSize + 1;
    const endRow = page * pageSize + 1; // Lấy dư 1 dòng để kiểm tra hasMore

    return `
        SELECT * FROM (
            SELECT src_tbl.*, ROWNUM AS oracle_rn FROM (
                ${cleanSql}
            ) src_tbl WHERE ROWNUM <= ${endRow}
        ) WHERE oracle_rn >= ${startRow}
    `;
}

/**
 * Thực thi SQL với cấu hình bắt buộc từ giao diện UI
 */
exports.execute = async (sqlString, page = 1, config = {}) => {
    const { host, context, username, password, safeMode } = config;
    const pageSize = 50;

    if (safeMode) {
        const upper = sqlString.trim().toUpperCase();
        if (!upper.startsWith('SELECT') && !upper.startsWith('WITH') && upper !== 'COMMIT' && upper !== 'ROLLBACK') {
            throw new Error('Chế độ Safe Mode đang BẬT. Không thể thực thi câu lệnh DML!');
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
    const url = `${cleanHost}/${cleanContext}/oslc/script/EXEC_SQL`;

    // 1. Biến đổi câu SQL gốc thành câu SQL có phân trang Oracle
    const paginatedSql = buildPaginatedSql(sqlString, page, pageSize);

    try {
        const response = await axios.post(url, paginatedSql, {
            headers: {
                'MAXAUTH': maxauth,
                'Content-Type': 'text/plain'
            },
            timeout: 30000,
            maxContentLength: 10 * 1024 * 1024 // Giới hạn Payload 10MB
        });

        const result = response.data;
        if (!result.success) {
            throw new Error(result.error || 'Lỗi thực thi SQL từ Maximo Database');
        }

        if (result.action === 'SELECT') {
            let rows = result.data || [];
            
            // Xóa cột giả 'ORACLE_RN' sinh ra khi phân trang
            rows = rows.map(row => {
                const { oracle_rn, ORACLE_RN, ...cleanRow } = row;
                return cleanRow;
            });

            // Kiểm tra còn trang kế tiếp dựa trên bản ghi thứ 51
            const hasMore = rows.length > pageSize;
            if (hasMore) {
                rows.pop(); // Loại bỏ bản ghi thứ 51
            }

            return {
                action: 'SELECT',
                page: Number(page),
                pageSize,
                hasMore,
                data: rows
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