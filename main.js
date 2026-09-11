const { app, BrowserWindow } = require('electron');
const path = require('path');

// Khởi chạy Express Server ngầm và lưu tham chiếu instance
const expressServer = require('./server.js');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        title: "Maximo SQL Query Console",
        icon: path.join(__dirname, 'public/favicon.ico'),
        autoHideMenuBar: true,
        show: false, // Ẩn cửa sổ ban đầu để tránh chớp màn hình trắng
        backgroundColor: '#1e1e1e', // Phủ nền tối theo chuẩn Dark Mode
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // Tải ứng dụng từ Express Server local
    mainWindow.loadURL('http://localhost:3000');

    // Chỉ hiển thị cửa sổ khi giao diện đã nạp hoàn tất
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(createWindow);

// Tự động đóng Express Server và giải phóng cổng 3000 khi thoát app
app.on('will-quit', () => {
    if (expressServer && typeof expressServer.close === 'function') {
        expressServer.close();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});