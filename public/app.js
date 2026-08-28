let editor;
let currentData = [];
let filteredData = [];
let viewMode = 'TABLE';
let history = [];
let currentPage = 1;
let hasMore = false;

// Quản lý Tab State
let tabs = [];
let activeTabId = null;
let tabCounter = 0;

let MAXIMO_SCHEMA = {};

let favorites = [];

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
            "Ctrl-/": (cm) => { cm.toggleComment({ lineComment: "-- " }); },
            "Cmd-/": (cm) => { cm.toggleComment({ lineComment: "-- " }); }
        },
        hintOptions: {
            tables: {
                workorder: ["wonum", "description", "status", "siteid", "worktype", "assetnum", "location", "reportdate", "historyflag"],
                asset: ["assetnum", "description", "siteid", "status", "location"]
            }
        }
    });

    // Tải Safe Mode state
    const savedSafeMode = localStorage.getItem('maximo_safe_mode');
    const safeCheck = document.getElementById('safeModeCheck');
    if (safeCheck && savedSafeMode !== null) {
        safeCheck.checked = (savedSafeMode === 'true');
    }

    // Tự động lưu nội dung SQL vào Tab đang active
    editor.on("change", () => {
        const currentTab = tabs.find(t => t.id === activeTabId);
        if (currentTab) {
            currentTab.sql = editor.getValue();
        }
    });

    // Tự động gợi ý từ khóa khi gõ
    editor.on("inputRead", (cm, change) => {
        if (change.origin !== '+delete' && /[a-zA-Z._]/.test(change.text[0])) {
            CodeMirror.commands.autocomplete(cm, null, { completeSingle: false });
        }
    });

    // Theo dõi kích thước Editor
    const resizer = new ResizeObserver(() => {
        if (editor) editor.refresh();
    });
    resizer.observe(document.querySelector('.editor-container'));

    // Khởi tạo Tab & Lịch sử
    addTab("SELECT wonum, description, status, siteid FROM workorder WHERE siteid='BEDFORD'");
    loadHistory();
    loadDynamicSchema();
    loadFavorites();
});

// Nạp Schema từ Maximo
async function loadDynamicSchema() {
    const treeContainer = document.getElementById('schemaTreeList');
    if (!treeContainer) return;

    try {
        const host = localStorage.getItem('maximo_host');
        const context = localStorage.getItem('maximo_context') || 'maximo';
        const user = localStorage.getItem('maximo_user');
        const pass = localStorage.getItem('maximo_pass');

        if (!host || !user || !pass) {
            treeContainer.innerHTML = '<div style="color: #888; padding: 10px; font-size: 11px;">Bấm "Cấu hình kết nối" để tải Schema.</div>';
            return;
        }

        treeContainer.innerHTML = '<div style="color: #61dafb; padding: 10px; font-size: 12px;">⏳ Đang tải CSDL từ Maximo...</div>';

        const schemaSql = "SELECT lower(objectname) as tablename, lower(attributename) as colname FROM maxattribute ORDER BY objectname, attributename";

        const response = await fetch('/api/execute-sql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-maximo-host': host,
                'x-maximo-context': context,
                'x-maximo-username': user,
                'x-maximo-password': pass,
                'x-safe-mode': 'true'
            },
            body: JSON.stringify({ sql: schemaSql, page: -1 })
        });

        const result = await response.json();

        if (response.ok && result.action === 'SELECT' && result.data) {
            MAXIMO_SCHEMA = {};
            result.data.forEach(row => {
                const table = row.tablename;
                const col = row.colname;
                if (!MAXIMO_SCHEMA[table]) MAXIMO_SCHEMA[table] = [];
                MAXIMO_SCHEMA[table].push(col);
            });

            if (editor) editor.setOption("hintOptions", { tables: MAXIMO_SCHEMA });
            renderSchemaTree();
        } else {
            treeContainer.innerHTML = `<div style="color: #888; padding: 10px; font-size: 11px;">Tạm thời bỏ qua Schema: ${result.error || 'Lỗi kết nối'}</div>`;
        }
    } catch (err) {
        treeContainer.innerHTML = `<div style="color: #888; padding: 10px; font-size: 11px;">Tạm thời bỏ qua Schema.</div>`;
    }
}

