// const axios = require('axios');
// const { MAXIMO_HOST, MAXAUTH } = require('../config/maximo');

// // Ánh xạ tên bảng SQL sang Object Structure OSLC trong Maximo
// const OBJECT_MAP = {
//     'workorder': 'mxapiwo',
//     'asset': 'mxapiasset',
//     'location': 'mxapilocations',
//     'person': 'mxapiperson',
//     'inventory': 'mxapiinventory',
//     'invtrans': 'mxapiinvtrans',
//     'item': 'mxapiitem'
// };

// /**
//  * 1. Tự động xóa ghi chú SQL (Single-line '--' và Multi-line '/* ... * /')
//  */
// function stripSqlComments(sql) {
//     if (!sql) return '';
//     return sql
//         .replace(/\/\*[\s\S]*?\*\//g, '')  // Xóa comment dạng /* ... */
//         .replace(/--.*$/gm, '')              // Xóa comment dạng -- ...
//         .replace(/\s+/g, ' ')               // Nén khoảng trắng thừa thành 1 dấu cách
//         .trim();
// }

// /**
//  * 2. Chuẩn hóa mệnh đề WHERE cho Maximo OSLC REST API
//  */
// function formatOslcWhere(rawWhere) {
//     if (!rawWhere) return '';

//     return rawWhere
//         .trim()
//         .replace(/'([^']*)'/g, '"$1"')                       // Dấu nháy đơn 'val' -> nháy kép "val"
//         .replace(/\s*(=|!=|>|<|>=|<=)\s*/g, '$1')             // Xóa khoảng trắng quanh toán tử
//         .replace(/\s+/g, ' ');
// }

// /**
//  * 3. Lọc bỏ thuộc tính metadata hệ thống của OSLC
//  */
// function cleanOslcData(items) {
//     return items.map(item => {
//         const cleaned = {};
//         Object.keys(item).forEach(k => {
//             if (!k.startsWith('rdf:') && !k.startsWith('spi:') && k !== 'href') {
//                 cleaned[k] = item[k];
//             }
//         });
//         return cleaned;
//     });
// }

// /**
//  * 4. Trích xuất tên bảng chính từ câu lệnh SQL (kể cả câu lệnh có WITH / Subquery)
//  */
// function extractTableName(cleanSql) {
//     const fromMatch = cleanSql.match(/FROM\s+([a-zA-Z0-9_]+)/i);
//     if (fromMatch && fromMatch[1]) {
//         return fromMatch[1].toLowerCase();
//     }
//     return 'workorder';
// }

// /**
//  * 5. Trích xuất danh sách cột sạch (loại bỏ Alias AS, NVL, ROW_NUMBER,...)
//  */
// function extractCleanSelectFields(cleanSql) {
//     const selectMatch = cleanSql.match(/SELECT\s+(.+?)\s+FROM/i);
//     if (!selectMatch || !selectMatch[1]) return '*';

//     const rawFields = selectMatch[1];
//     if (rawFields.includes('*')) return '*';

//     const fields = rawFields.split(',').map(f => {
//         let field = f.trim();
//         if (/AS\s+/i.test(field)) {
//             field = field.split(/AS\s+/i)[0].trim();
//         }
//         const funcMatch = field.match(/\(([^,)]+)/);
//         if (funcMatch && funcMatch[1]) {
//             field = funcMatch[1].trim();
//         }
//         return field.replace(/[^a-zA-Z0-9_]/g, '');
//     }).filter(f => f.length > 0);

//     return fields.length > 0 ? fields.join(',') : '*';
// }

// /**
//  * 6. Trích xuất mệnh đề WHERE từ câu lệnh SQL
//  */
// function extractWhereClause(cleanSql) {
//     const whereMatch = cleanSql.match(/WHERE\s+(.+)$/i);
//     if (!whereMatch || !whereMatch[1]) return '';

//     let whereStr = whereMatch[1];
//     whereStr = whereStr.split(/ORDER\s+BY|GROUP\s+BY/i)[0].trim();
//     return whereStr;
// }

// /**
//  * Tìm URI (href) bản ghi để phục vụ UPDATE / DELETE
//  */
// async function findResource(objectName, oslcWhere) {
//     const res = await axios.get(`${MAXIMO_HOST}/maximo/oslc/os/${objectName}`, {
//         headers: { 'MAXAUTH': MAXAUTH, 'lean': '1' },
//         params: { 'oslc.select': 'href,siteid', 'oslc.where': oslcWhere },
//         timeout: 10000
//     });

//     const items = res.data.member || res.data['rdfs:member'] || [];
//     if (items.length === 0) {
//         throw new Error(`Không tìm thấy bản ghi phù hợp với điều kiện: WHERE ${oslcWhere}`);
//     }

