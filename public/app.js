let editor;
let currentData = [];
let filteredData = [];
let viewMode = 'TABLE';
let history = [];
let currentPage = 1;
let hasMore = false;

document.addEventListener('DOMContentLoaded', () => {
    // Khởi tạo CodeMirror IDE
    editor = CodeMirror.fromTextArea(document.getElementById('sqlEditor'), {
        mode: 'text/x-sql',
        theme: 'dracula',
        lineNumbers: true,
        indentWithTabs: true,
        smartIndent: true,
        lineWrapping: true,
        extraKeys: {
            "Ctrl-Space": "autocomplete",
            "Ctrl-Enter": () => { runQuery(1); },
            
            // Sửa hàm Toggle Comment hoạt động chuẩn cho SQL
            "Ctrl-/": (cm) => {
                cm.toggleComment({ lineComment: "-- " });
            },
            "Cmd-/": (cm) => {
                cm.toggleComment({ lineComment: "-- " });
            }
        },
        hintOptions: {
            tables: {
                workorder: ["wonum", "description", "status", "siteid", "worktype", "assetnum", "location", "reportdate", "historyflag"],
                asset: ["assetnum", "description", "siteid", "status", "location"],
                locations: ["location", "description", "siteid", "status", "type"],
                person: ["personid", "firstname", "lastname", "displayname"],
                inventory: ["itemnum", "location", "siteid", "issueunit"],
                invtrans: ["itemnum", "storeloc", "siteid", "transdate", "quantity", "transtype", "curbal"]
            }
        }
    });

    // Tự động gợi ý từ khóa khi gõ chữ
    editor.on("inputRead", (cm, change) => {
        if (change.origin !== '+delete' && /[a-zA-Z._]/.test(change.text[0])) {
            CodeMirror.commands.autocomplete(cm, null, { completeSingle: false });
        }
    });

    // Theo dõi thay đổi kích thước khung gõ SQL để tự refresh dòng
    const resizer = new ResizeObserver(() => {
        if (editor) editor.refresh();
    });
    resizer.observe(document.querySelector('.editor-container'));

    // Gán câu lệnh SQL mặc định ban đầu
    editor.setValue("SELECT wonum, description, status, siteid FROM workorder WHERE siteid='BEDFORD'");
    loadHistory();
});

// Modal Controls
function openConfigModal() {
    document.getElementById('cfgHost').value = localStorage.getItem('maximo_host') || '';
    document.getElementById('cfgUser').value = localStorage.getItem('maximo_user') || '';
    document.getElementById('cfgPass').value = localStorage.getItem('maximo_pass') || '';
    document.getElementById('configModal').style.display = 'flex';
}

function closeConfigModal() {
    document.getElementById('configModal').style.display = 'none';
}

function saveConfig() {
    const host = document.getElementById('cfgHost').value.trim();
    const user = document.getElementById('cfgUser').value.trim();
    const pass = document.getElementById('cfgPass').value.trim();

    if (!host || !user || !pass) {
        alert('Vui lòng nhập đầy đủ thông tin Host, Username và Password!');
        return;
    }

    localStorage.setItem('maximo_host', host);
    localStorage.setItem('maximo_user', user);
    localStorage.setItem('maximo_pass', pass);
    alert('Đã lưu cấu hình kết nối thành công!');
    closeConfigModal();
}

// Phân trang
function changePage(delta) {
    const targetPage = currentPage + delta;
    if (targetPage >= 1) {
        runQuery(targetPage);
    }
}

function updatePaginationButtons() {
    document.getElementById('pageLabel').innerText = `Trang ${currentPage}`;
    document.getElementById('btnPrev').disabled = (currentPage <= 1);
    document.getElementById('btnNext').disabled = !hasMore;
}

// Thực thi SQL (Ưu tiên đoạn văn bản đang bôi đen)
async function runQuery(page = 1) {
    currentPage = page;

    const selectedSql = editor.getSelection().trim();
    const sql = selectedSql || editor.getValue().trim();

    const msgBox = document.getElementById('msgBox');
    const resContainer = document.getElementById('resultsContainer');

    msgBox.className = 'msg-box';
    msgBox.style.display = 'none';
    document.getElementById('filterInput').value = '';

    const host = localStorage.getItem('maximo_host');
    const user = localStorage.getItem('maximo_user');
    const pass = localStorage.getItem('maximo_pass');

    if (!host || !user || !pass) {
        openConfigModal();
        msgBox.className = 'msg-box error';
        msgBox.style.display = 'block';
        msgBox.innerText = 'Lỗi: Chưa cấu hình kết nối Maximo. Vui lòng nhập thông tin trong Popup.';
        return;
    }

    resContainer.innerHTML = `<div style="color: #61dafb; text-align: center; margin-top: 50px;">Đang thực thi câu lệnh SQL...</div>`;

    try {
        const response = await fetch('/api/execute-sql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-maximo-host': host,
                'x-maximo-username': user,
                'x-maximo-password': pass
            },
            body: JSON.stringify({ sql, page: currentPage })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Lỗi không xác định từ Server');
        }

        addHistory(sql);

        if (result.action === 'SELECT') {
            currentData = result.data || [];
            hasMore = result.hasMore || false;
            updatePaginationButtons();
            renderResults();
        } else {
            currentData = [];
            filteredData = [];
            hasMore = false;
            updatePaginationButtons();
            resContainer.innerHTML = '';

            msgBox.className = 'msg-box success';
            msgBox.style.display = 'block';
            msgBox.innerText = result.message || 'Thực thi câu lệnh thành công!';
        }

    } catch (err) {
        resContainer.innerHTML = '';
        msgBox.className = 'msg-box error';
        msgBox.style.display = 'block';
        msgBox.innerText = 'Lỗi: ' + err.message;
    }
}

