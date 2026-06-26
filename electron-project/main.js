/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn, exec, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');

// Fix PATH on macOS to find 'adb'
if (process.platform === 'darwin') {
  const commonPaths = [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    path.join(os.homedir(), 'Library/Android/sdk/platform-tools')
  ];
  const currentPath = process.env.PATH || '';
  const existingPaths = currentPath.split(':');
  const newPaths = commonPaths.filter(p => fs.existsSync(p) && !existingPaths.includes(p));
  if (newPaths.length > 0) {
    process.env.PATH = [...newPaths, ...existingPaths].join(':');
  }
}

let mainWindow = null;
let adbProcess = null;
let pidTimer = null;
let currentPackageName = '';
let lastPid = '';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Android Logcat Viewer',
    icon: path.join(__dirname, 'icon.png'), // 可选
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // 简化示例中的 IPC 通信
    }
  });

  mainWindow.loadFile('index.html');

  // 当窗口关闭时清理所有 ADB 进程
  mainWindow.on('closed', () => {
    mainWindow = null;
    cleanup();
  });
}

// 清理 ADB 进程和定时器
function cleanup() {
  stopAdb();
  stopPidTracker();
}

function stopAdb() {
  if (adbProcess) {
    try {
      // 杀死子进程，确保杀死整个进程树
      adbProcess.kill();
    } catch (e) {
      console.error('Error killing adb process:', e);
    }
    adbProcess = null;
  }
}

function stopPidTracker() {
  if (pidTimer) {
    clearInterval(pidTimer);
    pidTimer = null;
  }
  currentPackageName = '';
  lastPid = '';
}

// 启动 ADB Logcat 抓取
function startAdb(clearBuffer = true, deviceId = null) {
  stopAdb();

  if (clearBuffer) {
    try {
      // 在启动前自动清理日志缓存：adb logcat -c
      const clearCmd = deviceId ? `adb -s ${deviceId} logcat -c` : 'adb logcat -c';
      execSync(clearCmd);
      console.log('ADB logcat buffer cleared for device:', deviceId || 'default');
    } catch (err) {
      console.warn('Failed to clear logcat buffer (is device connected?):', err.message);
    }
  }

  // 启动 adb logcat -v threadtime
  const adbArgs = [];
  if (deviceId) {
    adbArgs.push('-s', deviceId);
  }
  adbArgs.push('logcat', '-v', 'threadtime');
  
  adbProcess = spawn('adb', adbArgs);

  adbProcess.stdout.on('data', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('log-data', data.toString());
    }
  });

  adbProcess.stderr.on('data', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('log-error', data.toString());
    }
  });

  adbProcess.on('close', (code) => {
    if (mainWindow) {
      mainWindow.webContents.send('log-closed', code);
    }
    adbProcess = null;
  });
}

// 动态追踪指定包名的 PID
function startPidTracker(packageName, deviceId = null) {
  stopPidTracker();
  if (!packageName) return;

  currentPackageName = packageName;
  
  const queryPid = () => {
    if (!currentPackageName) return;
    
    // 执行 adb shell pidof <package_name>
    const pidCmd = deviceId ? `adb -s ${deviceId} shell pidof ${currentPackageName}` : `adb shell pidof ${currentPackageName}`;
    exec(pidCmd, (error, stdout, stderr) => {
      if (error || stderr) {
        if (lastPid !== '') {
          lastPid = '';
          if (mainWindow) {
            mainWindow.webContents.send('pid-updated', { packageName: currentPackageName, pid: '' });
          }
        }
        return;
      }
      
      const newPid = stdout.trim();
      if (newPid && newPid !== lastPid) {
        lastPid = newPid;
        if (mainWindow) {
          mainWindow.webContents.send('pid-updated', { packageName: currentPackageName, pid: newPid });
        }
      }
    });
  };

  // 立即执行一次，随后每 1.5 秒轮询一次
  queryPid();
  pidTimer = setInterval(queryPid, 1500);
}

// IPC 消息分发机制
ipcMain.on('control-adb', (event, action, arg, deviceId) => {
  if (action === 'start') {
    startAdb(true, deviceId);
  } else if (action === 'stop') {
    cleanup();
  } else if (action === 'track-pid') {
    startPidTracker(arg, deviceId);
  } else if (action === 'stop-track-pid') {
    stopPidTracker();
  }
});