//     const item = items[0];
//     const rawHref = item.href || item['rdf:about'];
//     const siteid = item.siteid || item['spi:siteid'] || 'BEDFORD';

//     const targetUrl = new URL(rawHref, MAXIMO_HOST);
//     const baseHostUrl = new URL(MAXIMO_HOST);
//     targetUrl.protocol = baseHostUrl.protocol;
//     targetUrl.hostname = baseHostUrl.hostname;
//     targetUrl.port = baseHostUrl.port;

//     return { hrefUrl: targetUrl.toString(), siteid };
// }

// /**
//  * XỬ LÝ CÂU LỆNH SELECT (Bao gồm hỗ trợ WITH / CTE / Subquery)
//  */
// async function handleSelect(cleanSql, page = 1) {
//     const tableName = extractTableName(cleanSql);
//     const objectName = OBJECT_MAP[tableName] || tableName;

//     const fields = extractCleanSelectFields(cleanSql);
//     const rawWhere = extractWhereClause(cleanSql);
//     const oslcWhere = formatOslcWhere(rawWhere);

//     const pageSize = 100;
//     const params = {
//         'oslc.select': fields,
//         'oslc.pageSize': pageSize.toString(),
//         'pageno': page.toString(),
//         'lean': '1'
//     };
//     if (oslcWhere) params['oslc.where'] = oslcWhere;

//     const res = await axios.get(`${MAXIMO_HOST}/maximo/oslc/os/${objectName}`, {
//         headers: { 'MAXAUTH': MAXAUTH, 'Accept': 'application/json' },
//         params,
//         timeout: 15000
//     });

//     const items = res.data.member || res.data['rdfs:member'] || [];
//     return {
//         action: 'SELECT',
//         page: Number(page),
//         pageSize,
//         hasMore: items.length === pageSize,
//         data: cleanOslcData(items)
//     };
// }

// /**
//  * XỬ LÝ CÂU LỆNH INSERT
//  */
// async function handleInsert(cleanSql) {
//     const regex = /^INSERT\s+INTO\s+([a-zA-Z0-9_]+)\s*\((.+?)\)\s*VALUES\s*\((.+?)\)$/i;
//     const match = cleanSql.match(regex);
//     if (!match) throw new Error("Cú pháp INSERT không hợp lệ.");

//     const [, rawTable, rawCols, rawVals] = match;
//     const objectName = OBJECT_MAP[rawTable.toLowerCase()] || rawTable.toLowerCase();

//     const cols = rawCols.split(',').map(c => c.trim());
//     const vals = rawVals.split(',').map(v => v.trim().replace(/^'|'$/g, ''));

//     if (cols.length !== vals.length) throw new Error("Số lượng cột và giá trị không tương thích.");

//     const payload = {};
//     cols.forEach((col, idx) => {
//         payload[col] = vals[idx];
//         payload[`spi:${col}`] = vals[idx];
//     });

//     const siteid = payload.siteid || payload['spi:siteid'] || 'BEDFORD';

//     const res = await axios.post(`${MAXIMO_HOST}/maximo/oslc/os/${objectName}`, payload, {
//         headers: {
//             'MAXAUTH': MAXAUTH,
//             'properties': '*',
//             'siteid': siteid,
//             'lean': '1',
//             'Content-Type': 'application/json'
//         },
//         timeout: 10000
//     });

//     return { action: 'INSERT', success: true, record: cleanOslcData([res.data])[0] };
// }

// /**
//  * XỬ LÝ CÂU LỆNH UPDATE
//  */
// async function handleUpdate(cleanSql) {
//     const regex = /^UPDATE\s+([a-zA-Z0-9_]+)\s+SET\s+(.+?)\s+WHERE\s+(.+)$/i;
//     const match = cleanSql.match(regex);
//     if (!match) throw new Error("Cú pháp UPDATE không hợp lệ.");

//     const [, rawTable, rawSet, rawWhere] = match;
//     const objectName = OBJECT_MAP[rawTable.toLowerCase()] || rawTable.toLowerCase();
//     const oslcWhere = formatOslcWhere(rawWhere);

//     const target = await findResource(objectName, oslcWhere);

//     const payload = {};
//     rawSet.split(',').forEach(pair => {
//         const [col, val] = pair.split('=').map(s => s.trim());
//         const cleanVal = val.replace(/^'|'$/g, '');
//         payload[col] = cleanVal;
//         payload[`spi:${col}`] = cleanVal;
//     });