// Hàm gửi lệnh COMMIT / ROLLBACK trực tiếp
async function executeCommand(cmd) {
    const msgBox = document.getElementById('msgBox');
    const resContainer = document.getElementById('resultsContainer');

    msgBox.className = 'msg-box';
    msgBox.style.display = 'none';

    const host = localStorage.getItem('maximo_host');
    const user = localStorage.getItem('maximo_user');
    const pass = localStorage.getItem('maximo_pass');

    if (!host || !user || !pass) {
        openConfigModal();
        return;
    }

    try {
        const response = await fetch('/api/execute-sql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-maximo-host': host,
                'x-maximo-username': user,
                'x-maximo-password': pass
            },
            body: JSON.stringify({ sql: cmd, page: 1 })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Lỗi thực thi lệnh');

        addHistory(cmd);
        resContainer.innerHTML = '';
        msgBox.className = 'msg-box success';
        msgBox.style.display = 'block';
        msgBox.innerText = result.message || `Đã gửi lệnh ${cmd} thành công!`;

    } catch (err) {
        resContainer.innerHTML = '';
        msgBox.className = 'msg-box error';
        msgBox.style.display = 'block';
        msgBox.innerText = 'Lỗi: ' + err.message;
    }
}

// Hiển thị kết quả & Lọc Dữ Liệu
function renderResults() {
    const resContainer = document.getElementById('resultsContainer');
    const keyword = document.getElementById('filterInput').value.trim().toLowerCase();

    if (!currentData || currentData.length === 0) {
        resContainer.innerHTML = '<div style="color: #888; text-align: center; margin-top: 50px;">Không tìm thấy bản ghi phù hợp.</div>';
        return;
    }

    if (keyword) {
        filteredData = currentData.filter(row => {
            return Object.values(row).some(val => 
                val !== null && val !== undefined && String(val).toLowerCase().includes(keyword)
            );
        });
    } else {
        filteredData = [...currentData];
    }

    if (filteredData.length === 0) {
        resContainer.innerHTML = `<div style="color: #f88080; text-align: center; margin-top: 50px;">Không tìm thấy kết quả phù hợp với từ khóa: "<b>${keyword}</b>"</div>`;
        return;
    }

    if (viewMode === 'JSON') {
        resContainer.innerHTML = `<pre style="color: #9cdcfe; font-size: 13px; margin: 0;">${JSON.stringify(filteredData, null, 2)}</pre>`;
        return;
    }

    const columns = Object.keys(filteredData[0]);
    let html = '<table><thead><tr><th class="stt-col">STT</th>';
    columns.forEach(col => html += `<th>${col}</th>`);
    html += '</tr></thead><tbody>';

    const startStt = (currentPage - 1) * 100;
    filteredData.forEach((row, idx) => {
        html += `<tr><td class="stt-col">${startStt + idx + 1}</td>`;
        columns.forEach(col => {
            const val = row[col];
            html += `<td>${val !== undefined && val !== null ? (typeof val === 'object' ? JSON.stringify(val) : val) : ''}</td>`;
        });
        html += '</tr>';
    });

    html += '</tbody></table>';
    resContainer.innerHTML = html;
}

function toggleView() {
    viewMode = viewMode === 'TABLE' ? 'JSON' : 'TABLE';
    renderResults();
}

function exportExcel() {
    const dataToExport = filteredData.length > 0 ? filteredData : currentData;
    if (!dataToExport || dataToExport.length === 0) {
        alert('Không có dữ liệu để xuất Excel!');
        return;
    }
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Maximo_Data");
    XLSX.writeFile(wb, `Maximo_Query_Page_${currentPage}.xlsx`);
}

function addHistory(sql) {
    history = history.filter(h => h !== sql);
    history.unshift(sql);
    if (history.length > 20) history.pop();
    localStorage.setItem('maximo_sql_history', JSON.stringify(history));
    renderHistory();
}

function loadHistory() {
    history = JSON.parse(localStorage.getItem('maximo_sql_history') || '[]');
    renderHistory();
}

function renderHistory() {
    const list = document.getElementById('historyList');
    list.innerHTML = '';
    if (history.length === 0) {
        list.innerHTML = '<div style="font-size:12px; color:#888;">Chưa có lịch sử query.</div>';
        return;
    }
    history.forEach(sql => {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerText = sql;
        item.onclick = () => editor.setValue(sql);
        list.appendChild(item);
    });
}