function toggleSafeMode() {
    const isSafe = document.getElementById('safeModeCheck').checked;
    localStorage.setItem('maximo_safe_mode', isSafe);
}

// Hàm tạo Tab mới
function addTab(initialSql = '') {
    tabCounter++;
    const defaultSql = initialSql || "SELECT wonum, description, status, siteid FROM workorder WHERE siteid='BEDFORD'";
    
    const newTab = {
        id: tabCounter,
        title: `Query ${tabCounter}`,
        sql: defaultSql
    };

    tabs.push(newTab);
    switchTab(newTab.id);
}

function switchTab(tabId) {
    if (activeTabId && editor) {
        const currentTab = tabs.find(t => t.id === activeTabId);
        if (currentTab) currentTab.sql = editor.getValue();
    }

    activeTabId = tabId;
    const targetTab = tabs.find(t => t.id === tabId);

    if (targetTab && editor) {
        editor.setValue(targetTab.sql);
        editor.focus();
    }

    renderTabs();
}

function closeTab(tabId, event) {
    event.stopPropagation();
    
    if (tabs.length === 1) {
        alert("Cần giữ lại ít nhất 1 Tab làm việc!");
        return;
    }

    tabs = tabs.filter(t => t.id !== tabId);

    if (activeTabId === tabId) {
        const nextTab = tabs[tabs.length - 1];
        switchTab(nextTab.id);
    } else {
        renderTabs();
    }
}

function renderTabs() {
    const tabBar = document.getElementById('tabBar');
    if (!tabBar) return;

    tabBar.innerHTML = tabs.map(t => `
        <div class="tab-item ${t.id === activeTabId ? 'active' : ''}" onclick="switchTab(${t.id})">
            <span>${t.title}</span>
            <span class="tab-close" onclick="closeTab(${t.id}, event)">&times;</span>
        </div>
    `).join('');
}

// Format SQL không vỡ comment
function formatSql() {
    if (!editor) return;
    const text = editor.getValue();
    if (!text.trim()) return;

    const lines = text.split(/\r?\n/);
    const formattedLines = [];
    
    const keywords = [
        "SELECT", "FROM", "WHERE", "AND", "OR", "GROUP BY", "ORDER BY",
        "HAVING", "LIMIT", "OFFSET", "JOIN", "LEFT JOIN", "RIGHT JOIN",
        "INNER JOIN", "OUTER JOIN", "UPDATE", "SET", "INSERT INTO",
        "VALUES", "DELETE FROM", "DELETE"
    ];

    for (let line of lines) {
        let trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('--')) {
            formattedLines.push(trimmed);
            continue;
        }

        let codePart = trimmed;
        let commentPart = '';
        const commentIdx = trimmed.indexOf('--');
        
        if (commentIdx !== -1) {
            codePart = trimmed.substring(0, commentIdx).trim();
            commentPart = ' ' + trimmed.substring(commentIdx).trim();
        }

        if (codePart) {
            keywords.forEach(kw => {
                const regex = new RegExp(`(?<!^)\\b${kw}\\b`, 'gi');
                codePart = codePart.replace(regex, `\n${kw}`);
            });

            keywords.forEach(kw => {
                const regex = new RegExp(`\\b${kw}\\b`, 'gi');
                codePart = codePart.replace(regex, kw);
            });
        }

        const fullLine = (codePart + commentPart).trim();
        if (fullLine) {
            const subLines = fullLine.split('\n');
            subLines.forEach(sl => {
                if (sl.trim()) formattedLines.push(sl.trim());
            });
        }
    }

    editor.setValue(formattedLines.join('\n'));
}