// 检查 ADB 设备连接状态并获取详细设备列表
ipcMain.on('check-devices', (event) => {
  exec('adb devices -l', async (error, stdout, stderr) => {
    if (error) {
      event.reply('devices-list', []);
      return;
    }
    const lines = stdout.split('\n');
    const rawDevices = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line) {
        const parts = line.split(/\s+/);
        if (parts.length >= 2) {
          const id = parts[0];
          const status = parts[1]; // device, unauthorized, offline, etc.
          let fallbackModel = 'Unknown Device';
          const modelMatch = line.match(/model:(\S+)/);
          if (modelMatch) {
            fallbackModel = modelMatch[1].replace(/_/g, ' ');
          }
          rawDevices.push({ id, status, fallbackModel });
        }
      }
    }

    // 并行获取在线设备的高级属性（如品牌、真实型号、Android版本、API版本）
    const devicePromises = rawDevices.map((d) => {
      if (d.status === 'device') {
        return new Promise((resolve) => {
          const cmd = `adb -s ${d.id} shell "getprop ro.product.brand; getprop ro.product.model; getprop ro.build.version.release; getprop ro.build.version.sdk"`;
          exec(cmd, { timeout: 1500 }, (err, out) => {
            if (err || !out) {
              resolve({ id: d.id, model: d.fallbackModel, status: d.status });
            } else {
              const parts = out.split('\n').map(p => p.trim()).filter(Boolean);
              const brand = parts[0] || '';
              const model = parts[1] || '';
              const release = parts[2] || '';
              const sdk = parts[3] || '';

              let finalModel = d.fallbackModel;
              if (model) {
                const brandUpper = brand ? brand.toUpperCase() : '';
                const modelUpper = model;
                // 避免品牌名重复拼装，比如 "OPPO OPPO CPH2353"
                if (brandUpper && !modelUpper.toUpperCase().startsWith(brandUpper)) {
                  const formattedBrand = brand.charAt(0).toUpperCase() + brand.slice(1);
                  finalModel = `${formattedBrand} ${model}`;
                } else {
                  finalModel = model;
                }
              }

              resolve({
                id: d.id,
                model: finalModel,
                status: d.status,
                release: release || undefined,
                sdk: sdk || undefined
              });
            }
          });
        });
      } else {
        return Promise.resolve({ id: d.id, model: d.fallbackModel, status: d.status });
      }
    });

    const devices = await Promise.all(devicePromises);
    event.reply('devices-list', devices);
  });
});

// 获取运行中的包名列表（包名自动识别）
ipcMain.on('check-running-packages', (event, deviceId) => {
  const cmd = deviceId ? `adb -s ${deviceId} shell "ps -A" || adb -s ${deviceId} shell ps` : 'adb shell "ps -A" || adb shell ps';
  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      event.reply('running-packages-list', []);
      return;
    }
    const lines = stdout.split('\n');
    const packages = new Set();
    
    // 注入常见的应用包名，防止 ps 过滤时缺失
    packages.add('com.tencent.mm');
    packages.add('com.ss.android.ugc.aweme');
    packages.add('com.android.systemui');
    packages.add('com.google.android.gms');
    packages.add('com.tuyoo.doudizhu.android3d'); // 斗地主
    
    // 匹配类似 com.example.package 这样至少包含一个点的进程名字
    const pkgRegex = /[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_.]+/i;
    
    for (let line of lines) {
      const match = line.match(pkgRegex);
      if (match) {
        const pkg = match[0].trim();
        // 过滤系统底层无意义进程名
        if (pkg.length > 5 && !pkg.includes('/') && !pkg.startsWith('.') && !pkg.startsWith('lib') && !pkg.includes('kernel') && !pkg.includes('sh') && !pkg.includes('su')) {
          packages.add(pkg);
        }
      }
    }
    event.reply('running-packages-list', Array.from(packages));
  });
});

// 获取所有进程的 PID -> 进程名映射
ipcMain.on('get-pid-map', (event, deviceId) => {
  const cmd = deviceId ? `adb -s ${deviceId} shell "ps -A || ps"` : 'adb shell "ps -A || ps"';
  exec(cmd, (error, stdout) => {
    if (error || !stdout) {
      event.reply('pid-map-updated', {});
      return;
    }
    const lines = stdout.split('\n');
    const pidMap = {};
    let pidIndex = -1;
    let nameIndex = -1;

    const headerLine = lines[0];
    if (headerLine) {
      const headers = headerLine.trim().split(/\s+/);
      pidIndex = headers.indexOf('PID');
      if (pidIndex === -1) pidIndex = headers.findIndex(h => h.toUpperCase() === 'PID');
      nameIndex = headers.indexOf('NAME');
      if (nameIndex === -1) nameIndex = headers.findIndex(h => h.toUpperCase() === 'NAME');
      if (nameIndex === -1) nameIndex = headers.findIndex(h => h.toUpperCase() === 'CMD');
      if (nameIndex === -1) nameIndex = headers.findIndex(h => h.toUpperCase() === 'COMMAND');
    }

    if (pidIndex === -1) pidIndex = 1;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(/\s+/);
      if (parts.length > pidIndex) {
        const pid = parts[pidIndex];
        if (/^\d+$/.test(pid)) {
          let name = '';
          if (nameIndex !== -1 && nameIndex < parts.length) {
            name = parts[nameIndex];
          } else {
            name = parts[parts.length - 1];
          }
          if (name) {
            if (name.startsWith('/')) {
              name = name.substring(name.lastIndexOf('/') + 1);
            }
            pidMap[pid] = name;
          }
        }
      }
    }
    event.reply('pid-map-updated', pidMap);
  });
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  cleanup();
});