//     await axios.post(target.hrefUrl, payload, {
//         headers: {
//             'MAXAUTH': MAXAUTH,
//             'x-method-override': 'PATCH',
//             'patchtype': 'MERGE',
//             'properties': '*',
//             'siteid': target.siteid,
//             'lean': '1',
//             'Content-Type': 'application/json'
//         },
//         timeout: 10000
//     });

//     return { action: 'UPDATE', success: true, message: `Cập nhật thành công bản ghi.`, updatedFields: payload };
// }

// /**
//  * XỬ LÝ CÂU LỆNH DELETE
//  */
// async function handleDelete(cleanSql) {
//     const regex = /^DELETE\s+FROM\s+([a-zA-Z0-9_]+)\s+WHERE\s+(.+)$/i;
//     const match = cleanSql.match(regex);
//     if (!match) throw new Error("Cú pháp DELETE không hợp lệ.");

//     const [, rawTable, rawWhere] = match;
//     const objectName = OBJECT_MAP[rawTable.toLowerCase()] || rawTable.toLowerCase();
//     const oslcWhere = formatOslcWhere(rawWhere);

//     const target = await findResource(objectName, oslcWhere);

//     await axios.delete(target.hrefUrl, {
//         headers: { 'MAXAUTH': MAXAUTH, 'siteid': target.siteid },
//         timeout: 10000
//     });

//     return { action: 'DELETE', success: true, message: `Đã xóa bản ghi thành công.` };
// }

// /**
//  * ĐIỂM VÀO CHÍNH (MAIN EXECUTE ENTRY POINT)
//  */
// exports.execute = async (sqlString, page = 1) => {
//     if (!sqlString || !sqlString.trim()) {
//         throw new Error('Câu lệnh SQL không được để trống.');
//     }

//     // 1. Tự động loại bỏ tất cả comment SQL trước khi xác định lệnh
//     const cleanSql = stripSqlComments(sqlString);

//     if (!cleanSql) {
//         throw new Error('Câu lệnh không hợp lệ hoặc chỉ chứa ghi chú (comments).');
//     }

//     // 2. Xác định loại lệnh chính (Kể cả khi bắt đầu bằng WITH)
//     let command = cleanSql.split(/\s+/)[0].toUpperCase();
//     if (command === 'WITH' || cleanSql.toUpperCase().includes('SELECT')) {
//         command = 'SELECT';
//     }

//     switch (command) {
//         case 'SELECT':
//             return await handleSelect(cleanSql, page);
//         case 'INSERT':
//             return await handleInsert(cleanSql);
//         case 'UPDATE':
//             return await handleUpdate(cleanSql);
//         case 'DELETE':
//             return await handleDelete(cleanSql);
//         default:
//             throw new Error(`Cú pháp '${command}' không được hỗ trợ. Chỉ hỗ trợ SELECT, INSERT, UPDATE, DELETE.`);
//     }
// };


//cach 2
// const axios = require('axios');
// const { MAXIMO_HOST, MAXAUTH } = require('../config/maximo');

// /**
//  * Gửi câu lệnh SQL nguyên bản tới Maximo Automation Script
//  */
// exports.execute = async (sqlString, page = 1) => {
//     if (!sqlString || !sqlString.trim()) {
//         throw new Error('Câu lệnh SQL không được để trống.');
//     }

//     const url = `${MAXIMO_HOST}/maximo/oslc/script/EXEC_SQL`;

//     try {
//         const response = await axios.post(url, sqlString.trim(), {
//             headers: {
//                 'MAXAUTH': MAXAUTH,
//                 'Content-Type': 'text/plain'
//             },
//             timeout: 30000 // Timeout 30s cho các câu query phức tạp
//         });

//         const result = response.data;

//         if (!result.success) {
//             throw new Error(result.error || 'Lỗi thực thi SQL từ Maximo Database');
//         }

//         // Xử lý phân trang phía Node.js cho kết quả trả về từ SELECT / WITH
//         if (result.action === 'SELECT') {
//             const allRows = result.data || [];
//             const pageSize = 100;
//             const startIndex = (page - 1) * pageSize;
//             const pagedRows = allRows.slice(startIndex, startIndex + pageSize);

//             return {
//                 action: 'SELECT',
//                 page: Number(page),
//                 pageSize,
//                 hasMore: startIndex + pageSize < allRows.length,
//                 data: pagedRows
//             };
//         }

//         return {
//             action: 'EXECUTE',
//             success: true,
//             message: result.message
//         };

//     } catch (error) {
//         const errDetail = error.response ? JSON.stringify(error.response.data) : error.message;
//         throw new Error(errDetail);
//     }
// };


//cach 3
const axios = require('axios');

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