// Modal Controls
function openConfigModal() {
    document.getElementById('cfgHost').value = localStorage.getItem('maximo_host') || '';
    document.getElementById('cfgContext').value = localStorage.getItem('maximo_context') || 'maximo';
    document.getElementById('cfgUser').value = localStorage.getItem('maximo_user') || '';
    document.getElementById('cfgPass').value = localStorage.getItem('maximo_pass') || '';
    document.getElementById('configModal').style.display = 'flex';
}

function closeConfigModal() {
    document.getElementById('configModal').style.display = 'none';
}

function saveConfig() {
    const host = document.getElementById('cfgHost').value.trim();
    const context = (document.getElementById('cfgContext').value.trim() || 'maximo').replace(/^\/+|\/+$/g, '');
    const user = document.getElementById('cfgUser').value.trim();
    const pass = document.getElementById('cfgPass').value.trim();

    if (!host || !user || !pass) {
        alert('Vui lòng nhập đầy đủ thông tin Host, Username và Password!');
        return;
    }

    localStorage.setItem('maximo_host', host);
    localStorage.setItem('maximo_context', context);
    localStorage.setItem('maximo_user', user);
    localStorage.setItem('maximo_pass', pass);
    alert('Đã lưu cấu hình kết nối thành công!');
    closeConfigModal();

    loadDynamicSchema();
}

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

