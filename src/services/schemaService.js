const axios = require('axios');

exports.getSchema = async (config = {}) => {
    const { host, context, username, password } = config;

    if (!host || !username || !password) {
        throw new Error('Thiếu thông tin kết nối Maximo.');
    }

    const maxauth = Buffer.from(`${username}:${password}`).toString('base64');
    const cleanHost = host.trim().replace(/\/+$/, '');
    const cleanContext = (context || 'maximo').trim().replace(/^\/+|\/+$/g, '');
    const url = `${cleanHost}/${cleanContext}/oslc/script/EXEC_SQL`;

    const schemaSql = "SELECT LOWER(objectname) AS tablename, LOWER(attributename) AS colname FROM maxattribute WHERE persistent = 1 ORDER BY objectname, attributename";

    try {
        const response = await axios.post(url, schemaSql, {
            headers: { 'MAXAUTH': maxauth, 'Content-Type': 'text/plain' },
            timeout: 60000,
            maxContentLength: 20 * 1024 * 1024
        });

        const result = response.data;
        if (!result.success || !Array.isArray(result.data)) {
            throw new Error(result.error || 'Không thể lấy dữ liệu CSDL Schema.');
        }

        // Biến đổi mảng phẳng thành Schema Map tại Backend
        const schemaMap = {};
        result.data.forEach(row => {
            const table = row.tablename;
            const col = row.colname;
            if (table && col) {
                if (!schemaMap[table]) schemaMap[table] = [];
                schemaMap[table].push(col);
            }
        });

        return schemaMap;

    } catch (error) {
        const errDetail = error.response ? JSON.stringify(error.response.data) : error.message;
        throw new Error(errDetail);
    }
};