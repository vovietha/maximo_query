const { app, BrowserWindow, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const path = require('path');

// Cấu hình ghi log cho autoUpdater
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

// Khởi chạy Express Server ngầm
const expressServer = require('./server.js');

let mainWindow;

function checkAutoUpdate() {
    if (!app.isPackaged) return;

    autoUpdater.on('checking-for-update', () => {
        log.info('Đang kiểm tra bản mới...');
    });

    autoUpdater.on('update-available', (info) => {
        log.info(`Tìm thấy phiên bản mới v${info.version}`);
    });

    // --- CHÈN VÀO ĐÂY ---
    autoUpdater.on('download-progress', (progressObj) => {
        let log_message = `Đang tải: ${progressObj.percent.toFixed(1)}%`;
        log_message += ` (${(progressObj.transferred / 1024 / 1024).toFixed(1)}MB / ${(progressObj.total / 1024 / 1024).toFixed(1)}MB)`;
        log.info(log_message);
    });

    autoUpdater.on('update-not-available', (info) => {
        log.info('Ứng dụng đang ở phiên bản mới nhất.');
    });

    autoUpdater.on('error', (err) => {
        log.error('Lỗi Auto-Update:', err);
    });

    autoUpdater.on('update-downloaded', (info) => {
        dialog.showMessageBox({
            type: 'info',
            title: 'Cập nhật sẵn sàng',
            message: `Đã tải xong phiên bản v${info.version}. Khởi động lại ứng dụng để nâng cấp ngay?`,
            buttons: ['Cập nhật ngay', 'Để sau']
        }).then((result) => {
            if (result.response === 0) {
                autoUpdater.quitAndInstall();
            }
        });
    });

    autoUpdater.checkForUpdates();
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        title: "Maximo SQL Query Console",
        icon: path.join(__dirname, 'public/favicon.ico'),
        autoHideMenuBar: true,
        show: false,
        backgroundColor: '#1e1e1e',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.loadURL('http://localhost:3000');

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        checkAutoUpdate();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(createWindow);

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