// Run Query
async function runQuery(page = 1) {
    currentPage = page;

    const selectedSql = editor.getSelection().trim();
    const sql = selectedSql || editor.getValue().trim();
    const isSafeMode = document.getElementById('safeModeCheck')?.checked ?? true;

    const msgBox = document.getElementById('msgBox');
    const resContainer = document.getElementById('resultsContainer');

    msgBox.className = 'msg-box';
    msgBox.style.display = 'none';
    document.getElementById('filterInput').value = '';

    if (isSafeMode) {
        const cleanUpper = sql.toUpperCase().trim();
        const forbiddenWords = ['UPDATE', 'DELETE', 'INSERT', 'DROP', 'ALTER', 'TRUNCATE'];
        const isForbidden = forbiddenWords.some(kw => cleanUpper.startsWith(kw) || cleanUpper.includes(` ${kw} `));
        
        if (isForbidden) {
            msgBox.className = 'msg-box error';
            msgBox.style.display = 'block';
            msgBox.innerText = '🛡️ [SAFE MODE ACTIVE] Đã chặn câu lệnh làm thay đổi dữ liệu!';
            return;
        }
    }

    const host = localStorage.getItem('maximo_host');
    const context = localStorage.getItem('maximo_context') || 'maximo';
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
                'x-maximo-context': context,
                'x-maximo-username': user,
                'x-maximo-password': pass,
                'x-safe-mode': isSafeMode ? 'true' : 'false'
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

// Commit / Rollback Command
async function executeCommand(cmd) {
    const msgBox = document.getElementById('msgBox');
    const resContainer = document.getElementById('resultsContainer');

    msgBox.className = 'msg-box';
    msgBox.style.display = 'none';

    const host = localStorage.getItem('maximo_host');
    const context = localStorage.getItem('maximo_context') || 'maximo';
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
                'x-maximo-context': context,
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

// Render Results
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

    const startStt = (currentPage - 1) * 50;
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

// Chuyển Tab Sidebar
function switchSidebarTab(tabName) {
    const schemaTab = document.getElementById('sbTabSchema');
    const historyTab = document.getElementById('sbTabHistory');
    const favTab = document.getElementById('sbTabFav');

    const schemaPanel = document.getElementById('panelSchema');
    const historyPanel = document.getElementById('panelHistory');
    const favPanel = document.getElementById('panelFav');

    if (!schemaTab || !historyTab || !favTab) return;

    schemaTab.classList.toggle('active', tabName === 'SCHEMA');
    historyTab.classList.toggle('active', tabName === 'HISTORY');
    favTab.classList.toggle('active', tabName === 'FAV');

    schemaPanel.style.display = tabName === 'SCHEMA' ? 'flex' : 'none';
    historyPanel.style.display = tabName === 'HISTORY' ? 'flex' : 'none';
    favPanel.style.display = tabName === 'FAV' ? 'flex' : 'none';

    if (tabName === 'HISTORY') renderHistory();
    if (tabName === 'FAV') renderFavorites();
}

// Quản lý Lịch sử Query
function addHistory(sql) {
    history = history.filter(h => h !== sql);
    history.unshift(sql);
    if (history.length > 30) history.pop();
    localStorage.setItem('maximo_sql_history', JSON.stringify(history));
    renderHistory();
}

function loadHistory() {
    history = JSON.parse(localStorage.getItem('maximo_sql_history') || '[]');
    renderHistory();
}

function renderHistory() {
    const list = document.getElementById('historyList');
    if (!list) return;

    list.innerHTML = '';
    
    if (!history || history.length === 0) {
        list.innerHTML = '<div style="font-size:12px; color:#888; padding: 10px;">Chưa có lịch sử query.</div>';
        return;
    }

    history.forEach(sql => {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerText = sql;
        item.title = "Click để nạp câu lệnh vào Editor";
        item.onclick = () => {
            if (editor) {
                editor.setValue(sql);
                editor.focus();
            }
        };
        list.appendChild(item);
    });
}

// Lưu Query hiện tại vào Yêu thích
function saveCurrentQueryToFavorites() {
    if (!editor) return;
    const selectedSql = editor.getSelection().trim();
    const sql = selectedSql || editor.getValue().trim();

    if (!sql) {
        alert("Khung gõ SQL đang rỗng!");
        return;
    }

    const title = prompt("Nhập tên gợi nhớ cho câu lệnh SQL này:", "Query " + (favorites.length + 1));
    if (!title || !title.trim()) return;

    const newFav = {
        id: Date.now(),
        title: title.trim(),
        sql: sql
    };

    favorites.unshift(newFav);
    localStorage.setItem('maximo_sql_favs', JSON.stringify(favorites));
    
    switchSidebarTab('FAV');
    renderFavorites();
}

// Xóa 1 Query khỏi Yêu thích
function deleteFavorite(id, event) {
    event.stopPropagation();
    if (!confirm("Bạn có chắc muốn xóa Query này khỏi danh sách Yêu thích?")) return;

    favorites = favorites.filter(f => f.id !== id);
    localStorage.setItem('maximo_sql_favs', JSON.stringify(favorites));
    renderFavorites();
}

function loadFavorites() {
    favorites = JSON.parse(localStorage.getItem('maximo_sql_favs') || '[]');
    renderFavorites();
}

// Render danh sách Query Yêu thích
function renderFavorites() {
    const list = document.getElementById('favList');
    if (!list) return;

    list.innerHTML = '';

    if (!favorites || favorites.length === 0) {
        list.innerHTML = '<div style="font-size:12px; color:#888; padding: 10px;">Chưa có Query nào được lưu. Bấm "⭐ Lưu Query" trên Toolbar để thêm.</div>';
        return;
    }

    favorites.forEach(fav => {
        const item = document.createElement('div');
        item.className = 'fav-item';
        item.onclick = () => {
            if (editor) {
                editor.setValue(fav.sql);
                editor.focus();
            }
        };

        item.innerHTML = `
            <div class="fav-header">
                <span>⭐ ${fav.title}</span>
                <span class="fav-del-btn" onclick="deleteFavorite(${fav.id}, event)" title="Xóa">&times;</span>
            </div>
            <div class="fav-sql">${fav.sql}</div>
        `;

        list.appendChild(item);
    });
}