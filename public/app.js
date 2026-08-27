let queryResultData = [];
let isJsonView = false;
let currentPage = 1;
let currentQuery = '';
let editor;

document.addEventListener('DOMContentLoaded', () => {
    // Khởi tạo CodeMirror IDE
    editor = CodeMirror.fromTextArea(document.getElementById('sql-input'), {
        mode: 'text/x-sql',
        theme: 'dracula',
        lineNumbers: true,
        indentWithTabs: true,
        smartIndent: true,
        lineWrapping: true,
        extraKeys: {
            "Ctrl-Space": "autocomplete",
            "Ctrl-Enter": () => { currentPage = 1; runQuery(); }
        },
        hintOptions: {
            tables: {
                workorder: ["wonum", "description", "status", "siteid", "worktype", "assetnum", "location", "reportdate", "historyflag"],
                asset: ["assetnum", "description", "siteid", "status", "location"],
                location: ["location", "description", "siteid", "status"],
                person: ["personid", "firstname", "lastname", "displayname"]
            }
        }
    });

    // Tự động kích hoạt Autocomplete khi gõ ký tự
    editor.on('inputRead', (cm, change) => {
        if (change.origin !== '+delete' && /[a-zA-Z._]/.test(change.text[0])) {
            CodeMirror.commands.autocomplete(cm, null, { completeSingle: false });
        }
    });

    loadHistory();

    document.getElementById('btn-execute').addEventListener('click', () => {
        currentPage = 1;
        runQuery();
    });

    document.getElementById('btn-prev-page').addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            runQuery();
        }
    });

    document.getElementById('btn-next-page').addEventListener('click', () => {
        currentPage++;
        runQuery();
    });

    document.getElementById('btn-toggle-view').addEventListener('click', toggleView);
    document.getElementById('btn-export').addEventListener('click', exportExcel);
});

async function runQuery() {
    const query = editor.getValue().trim();
    const statusEl = document.getElementById('status-bar');
    const paginationBar = document.getElementById('pagination-bar');
    
    if (!query) return alert('Vui lòng nhập câu lệnh SQL!');

    currentQuery = query;
    statusEl.style.color = '#d7ba7d';
    statusEl.innerText = `Đang tải dữ liệu trang ${currentPage}...`;

    try {
        const response = await fetch('/api/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: currentQuery, page: currentPage })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            statusEl.style.color = '#f48771';
            statusEl.innerText = `Lỗi: ${data.error}`;
            paginationBar.style.display = 'none';
            return;
        }

        const resObj = data.result;
        statusEl.style.color = '#89d185';

        if (resObj.action === 'SELECT') {
            queryResultData = resObj.data;
            statusEl.innerText = `Thành công (SELECT)! Hiển thị ${queryResultData.length} bản ghi của Trang ${resObj.page}.`;
            
            paginationBar.style.display = 'flex';
            document.getElementById('page-info').innerText = `Trang ${resObj.page}`;
            document.getElementById('btn-prev-page').disabled = (resObj.page <= 1);
            document.getElementById('btn-next-page').disabled = !resObj.hasMore;
        } else {
            queryResultData = resObj;
            paginationBar.style.display = 'none';
            statusEl.innerText = `Thành công (${resObj.action || 'OK'})! ${resObj.message || ''}`;
        }

        saveHistory(query);
        renderOutput();
    } catch (error) {
        statusEl.style.color = '#f48771';
        statusEl.innerText = `Lỗi hệ thống: ${error.message}`;
        paginationBar.style.display = 'none';
    }
}

function renderOutput() {
    document.getElementById('json-output').textContent = JSON.stringify(queryResultData, null, 2);

    const thead = document.getElementById('table-head');
    const tbody = document.getElementById('table-body');
    thead.innerHTML = '';
    tbody.innerHTML = '';

    const listData = Array.isArray(queryResultData) ? queryResultData : (queryResultData.record ? [queryResultData.record] : [queryResultData]);

    if (listData.length === 0) {
        tbody.innerHTML = '<tr><td>Không có dữ liệu trả về.</td></tr>';
        return;
    }

    const headers = Object.keys(listData[0]);
    
    // Thêm cột STT ở đầu bảng
    thead.innerHTML = `<tr><th class="stt-col">STT</th>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
    
    const startIndex = (currentPage - 1) * 100;
    tbody.innerHTML = listData.map((row, index) => {
        const stt = startIndex + index + 1;
        const cells = headers.map(h => `<td>${row[h] !== undefined ? (typeof row[h] === 'object' ? JSON.stringify(row[h]) : row[h]) : ''}</td>`).join('');
        return `<tr><td class="stt-col">${stt}</td>${cells}</tr>`;
    }).join('');
}

function toggleView() {
    isJsonView = !isJsonView;
    document.getElementById('view-table').style.display = isJsonView ? 'none' : 'block';
    document.getElementById('view-json').style.display = isJsonView ? 'block' : 'none';
}

function exportExcel() {
    const dataToExport = Array.isArray(queryResultData) ? queryResultData : [queryResultData];
    if (dataToExport.length === 0) return alert('Không có dữ liệu để xuất Excel!');

    // Bổ sung STT vào file Excel xuất ra
    const startIndex = (currentPage - 1) * 100;
    const mappedData = dataToExport.map((row, index) => ({
        'STT': startIndex + index + 1,
        ...row
    }));

    const worksheet = XLSX.utils.json_to_sheet(mappedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Query_Result');
    XLSX.writeFile(workbook, `Maximo_Query_Page${currentPage}_${Date.now()}.xlsx`);
}

function saveHistory(query) {
    let history = JSON.parse(localStorage.getItem('maximo_sql_history') || '[]');
    history = [query, ...history.filter(q => q !== query)].slice(0, 20);
    localStorage.setItem('maximo_sql_history', JSON.stringify(history));
    loadHistory();
}

function loadHistory() {
    const historyList = document.getElementById('history-list');
    const history = JSON.parse(localStorage.getItem('maximo_sql_history') || '[]');
    if (history.length === 0) {
        historyList.innerHTML = '<div style="font-size:12px; color:#888;">Chưa có lịch sử query.</div>';
        return;
    }
    historyList.innerHTML = history.map(q => `
        <div class="history-item" onclick="setQuery(\`${q.replace(/`/g, '\\`')}\`)">${q}</div>
    `).join('');
}

function setQuery(q) {
    if (editor) {
        editor.setValue(q);
    }
}