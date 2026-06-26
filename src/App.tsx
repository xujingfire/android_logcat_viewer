/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Square, 
  Trash2, 
  Download,
  Settings,
  Search, 
  SlidersHorizontal, 
  Terminal, 
  FileCode, 
  Cpu, 
  Copy, 
  Check, 
  HelpCircle, 
  RefreshCw, 
  AlertTriangle, 
  Monitor, 
  Smartphone, 
  Code,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Log record type
interface LogItem {
  id: number;
  time: string;
  pid: string;
  tid: string;
  level: string;
  tag: string;
  msg: string;
  rawText: string;
  isRaw: boolean;
}

// Connected Device info
interface DeviceInfo {
  id: string;
  model: string;
  status: string;
}

// Helper to render URLs as clickable links
function renderTextWithLinks(text: string) {
  if (!text) return '';
  const urlRegex = /(https?:\/\/[^\s<>\"]+)/gi;
  const parts = text.split(urlRegex);
  if (parts.length === 1) return text;

  return parts.map((part, index) => {
    if (part.match(urlRegex)) {
      return (
        <a 
          key={index} 
          href={part} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="text-[#589df6] underline hover:text-[#79b2f8] cursor-pointer"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

function getTagColor(tag: string): string {
  const colors = [
    '#9876aa', // 紫色 (Lavender)
    '#4ec9b0', // 薄荷绿 (Mint)
    '#c586c0', // 粉紫 (Magenta)
    '#4fc1ff', // 天蓝 (Light Blue)
    '#dcdcaa', // 柔黄 (Soft Yellow)
    '#ce9178', // 珊瑚橙 (Coral)
    '#85e89d', // 浅绿 (Pale Green)
    '#79b8ff', // 亮蓝 (Bright Blue)
    '#b39ddb', // 紫罗兰 (Violet)
    '#ffab70', // 暖橙 (Warm Orange)
  ];
  if (!tag) return colors[0];
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
}

function formatTimeWithYear(time: string): string {
  if (!time) return '';
  if (/^\d{4}-/.test(time)) return time;
  const year = new Date().getFullYear();
  return `${year}-${time}`;
}

export default function App() {
  // Current tab: 'console' | 'code' | 'guide'
  const [activeTab, setActiveTab] = useState<'console' | 'code' | 'guide'>('console');
  
  // Connection state
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('sim-pixel8');
  const [adbAvailable, setAdbAvailable] = useState<boolean>(false);
  const [isFetchingDevices, setIsFetchingDevices] = useState<boolean>(false);

  // Streaming state
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [mode, setMode] = useState<'simulated' | 'real'>('simulated');
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<LogItem[]>([]);
  
  // Filter controllers
  const [packageName, setPackageName] = useState<string>('');
  const [trackedPid, setTrackedPid] = useState<string>('');
  const [minLevel, setMinLevel] = useState<string>('V');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [maxLines, setMaxLines] = useState<number>(1500);

  // PID to package/process name mapping
  const [pidMap, setPidMap] = useState<Record<string, string>>({
    '8210': 'com.tencent.mm',
    '13912': 'com.ss.android.ugc.aweme',
    '1248': 'com.android.systemui',
    '2145': 'com.google.android.gms',
    '28450': 'com.example.logcatdemo',
    '1412': 'system_server',
    '1282': 'system_server'
  });

  // UI state
  const [copiedFile, setCopiedFile] = useState<string | null>(null);
  const [selectedFileTab, setSelectedFileTab] = useState<'package' | 'main' | 'html'>('html');

  // Spacing, height, columns and colors with localStorage persistence
  const [rowPadding, setRowPadding] = useState<number>(() => {
    const saved = localStorage.getItem('log_rowPadding');
    return saved !== null ? Number(saved) : 2;
  });
  const [fontSize, setFontSize] = useState<number>(() => {
    const saved = localStorage.getItem('log_fontSize');
    return saved !== null ? Number(saved) : 11;
  });
  const [colWidths, setColWidths] = useState(() => {
    const saved = localStorage.getItem('log_colWidths');
    return saved !== null ? JSON.parse(saved) : {
      time: 165,
      pid: 95,
      level: 30,
      tag: 160,
      pkg: 180,
    };
  });
  const [levelColors, setLevelColors] = useState(() => {
    const saved = localStorage.getItem('log_levelColors');
    return saved !== null ? JSON.parse(saved) : {
      V: '#808080',
      D: '#3582e1',
      I: '#39c039',
      W: '#e2a007',
      E: '#e53e3e',
      F: '#ff3e3e',
    };
  });
  const [levelBgs, setLevelBgs] = useState(() => {
    const saved = localStorage.getItem('log_levelBgs');
    return saved !== null ? JSON.parse(saved) : {
      V: '#3c3f41',
      D: '#223c5a',
      I: '#204120',
      W: '#4a3c10',
      E: '#4a1d1d',
      F: '#ff0000',
    };
  });
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);

  useEffect(() => {
    localStorage.setItem('log_rowPadding', String(rowPadding));
  }, [rowPadding]);

  useEffect(() => {
    localStorage.setItem('log_fontSize', String(fontSize));
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem('log_colWidths', JSON.stringify(colWidths));
  }, [colWidths]);

  useEffect(() => {
    localStorage.setItem('log_levelColors', JSON.stringify(levelColors));
  }, [levelColors]);

  useEffect(() => {
    localStorage.setItem('log_levelBgs', JSON.stringify(levelBgs));
  }, [levelBgs]);

  const getLevelStyle = (level: string) => {
    const color = levelColors[level as keyof typeof levelColors] || '#a9b7c6';
    const bg = levelBgs[level as keyof typeof levelBgs] || '#3c3f41';
    return { color, bg };
  };

  const handleMouseDown = (e: React.MouseEvent, column: 'time' | 'pid' | 'level' | 'tag' | 'pkg') => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = colWidths[column];

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      setColWidths((prev) => ({
        ...prev,
        [column]: Math.max(30, startWidth + deltaX),
      }));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Server-Sent Events source ref
  const sseRef = useRef<EventSource | null>(null);
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const logIdCounter = useRef<number>(0);

  // Multi-app mock packages autocomplete
  const samplePackages = [
    { name: '微信 (WeChat)', pkg: 'com.tencent.mm' },
    { name: '抖音 (TikTok)', pkg: 'com.ss.android.ugc.aweme' },
    { name: '系统 UI (SystemUI)', pkg: 'com.android.systemui' },
    { name: '谷歌服务 (GMS)', pkg: 'com.google.android.gms' },
    { name: '演示 App (DemoApp)', pkg: 'com.example.logcatdemo' }
  ];

  // ADB threadtime regex
  const THREADTIME_REGEX = /^(\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+(.*?):\s(.*)$/;

  // Check connected ADB devices on mount
  const fetchDevices = async () => {
    setIsFetchingDevices(true);
    try {
      const res = await fetch('/api/devices');
      const data = await res.json();
      setAdbAvailable(data.adbAvailable);
      setDevices(data.devices || []);
      
      // If real ADB has devices, switch selected device to it
      const activeDevice = data.devices.find((d: any) => d.status === 'device');
      if (activeDevice) {
        setSelectedDevice(activeDevice.id);
        setMode('real');
      } else {
        setSelectedDevice('sim-pixel8');
        setMode('simulated');
      }
    } catch (e) {
      console.error('Failed to query devices:', e);
    } finally {
      setIsFetchingDevices(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  // Poll PID if package name changes or during streaming
  useEffect(() => {
    let interval: NodeJS.Timeout;

    const updatePid = async () => {
      if (!packageName) {
        setTrackedPid('');
        return;
      }
      try {
        const isSimulated = mode === 'simulated' ? 'true' : 'false';
        const deviceParam = selectedDevice && !selectedDevice.startsWith('sim-') ? `&deviceId=${encodeURIComponent(selectedDevice)}` : '';
        const res = await fetch(`/api/pid?packageName=${encodeURIComponent(packageName)}&simulated=${isSimulated}${deviceParam}`);
        const data = await res.json();
        setTrackedPid(data.pid || '');
      } catch (e) {
        console.error('Error fetching PID:', e);
      }
    };

    if (packageName) {
      updatePid();
      // Poll every 1.5 seconds as requested
      interval = setInterval(updatePid, 1500);
    } else {
      setTrackedPid('');
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [packageName, mode, selectedDevice]);

  // Poll PS list for real device to resolve package names
  useEffect(() => {
    let interval: NodeJS.Timeout;

    const fetchPsMap = async () => {
      if (mode !== 'real' || !selectedDevice || selectedDevice.startsWith('sim-')) {
        return;
      }
      try {
        const deviceParam = selectedDevice ? `?deviceId=${encodeURIComponent(selectedDevice)}` : '';
        const res = await fetch(`/api/ps${deviceParam}`);
        const data = await res.json();
        if (data && data.pidMap) {
          setPidMap(prev => ({ ...prev, ...data.pidMap }));
        }
      } catch (e) {
        console.error('Error fetching process list:', e);
      }
    };

    if (mode === 'real' && selectedDevice && !selectedDevice.startsWith('sim-')) {
      fetchPsMap();
      interval = setInterval(fetchPsMap, 4000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [mode, selectedDevice]);

  // Start logcat stream
  const startStream = (clearBufferOnStart = true) => {
    if (sseRef.current) {
      sseRef.current.close();
    }

    if (clearBufferOnStart) {
      setLogs([]);
      logIdCounter.current = 0;
    }

    setIsStreaming(true);

    const streamMode = mode;
    const clearParam = clearBufferOnStart ? 'true' : 'false';
    const deviceParam = selectedDevice && !selectedDevice.startsWith('sim-') ? `&deviceId=${encodeURIComponent(selectedDevice)}` : '';
    const sseUrl = `/api/stream-logs?mode=${streamMode}&clearBuffer=${clearParam}${deviceParam}`;

    const eventSource = new EventSource(sseUrl);
    sseRef.current = eventSource;

    eventSource.addEventListener('system', (e: any) => {
      const parsedData = JSON.parse(e.data);
      appendSystemMessage(parsedData.text);
    });

    eventSource.addEventListener('log', (e: any) => {
      const parsedData = JSON.parse(e.data);
      appendRawChunk(parsedData.text);
    });

    eventSource.addEventListener('error', (e: any) => {
      const parsedData = JSON.parse(e.data);
      appendSystemMessage(`[ERROR] ${parsedData.text}`, 'E');
    });

    eventSource.addEventListener('closed', (e: any) => {
      const parsedData = JSON.parse(e.data);
      appendSystemMessage(`[DISCONNECTED] ${parsedData.text}`, 'W');
      stopStream();
    });

    eventSource.onerror = (err) => {
      console.error('SSE EventSource error:', err);
      // Close gently
      stopStream();
    };
  };

  // Stop logcat stream
  const stopStream = () => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
    setIsStreaming(false);
  };

  // Restart streaming if device/mode shifts while streaming
  useEffect(() => {
    if (isStreaming) {
      const timer = setTimeout(() => {
        startStream(true);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [selectedDevice]);

   const clearConsole = () => {
    setLogs([]);
  };

  const exportLogs = () => {
    if (filteredLogs.length === 0) return;
    
    const lines = filteredLogs.map((log) => {
      if (log.isRaw) {
        return log.rawText;
      }
      return `${formatTimeWithYear(log.time)}  ${log.pid}  ${log.tid} ${log.level} ${log.tag}: ${log.msg}`;
    });
    
    const text = lines.join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    
    const dateStr = new Date().toISOString().slice(0, 10);
    const filterDesc = packageName ? `_${packageName.replace(/[^a-zA-Z0-9]/g, '_')}` : '';
    link.download = `logcat_${dateStr}${filterDesc}.txt`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Append raw log lines chunk
  const appendRawChunk = (chunk: string) => {
    const lines = chunk.split('\n');
    const newItems: LogItem[] = [];

    lines.forEach((line) => {
      if (!line.trim()) return;
      
      const match = line.match(THREADTIME_REGEX);
      if (match) {
        const pid = match[2].trim();
        const tag = match[5].trim();
        const msg = match[6];
        
        // 动态解析 ActivityManager 等系统进程拉起日志获取最新的 PID -> PackageName 映射
        if (tag === 'ActivityManager') {
          const procMatch = msg.match(/proc\s+(\d+):([a-zA-Z0-9_\.\/]+)/) || msg.match(/Process\s+([a-zA-Z0-9_\.]+)\s+\(pid\s+(\d+)\)/);
          if (procMatch) {
            let parsedPid, parsedPkg;
            if (msg.includes('Process') && msg.includes('has died')) {
              // process died
            } else if (msg.includes('Process')) {
              parsedPkg = procMatch[1];
              parsedPid = procMatch[2];
            } else {
              parsedPid = procMatch[1];
              parsedPkg = procMatch[2].split('/')[0];
            }
            if (parsedPid && parsedPkg) {
              setPidMap(prev => ({ ...prev, [parsedPid]: parsedPkg }));
            }
          }
        }

        newItems.push({
          id: ++logIdCounter.current,
          isRaw: false,
          time: match[1],
          pid: pid,
          tid: match[3].trim(),
          level: match[4],
          tag: tag,
          msg: msg,
          rawText: line
        });
      } else {
        // Fallback for non-matching lines
        let detectedLevel = 'I';
        if (line.includes('E/')) detectedLevel = 'E';
        else if (line.includes('W/')) detectedLevel = 'W';
        else if (line.includes('D/')) detectedLevel = 'D';
        else if (line.includes('F/')) detectedLevel = 'F';

        newItems.push({
          id: ++logIdCounter.current,
          isRaw: true,
          time: '',
          pid: '',
          tid: '',
          level: detectedLevel,
          tag: '',
          msg: '',
          rawText: line
        });
      }
    });

    setLogs((prev) => {
      const combined = [...prev, ...newItems];
      if (combined.length > maxLines) {
        return combined.slice(combined.length - maxLines);
      }
      return combined;
    });
  };

  const appendSystemMessage = (text: string, level = 'I') => {
    const item: LogItem = {
      id: ++logIdCounter.current,
      isRaw: true,
      time: '',
      pid: '',
      tid: '',
      level: level,
      tag: 'SYSTEM',
      msg: text,
      rawText: `[SYSTEM] ${text}`
    };
    setLogs((prev) => {
      const combined = [...prev, item];
      if (combined.length > maxLines) {
        return combined.slice(combined.length - maxLines);
      }
      return combined;
    });
  };

  // Trigger simulated actions (crash or cold-start) on backend
  const triggerSimulatedAction = async (action: 'crash' | 'cold_start') => {
    const pkg = packageName || 'com.example.logcatdemo';
    if (!packageName) {
      setPackageName('com.example.logcatdemo');
    }
    
    try {
      await fetch('/api/simulate-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, packageName: pkg })
      });
    } catch (e) {
      console.error('Failed to trigger simulation:', e);
    }
  };

  // Filtering Logic
  useEffect(() => {
    const LEVEL_HIERARCHY: { [key: string]: number } = { 'V': 0, 'D': 1, 'I': 2, 'W': 3, 'E': 4, 'F': 5 };
    const minVal = LEVEL_HIERARCHY[minLevel] || 0;

    const filtered = logs.filter((log) => {
      // 1. Level Filter
      const logVal = LEVEL_HIERARCHY[log.level] || 0;
      if (logVal < minVal) return false;

      // 2. Package Name & PID Filter
      if (packageName) {
        if (log.tag === 'SYSTEM') return true; // Keep system logs visible
        
        if (log.isRaw) {
          // Raw rows with no PID generally filtered if package filter is active
          return false;
        } else {
          if (trackedPid) {
            if (log.pid !== trackedPid) return false;
          } else {
            // Before PID is resolved, match package name against content
            const lowerPkg = packageName.toLowerCase();
            const tagLower = log.tag.toLowerCase();
            const msgLower = log.msg.toLowerCase();
            if (!tagLower.includes(lowerPkg) && !msgLower.includes(lowerPkg)) {
              return false;
            }
          }
        }
      }

      // 3. Keyword / Regex search
      if (searchQuery) {
        const lowerQuery = searchQuery.toLowerCase();
        try {
          const regex = new RegExp(searchQuery, 'i');
          if (log.isRaw) {
            if (!regex.test(log.rawText)) return false;
          } else {
            const searchStr = `${log.tag} ${log.msg}`;
            if (!regex.test(searchStr)) return false;
          }
        } catch (e) {
          // Fallback to basic substring matches if regex is in-progress/invalid
          if (log.isRaw) {
            if (!log.rawText.toLowerCase().includes(lowerQuery)) return false;
          } else {
            const searchStr = `${log.tag} ${log.msg}`.toLowerCase();
            if (!searchStr.includes(lowerQuery)) return false;
          }
        }
      }

      return true;
    });

    setFilteredLogs(filtered);
  }, [logs, minLevel, packageName, trackedPid, searchQuery]);

  // Handle auto-scroll to bottom
  useEffect(() => {
    if (isStreaming && autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [filteredLogs, autoScroll, isStreaming]);

  // Auto start streaming on mount (with simulated logs by default)
  useEffect(() => {
    startStream(true);
    return () => {
      if (sseRef.current) sseRef.current.close();
    };
  }, [mode]);

  // Handle switching modes
  const handleModeChange = (newMode: 'simulated' | 'real') => {
    setMode(newMode);
    if (newMode === 'real') {
      setSelectedDevice(devices.length > 0 ? devices[0].id : 'no-real-device');
    } else {
      setSelectedDevice('sim-pixel8');
    }
  };

  // Electron Source Code mapping
  const electronFiles = {
    package: `{
  "name": "android-logcat-viewer",
  "version": "1.0.0",
  "description": "A high-fidelity lightweight cross-platform Android Logcat viewer styled after Android Studio.",
  "main": "main.js",
  "scripts": {
    "start": "electron ."
  },
  "keywords": [
    "android",
    "logcat",
    "viewer",
    "electron"
  ],
  "author": "Logcat Expert",
  "license": "Apache-2.0",
  "devDependencies": {
    "electron": "^31.0.0"
  }
}`,
    main: `/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn, exec, execSync } = require('child_process');

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
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // 简化示例中的 IPC 通信
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
    cleanup();
  });
}

function cleanup() {
  stopAdb();
  stopPidTracker();
}

function stopAdb() {
  if (adbProcess) {
    try {
      adbProcess.kill();
    } catch (e) {
      console.error(e);
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

function startAdb(clearBuffer = true) {
  stopAdb();

  if (clearBuffer) {
    try {
      execSync('adb logcat -c');
    } catch (err) {
      console.warn('Failed to clear buffer:', err.message);
    }
  }

  adbProcess = spawn('adb', ['logcat', '-v', 'threadtime']);

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

function startPidTracker(packageName) {
  stopPidTracker();
  if (!packageName) return;

  currentPackageName = packageName;
  
  const queryPid = () => {
    if (!currentPackageName) return;
    exec(\`adb shell pidof \${currentPackageName}\`, (error, stdout, stderr) => {
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

  queryPid();
  pidTimer = setInterval(queryPid, 1500);
}

ipcMain.on('control-adb', (event, action, arg) => {
  if (action === 'start') {
    startAdb(true);
  } else if (action === 'stop') {
    cleanup();
  } else if (action === 'track-pid') {
    startPidTracker(arg);
  } else if (action === 'stop-track-pid') {
    stopPidTracker();
  }
});

ipcMain.on('check-devices', (event) => {
  exec('adb devices', (error, stdout, stderr) => {
    if (error) {
      event.reply('devices-list', []);
      return;
    }
    const lines = stdout.split('\\n');
    const devices = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line) {
        const parts = line.split(/\\s+/);
        if (parts[1] === 'device') {
          devices.push(parts[0]);
        }
      }
    }
    event.reply('devices-list', devices);
  });
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('quit', () => {
  cleanup();
});`,
    html: `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Android Logcat Viewer (Darcula)</title>
  <style>
    :root {
      --bg-color: #2b2b2b;
      --panel-bg: #3c3f41;
      --border-color: #323232;
      --text-color: #a9b7c6;
      --input-bg: #45494a;
      --input-border: #646464;
      --button-bg: #4b4d4d;
      --button-hover: #5c5e5e;
      --button-active: #3c3f41;
      --button-primary: #1e5a2f;
      --button-primary-hover: #27773f;
      --button-danger: #7c2d12;
      --button-danger-hover: #9a3412;
      
      --color-verbose: #808080;
      --color-debug: #3582e1;
      --color-info: #39c039;
      --color-warning: #e2a007;
      --color-error: #e53e3e;
      --color-fatal: #ff0000;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg-color);
      color: var(--text-color);
      font-family: 'Consolas', 'Monaco', 'Fira Code', monospace;
      font-size: 12px;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .filter-bar {
      background-color: var(--panel-bg);
      border-bottom: 1px solid var(--border-color);
      padding: 8px 12px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .btn {
      background-color: var(--button-bg);
      color: #bbbbbb;
      border: 1px solid var(--input-border);
      padding: 5px 12px;
      border-radius: 3px;
      cursor: pointer;
      font-family: inherit;
      font-size: 11px;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .btn:hover { background-color: var(--button-hover); color: #ffffff; }
    .btn-start { background-color: var(--button-primary); border-color: #2b6a3a; color: #ffffff; }
    .btn-start:hover { background-color: var(--button-primary-hover); }
    .btn-stop { background-color: var(--button-danger); border-color: #9a3412; color: #ffffff; }
    .btn-stop:hover { background-color: var(--button-danger-hover); }

    .input-group { display: flex; align-items: center; gap: 5px; }
    .input-group label { color: #808080; font-size: 11px; }
    .input-control {
      background-color: var(--input-bg);
      color: #ffffff;
      border: 1px solid var(--input-border);
      padding: 4px 8px;
      border-radius: 3px;
      font-family: inherit;
      font-size: 11px;
      outline: none;
    }

    .select-control {
      background-color: var(--input-bg);
      color: #ffffff;
      border: 1px solid var(--input-border);
      padding: 3px 6px;
      border-radius: 3px;
      font-family: inherit;
      font-size: 11px;
    }

    .status-panel { font-size: 11px; color: #888888; display: flex; gap: 15px; margin-left: auto; }
    .badge { background: #323232; padding: 2px 6px; border-radius: 3px; border: 1px solid #444; }
    .badge-pid.active { color: var(--color-info); border-color: rgba(57, 192, 57, 0.4); }

    .log-container { flex: 1; overflow: auto; padding: 10px; background-color: var(--bg-color); }
    .log-table { width: 100%; border-collapse: collapse; }
    .log-row { display: flex; border-bottom: 1px solid #2e2e2e; padding: 2px 0; white-space: pre-wrap; word-break: break-all; }
    .log-row:hover { background-color: #323232; }

    .col-time { width: 165px; color: #808080; flex-shrink: 0; }
    .col-pid { width: 90px; color: #7f8c8d; flex-shrink: 0; text-align: right; padding-right: 10px; }
    .col-level { width: 25px; text-align: center; font-weight: bold; flex-shrink: 0; margin-right: 10px; }
    .col-tag { width: 150px; color: #9876aa; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 10px; }
    .col-message { flex: 1; color: #a9b7c6; }

    .level-V { color: var(--color-verbose); }
    .level-V .col-level { background: #3c3f41; }
    .level-D { color: var(--color-debug); }
    .level-D .col-level { background: #223c5a; }
    .level-I { color: var(--color-info); }
    .level-I .col-level { background: #204120; }
    .level-W { color: var(--color-warning); }
    .level-W .col-level { background: #4a3c10; }
    .level-E { color: var(--color-error); }
    .level-E .col-level { background: #4a1d1d; }
    .level-F { color: #ffffff; font-weight: bold; }
    .level-F .col-level { background: var(--color-fatal); }
    .level-raw { color: #888888; }

    .status-bar {
      background-color: var(--panel-bg);
      border-top: 1px solid var(--border-color);
      height: 24px;
      display: flex;
      align-items: center;
      padding: 0 12px;
      font-size: 11px;
      color: #808080;
    }
  </style>
</head>
<body>
  <div class="filter-bar">
    <button id="btnStart" class="btn btn-start" onclick="startListening()">开始监听</button>
    <button id="btnStop" class="btn btn-stop" onclick="stopListening()" disabled>停止</button>
    <button id="btnClear" class="btn" onclick="clearLogs()">清空</button>
    
    <div class="input-group">
      <label>应用包名:</label>
      <input id="inputPkg" type="text" class="input-control" placeholder="com.example.app" onchange="onPackageNameChange()">
    </div>

    <div class="input-group">
      <label>最低等级:</label>
      <select id="selectLevel" class="select-control" onchange="applyFilters()">
        <option value="V">Verbose (V)</option>
        <option value="D">Debug (D)</option>
        <option value="I">Info (I)</option>
        <option value="W">Warn (W)</option>
        <option value="E">Error (E)</option>
        <option value="F">Fatal (F)</option>
      </select>
    </div>

    <div class="input-group">
      <label>关键词检索:</label>
      <input id="inputSearch" type="text" class="input-control" placeholder="支持正则" oninput="applyFilters()">
    </div>

    <div class="status-panel">
      <span id="deviceBadge" class="badge">未连接设备</span>
      <span id="pidBadge" class="badge badge-pid">PID: -</span>
    </div>
  </div>

  <div id="logContainer" class="log-container">
    <div id="logTable" class="log-table"></div>
  </div>

  <div class="status-bar">
    <span id="lineCounter">当前展示: 0 行 (最高 1500)</span>
    <label style="margin-left:15px; cursor:pointer"><input id="chkScroll" type="checkbox" checked> 自动滚动</label>
  </div>

  <script>
    const { ipcRenderer } = require('electron');
    const MAX_DOM_LINES = 1500;
    let rawLogs = [];
    let logIdCounter = 0;
    let trackedPid = '';
    const LEVEL_HIERARCHY = { 'V': 0, 'D': 1, 'I': 2, 'W': 3, 'E': 4, 'F': 5 };
    const THREADTIME_REGEX = /^(\\d{2}-\\d{2}\\s\\d{2}:\\d{2}:\\d{2}\\.\\d{3})\\s+(\\d+)\\s+(\\d+)\\s+([VDIWEF])\\s+(.*?):\\s(.*)$/;

    ipcRenderer.on('devices-list', (event, d) => {
      document.getElementById('deviceBadge').textContent = d.length ? '设备在线: ' + d[0] : '未连接设备';
    });

    ipcRenderer.on('pid-updated', (event, data) => {
      trackedPid = data.pid;
      document.getElementById('pidBadge').textContent = trackedPid ? 'PID: ' + trackedPid : 'PID: -';
      applyFilters();
    });

    ipcRenderer.on('log-data', (event, chunk) => {
      chunk.split('\\n').forEach(line => {
        if (!line.trim()) return;
        const match = line.match(THREADTIME_REGEX);
        const parsed = match ? {
          id: ++logIdCounter, isRaw: false, time: match[1], pid: match[2].trim(), tid: match[3].trim(), level: match[4], tag: match[5].trim(), msg: match[6], rawText: line
        } : { id: ++logIdCounter, isRaw: true, level: 'I', rawText: line };
        
        rawLogs.push(parsed);
        if (matchesFilter(parsed)) appendDomRow(parsed);
      });
      trimBuffer();
    });

    function startListening() {
      ipcRenderer.send('control-adb', 'start');
      onPackageNameChange();
      document.getElementById('btnStart').disabled = true;
      document.getElementById('btnStop').disabled = false;
    }

    function stopListening() {
      ipcRenderer.send('control-adb', 'stop');
      document.getElementById('btnStart').disabled = false;
      document.getElementById('btnStop').disabled = true;
    }

    function clearLogs() {
      rawLogs = [];
      document.getElementById('logTable').innerHTML = '';
    }

    function onPackageNameChange() {
      const pkg = document.getElementById('inputPkg').value.trim();
      ipcRenderer.send('control-adb', pkg ? 'track-pid' : 'stop-track-pid', pkg);
    }

    function matchesFilter(log) {
      const minLevel = document.getElementById('selectLevel').value;
      if (LEVEL_HIERARCHY[log.level] < LEVEL_HIERARCHY[minLevel]) return false;
      if (document.getElementById('inputPkg').value.trim() && trackedPid && log.pid !== trackedPid) return false;
      const search = document.getElementById('inputSearch').value.trim();
      if (search && !log.rawText.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    }

    function getTagColor(tag) {
      const colors = [
        '#9876aa', // 紫色 (Lavender)
        '#4ec9b0', // 薄荷绿 (Mint)
        '#c586c0', // 粉紫 (Magenta)
        '#4fc1ff', // 天蓝 (Light Blue)
        '#dcdcaa', // 柔黄 (Soft Yellow)
        '#ce9178', // 珊瑚橙 (Coral)
        '#85e89d', // 浅绿 (Pale Green)
        '#79b8ff', // 亮蓝 (Bright Blue)
        '#b39ddb', // 紫罗兰 (Violet)
        '#ffab70', // 暖橙 (Warm Orange)
      ];
      if (!tag) return colors[0];
      let hash = 0;
      for (let i = 0; i < tag.length; i++) {
        hash = tag.charCodeAt(i) + ((hash << 5) - hash);
      }
      const index = Math.abs(hash) % colors.length;
      return colors[index];
    }

    function formatTimeWithYear(time) {
      if (!time) return '';
      if (/^\d{4}-/.test(time)) return time;
      const year = new Date().getFullYear();
      return year + '-' + time;
    }

    function appendDomRow(log) {
      const row = document.createElement('div');
      row.className = 'log-row level-' + log.level;
      if (log.isRaw) {
        row.innerHTML = linkify(escapeHtml(log.rawText));
      } else {
        row.innerHTML = \`<div class="col-time">\${formatTimeWithYear(log.time)}</div>
                        <div class="col-pid">\${log.pid}-\${log.tid}</div>
                        <div class="col-level">\${log.level}</div>
                        <div class="col-tag" style="color: \${getTagColor(log.tag)}">\${log.tag}</div>
                        <div class="col-message">\${linkify(escapeHtml(log.msg))}</div>\`;
      }
      document.getElementById('logTable').appendChild(row);
      if (document.getElementById('btnStart').disabled && document.getElementById('chkScroll').checked) {
        const c = document.getElementById('logContainer');
        c.scrollTop = c.scrollHeight;
      }
    }

    function trimBuffer() {
      const t = document.getElementById('logTable');
      while (t.children.length > MAX_DOM_LINES) t.removeChild(t.firstChild);
    }

    function applyFilters() {
      document.getElementById('logTable').innerHTML = '';
      rawLogs.filter(matchesFilter).forEach(appendDomRow);
    }

    function linkify(str) {
      if (!str) return '';
      const urlRegex = /(https?:\/\/[^\s<>\"]+)/g;
      return str.replace(urlRegex, function(url) {
        return \`<a href="\${url}" target="_blank" rel="noopener noreferrer" style="color: #589df6; text-decoration: underline; cursor: pointer;">\${url}</a>\`;
      });
    }

    function escapeHtml(str) {
      if (!str) return '';
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }
  </script>
</body>
</html>`
  };

  const handleCopyCode = (code: string, fileName: string) => {
    navigator.clipboard.writeText(code);
    setCopiedFile(fileName);
    setTimeout(() => {
      setCopiedFile(null);
    }, 2000);
  };

  return (
    <div id="main-app" className="flex flex-col h-screen bg-[#2b2b2b] text-[#a9b7c6] select-none font-sans overflow-hidden">
      
      {/* Top Banner (Header) styled like Android Studio Header */}
      <header className="flex items-center justify-between h-10 px-4 bg-[#3c3f41] border-b border-[#323232] shrink-0 z-10">
        <div className="flex items-center gap-2">
          <Terminal size={16} className="text-[#39c039]" />
          <h1 className="font-semibold text-xs text-[#bbbbbb] tracking-wider uppercase font-mono">
            Android Logcat Viewer
          </h1>
          <span className="text-[10px] bg-[#2b2b2b] text-[#888888] px-2 py-0.5 rounded-full border border-[#444] ml-2">
            v1.0.0 (Darcula Core)
          </span>
        </div>

        {/* Navigation Tabs */}
        <div className="flex h-full">
          <button 
            id="tab-console"
            onClick={() => setActiveTab('console')}
            className={`flex items-center gap-1.5 px-4 text-xs font-medium border-b-2 transition-all cursor-pointer ${
              activeTab === 'console' 
                ? 'border-[#39c039] text-[#ffffff] bg-[#2b2b2b]' 
                : 'border-transparent text-[#888888] hover:text-[#bbbbbb] hover:bg-[#323232]'
            }`}
          >
            <Cpu size={13} />
            Logcat 控制台
          </button>
          <button 
            id="tab-code"
            onClick={() => setActiveTab('code')}
            className={`flex items-center gap-1.5 px-4 text-xs font-medium border-b-2 transition-all cursor-pointer ${
              activeTab === 'code' 
                ? 'border-[#39c039] text-[#ffffff] bg-[#2b2b2b]' 
                : 'border-transparent text-[#888888] hover:text-[#bbbbbb] hover:bg-[#323232]'
            }`}
          >
            <FileCode size={13} />
            Electron 源码包
          </button>
          <button 
            id="tab-guide"
            onClick={() => setActiveTab('guide')}
            className={`flex items-center gap-1.5 px-4 text-xs font-medium border-b-2 transition-all cursor-pointer ${
              activeTab === 'guide' 
                ? 'border-[#39c039] text-[#ffffff] bg-[#2b2b2b]' 
                : 'border-transparent text-[#888888] hover:text-[#bbbbbb] hover:bg-[#323232]'
            }`}
          >
            <HelpCircle size={13} />
            配置与运行指南
          </button>
        </div>

        {/* Quick Statistics Badge */}
        <div className="flex items-center gap-3 text-[11px] text-[#888888]">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${isStreaming ? 'bg-[#39c039] animate-pulse' : 'bg-red-500'}`} />
            <span>{isStreaming ? 'Live Stream Active' : 'Idle'}</span>
          </div>
        </div>
      </header>

      {/* Main Body Content based on active tab */}
      <main className="flex-1 flex overflow-hidden position-relative">
        
        <AnimatePresence mode="wait">
          {activeTab === 'console' && (
            <motion.div 
              id="view-console"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex-1 flex flex-row overflow-hidden w-full h-full"
            >
              {/* Left Main Stream Container */}
              <div className="flex-1 flex flex-col overflow-hidden bg-[#2b2b2b]">
                
                {/* 1. Android Studio Style Filter Bar */}
                <div className="flex flex-wrap items-center gap-3 p-2 bg-[#3c3f41] border-b border-[#323232] shrink-0 text-xs">
                  
                  {/* Stream Control Buttons */}
                  <div className="flex items-center gap-1 border-r border-[#4e5153] pr-3 shrink-0">
                    <button
                      id="btn-start"
                      onClick={() => startStream(true)}
                      disabled={isStreaming}
                      className={`flex items-center gap-1 px-2 py-1 rounded hover:bg-[#4e5254] text-[11px] font-sans cursor-pointer transition-colors ${
                        isStreaming ? 'text-[#59a869]/40 opacity-40 cursor-not-allowed' : 'text-[#59a869]'
                      }`}
                      title="清空缓存并重新开始 ADB 日志捕获"
                    >
                      <Play size={10} fill="currentColor" />
                      开始监听
                    </button>
                    <button
                      id="btn-stop"
                      onClick={stopStream}
                      disabled={!isStreaming}
                      className={`flex items-center gap-1 px-2 py-1 rounded hover:bg-[#4e5254] text-[11px] font-sans cursor-pointer transition-colors ${
                        !isStreaming ? 'text-[#db5856]/40 opacity-40 cursor-not-allowed' : 'text-[#db5856]'
                      }`}
                      title="停止抓取"
                    >
                      <Square size={10} fill="currentColor" />
                      停止
                    </button>
                    <button
                      id="btn-clear"
                      onClick={clearConsole}
                      className="flex items-center gap-1 px-2 py-1 rounded hover:bg-[#4e5254] text-[#9a9a9a] hover:text-white text-[11px] font-sans cursor-pointer transition-colors"
                      title="清空控制台日志"
                    >
                      <Trash2 size={11} />
                      清空
                    </button>
                    <button
                      id="btn-export"
                      onClick={exportLogs}
                      disabled={filteredLogs.length === 0}
                      className={`flex items-center gap-1 px-2 py-1 rounded hover:bg-[#4e5254] text-[11px] font-sans cursor-pointer transition-colors ${
                        filteredLogs.length === 0 
                          ? 'text-[#9a9a9a]/40 opacity-40 cursor-not-allowed' 
                          : 'text-[#9a9a9a] hover:text-white'
                      }`}
                      title="导出当前筛选的日志为文本文件"
                    >
                      <Download size={11} />
                      导出
                    </button>
                    <button
                      id="btn-settings"
                      onClick={() => setShowSettingsModal(true)}
                      className="flex items-center gap-1 px-2 py-1 rounded hover:bg-[#4e5254] text-[#9a9a9a] hover:text-white text-[11px] font-sans cursor-pointer transition-colors"
                      title="自定义行高、字号与日志颜色"
                    >
                      <Settings size={11} />
                      设置
                    </button>
                  </div>

                   {/* Unified Device Selector */}
                  <div className="flex items-center gap-1.5 border-r border-[#4e5153] pr-3 shrink-0">
                    <span className="text-[#888888] text-[11px] font-mono flex items-center gap-1">
                      <Smartphone size={11} className="text-[#39c039]" />
                      设备选择:
                    </span>
                    <select
                      id="select-device"
                      value={selectedDevice}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedDevice(val);
                        const newMode = val.startsWith('sim-') ? 'simulated' : 'real';
                        setMode(newMode);
                      }}
                      className="bg-[#45494a] border border-[#646464] text-white px-2 py-0.5 rounded text-[11px] font-mono outline-none cursor-pointer max-w-[180px] focus:border-[#3b82f6]"
                    >
                      <optgroup label="模拟调试设备 (Virtual)" className="bg-[#3c3f41] text-[#888]">
                        <option value="sim-pixel8" className="text-white bg-[#2b2b2b]">Google Pixel 8 Pro (8HGX249FA81039) Android 14, API 34</option>
                        <option value="sim-emulator" className="text-white bg-[#2b2b2b]">Android SDK Emulator (emulator-5554) Android 13, API 33</option>
                        <option value="sim-s24" className="text-white bg-[#2b2b2b]">Samsung Galaxy S24 Ultra (SAMSUNG_S24_ULTRA_01) Android 14, API 34</option>
                      </optgroup>
                      
                      {devices.length > 0 && (
                        <optgroup label="物理连接设备 (Real ADB)" className="bg-[#3c3f41] text-[#888]">
                          {devices.map(d => {
                            const verInfo = d.release && d.sdk ? ` Android ${d.release}, API ${d.sdk}` : '';
                            return (
                              <option key={d.id} value={d.id} className="text-white bg-[#2b2b2b]">
                                {d.model} ({d.id}){verInfo} - {d.status === 'device' ? '在线' : '离线'}
                              </option>
                            );
                          })}
                        </optgroup>
                      )}
                      
                      {devices.length === 0 && (
                        <optgroup label="物理连接设备 (Real ADB)" className="bg-[#3c3f41] text-[#888]">
                          <option value="no-real-device" disabled className="text-[#666] bg-[#2b2b2b]">未检测到连接设备 (请在右侧查看指南)</option>
                        </optgroup>
                      )}
                    </select>
                  </div>

                  {/* App Package filtering & PID tracing */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#888888] text-[11px] font-mono">包名过滤:</span>
                    <div className="relative">
                      <input
                        id="input-package"
                        type="text"
                        placeholder="e.g. com.tencent.mm"
                        value={packageName}
                        onChange={(e) => setPackageName(e.target.value)}
                        list="react-packages-datalist"
                        className="bg-[#45494a] border border-[#646464] text-white px-2 py-0.5 rounded text-[11px] font-mono outline-none w-48 placeholder-[#666] focus:border-[#3b82f6]"
                      />
                      <datalist id="react-packages-datalist">
                        {samplePackages.map(p => (
                          <option key={p.pkg} value={p.pkg}>{p.name}</option>
                        ))}
                      </datalist>
                      {packageName && (
                        <button 
                          onClick={() => setPackageName('')}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#888888] hover:text-white font-bold cursor-pointer text-[10px]"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Level dropdown */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#888888] text-[11px] font-mono">最低等级:</span>
                    <select
                      id="select-min-level"
                      value={minLevel}
                      onChange={(e) => setMinLevel(e.target.value)}
                      className="bg-[#45494a] border border-[#646464] text-white px-2 py-0.5 rounded text-[11px] outline-none cursor-pointer focus:border-[#3b82f6]"
                    >
                      <option value="V">Verbose (V)</option>
                      <option value="D">Debug (D)</option>
                      <option value="I">Info (I)</option>
                      <option value="W">Warn (W)</option>
                      <option value="E">Error (E)</option>
                      <option value="F">Fatal (F)</option>
                    </select>
                  </div>

                  {/* Search Query Input */}
                  <div className="flex items-center gap-1.5 flex-1 max-w-xs">
                    <span className="text-[#888888] text-[11px] font-mono">检索内容:</span>
                    <div className="relative flex-1">
                      <input
                        id="input-search"
                        type="text"
                        placeholder="支持 Regex 检索 Tag 或信息"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-[#45494a] border border-[#646464] text-white pl-6 pr-2 py-0.5 rounded text-[11px] font-mono outline-none w-full placeholder-[#666] focus:border-[#3b82f6]"
                      />
                      <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#888888]" />
                    </div>
                  </div>

                  {/* Settings dropdown */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#888888] text-[11px]">缓冲区:</span>
                    <select
                      value={maxLines}
                      onChange={(e) => setMaxLines(Number(e.target.value))}
                      className="bg-[#45494a] border border-[#646464] text-white px-1.5 py-0.5 rounded text-[10px] outline-none cursor-pointer"
                    >
                      <option value="500">500行</option>
                      <option value="1500">1500行</option>
                      <option value="3000">3000行</option>
                    </select>
                  </div>

                </div>

                {/* 1.5 Column Headers */}
                <div 
                  className="flex bg-[#313335] text-[#909090] text-[11px] border-b border-[#323232] font-sans font-medium shrink-0 select-none items-center"
                  style={{ minWidth: `${colWidths.time + colWidths.pid + colWidths.level + colWidths.tag + colWidths.pkg + 300}px` }}
                >
                  <div 
                    style={{ width: `${colWidths.time}px` }} 
                    className="relative shrink-0 text-[#888] font-semibold px-2.5 py-1.5 border-r border-[#3c3f41] truncate flex items-center justify-between"
                  >
                    <span>时间 (Timestamp)</span>
                    <div 
                      onMouseDown={(e) => handleMouseDown(e, 'time')}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[#3b82f6]/60 active:bg-[#3b82f6] z-10"
                    />
                  </div>
                  <div 
                    style={{ width: `${colWidths.pid}px` }} 
                    className="relative shrink-0 text-right pr-3 text-[#88] font-semibold py-1.5 border-r border-[#3c3f41] truncate flex items-center justify-end"
                  >
                    <span>进程 PID-TID</span>
                    <div 
                      onMouseDown={(e) => handleMouseDown(e, 'pid')}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[#3b82f6]/60 active:bg-[#3b82f6] z-10"
                    />
                  </div>
                  <div 
                    style={{ width: `${colWidths.level}px` }} 
                    className="relative shrink-0 text-center text-[#88] font-semibold py-1.5 border-r border-[#3c3f41] truncate flex items-center justify-center mr-3"
                  >
                    <span>级</span>
                    <div 
                      onMouseDown={(e) => handleMouseDown(e, 'level')}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[#3b82f6]/60 active:bg-[#3b82f6] z-10"
                    />
                  </div>
                  <div 
                    style={{ width: `${colWidths.tag}px` }} 
                    className="relative shrink-0 pr-3 text-[#88] font-semibold py-1.5 border-r border-[#3c3f41] truncate flex items-center justify-between"
                  >
                    <span>标签 (Tag)</span>
                    <div 
                      onMouseDown={(e) => handleMouseDown(e, 'tag')}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[#3b82f6]/60 active:bg-[#3b82f6] z-10"
                    />
                  </div>
                  <div 
                    style={{ width: `${colWidths.pkg}px` }} 
                    className="relative shrink-0 pr-3 text-[#88] font-semibold py-1.5 border-r border-[#3c3f41] truncate flex items-center justify-between"
                  >
                    <span>包名 (Package)</span>
                    <div 
                      onMouseDown={(e) => handleMouseDown(e, 'pkg')}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[#3b82f6]/60 active:bg-[#3b82f6] z-10"
                    />
                  </div>
                  <div className="flex-grow text-[#88] font-semibold px-2.5 py-1.5 truncate">
                    日志内容 (Log Message)
                  </div>
                </div>

                {/* 2. Primary Log Display Area */}
                <div 
                  id="log-scroll-viewport"
                  ref={logContainerRef}
                  className="flex-1 overflow-auto p-1 font-mono text-[11px] leading-relaxed bg-[#1e1e1e]"
                >
                  <div style={{ minWidth: `${colWidths.time + colWidths.pid + colWidths.level + colWidths.tag + colWidths.pkg + 300}px` }}>
                    {filteredLogs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 text-[#888888]">
                        <SlidersHorizontal size={36} className="mb-3 opacity-30 animate-pulse" />
                        <p className="text-xs">未匹配到任何符合过滤条件的日志数据</p>
                        <p className="text-[11px] mt-1 opacity-60">
                          {isStreaming ? '当前监听进程正在后台生成数据，试着调整上方包名过滤或等级设置。' : '抓取已暂停，点击“开始监听”开启日志捕获。'}
                        </p>
                      </div>
                    ) : (
                      filteredLogs.map((log) => {
                        const { color: customColor, bg: customBg } = getLevelStyle(log.level);
                        const levelClass = log.level === 'F' ? 'font-bold text-white' : '';

                        if (log.isRaw) {
                          return (
                            <div 
                              key={log.id} 
                              className={`border-b border-[#2e2e2e]/40 break-all opacity-85 hover:bg-[#2d2d2d] px-2 font-mono ${levelClass}`}
                              style={{ 
                                color: customColor,
                                fontSize: `${fontSize}px`,
                                paddingTop: `${rowPadding}px`,
                                paddingBottom: `${rowPadding}px`,
                              }}
                            >
                              {renderTextWithLinks(log.rawText)}
                            </div>
                          );
                        }

                        const resolvedPkg = pidMap[log.pid] || '';

                        return (
                          <div 
                            key={log.id} 
                            className="flex items-center border-b border-[#2e2e2e]/40 hover:bg-[#2d2d2d] group transition-colors px-2"
                            style={{ 
                              paddingTop: `${rowPadding}px`, 
                              paddingBottom: `${rowPadding}px`,
                              fontSize: `${fontSize}px`
                            }}
                          >
                            {/* Timestamp */}
                            <span 
                              style={{ width: `${colWidths.time}px`, fontSize: `${fontSize}px` }} 
                              className="text-[#808080] shrink-0 font-mono pr-2.5 border-r border-[#2e2e2e]/40 truncate"
                            >
                              {formatTimeWithYear(log.time)}
                            </span>
                            
                            {/* PID-TID */}
                            <span 
                              style={{ width: `${colWidths.pid}px`, fontSize: `${fontSize}px` }} 
                              className="text-[#7f8c8d] shrink-0 font-mono text-right pr-3 truncate border-r border-[#2e2e2e]/40"
                            >
                              {log.pid}-{log.tid}
                            </span>

                            {/* Level Badge */}
                            <span 
                              style={{ 
                                width: `${colWidths.level}px`, 
                                fontSize: `${fontSize}px`,
                                backgroundColor: customBg,
                                color: log.level === 'F' ? '#ffffff' : customColor,
                              }} 
                              className="text-center shrink-0 font-mono font-bold rounded px-0.5 mr-3 border-r border-[#2e2e2e]/40 truncate"
                            >
                              {log.level}
                            </span>

                            {/* Tag */}
                            <span 
                              style={{ 
                                width: `${colWidths.tag}px`, 
                                fontSize: `${fontSize}px`, 
                                color: getTagColor(log.tag) 
                              }} 
                              className="shrink-0 truncate font-mono font-medium pr-3 border-r border-[#2e2e2e]/40" 
                              title={log.tag}
                            >
                              {log.tag}
                            </span>

                            {/* Package Name */}
                            <span 
                              style={{ width: `${colWidths.pkg}px`, fontSize: `${fontSize}px` }} 
                              className="text-[#bbbbbb] shrink-0 truncate font-mono pr-3 opacity-90 border-r border-[#2e2e2e]/40" 
                              title={resolvedPkg || '-'}
                            >
                              {resolvedPkg || '-'}
                            </span>

                            {/* Message */}
                            <span 
                              style={{ 
                                fontSize: `${fontSize}px`, 
                                color: customColor 
                              }} 
                              className={`flex-grow break-all font-mono pl-2.5 ${levelClass}`}
                            >
                              {renderTextWithLinks(log.msg)}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* 3. Terminal Control Bar Footer */}
                <div className="h-6 px-4 bg-[#3c3f41] border-t border-[#323232] flex items-center justify-between text-[11px] text-[#888888] shrink-0">
                  <div className="flex items-center gap-4">
                    <span id="line-counter">
                      显示行数: <strong className="text-[#bbbbbb]">{filteredLogs.length}</strong> / {logs.length} (缓存限制: {maxLines} 行)
                    </span>
                    <label className="flex items-center gap-1 cursor-pointer hover:text-[#bbbbbb]">
                      <input
                        type="checkbox"
                        checked={autoScroll}
                        onChange={(e) => setAutoScroll(e.target.checked)}
                        className="rounded bg-[#45494a] border-[#646464] text-[#39c039]"
                      />
                      自动滚动到底部
                    </label>
                  </div>
                  <div>
                    {isStreaming ? (
                      <span className="text-[#39c039] flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#39c039] animate-ping" />
                        数据流实时抓取中
                      </span>
                    ) : (
                      <span className="text-[#e2a007]">日志流暂关闭</span>
                    )}
                  </div>
                </div>

              </div>

              {/* Right Sidebar Control Column - AS Darcula Style settings */}
              <div className="w-[280px] border-l border-[#323232] bg-[#3c3f41] flex flex-col overflow-y-auto shrink-0 p-4 gap-4 text-xs">
                
                {/* Section A: Device Link settings */}
                <div className="flex flex-col gap-2 border-b border-[#323232] pb-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-[#ffffff] flex items-center gap-1 text-[11px] uppercase tracking-wider">
                      <Smartphone size={13} className="text-[#39c039]" />
                      调试设备配置
                    </h3>
                    <button 
                      onClick={fetchDevices} 
                      disabled={isFetchingDevices}
                      className="p-1 text-[#888888] hover:text-white rounded hover:bg-[#4b4d4d] cursor-pointer disabled:opacity-40"
                      title="刷新连接设备"
                    >
                      <RefreshCw size={12} className={isFetchingDevices ? 'animate-spin' : ''} />
                    </button>
                  </div>

                  <div className="mt-1 flex flex-col gap-1.5">
                    <label className="text-[#888888] text-[11px]">模式选择:</label>
                    <div className="grid grid-cols-2 gap-1 bg-[#2b2b2b] p-0.5 rounded border border-[#444]">
                      <button
                        onClick={() => handleModeChange('simulated')}
                        className={`py-1 rounded text-[10px] font-medium cursor-pointer transition-colors ${
                          mode === 'simulated' 
                            ? 'bg-[#3c3f41] text-white shadow-sm' 
                            : 'text-[#888888] hover:text-[#bbbbbb]'
                        }`}
                      >
                        模拟沙盒模式
                      </button>
                      <button
                        onClick={() => handleModeChange('real')}
                        className={`py-1 rounded text-[10px] font-medium cursor-pointer transition-colors ${
                          mode === 'real' 
                            ? 'bg-[#3c3f41] text-white shadow-sm' 
                            : 'text-[#888888] hover:text-[#bbbbbb]'
                        }`}
                      >
                        USB 真机模式
                      </button>
                    </div>
                  </div>

                  <div className="mt-2 text-[11px] bg-[#2b2b2b] p-2 rounded border border-[#323232] flex flex-col gap-1">
                    <span className="text-[#bbbbbb] font-semibold">
                      {mode === 'simulated' ? '✓ 高保真模拟服务已激活' : '⚡ 尝试挂载系统 ADB 进程'}
                    </span>
                    <span className="text-[#888888] leading-normal text-[10px]">
                      {mode === 'simulated' 
                        ? '由云端服务端进程输出各经典App线程与GC事件，便于在浏览器直接预览和调试筛选性能。'
                        : adbAvailable 
                          ? '已检测到本地 ADB！若设备连接，将触发 adb logcat 数据直连。'
                          : '未检测到容器内 ADB 守护。如果导出到本地使用 Electron 运行，将完美支持物理连接。'}
                    </span>
                  </div>
                </div>

                {/* Section B: Autocomplete packages shortcut */}
                <div className="flex flex-col gap-2 border-b border-[#323232] pb-4">
                  <h3 className="font-semibold text-[#ffffff] flex items-center gap-1 text-[11px] uppercase tracking-wider">
                    <SlidersHorizontal size={13} className="text-[#39c039]" />
                    预设包名快速追踪
                  </h3>
                  <div className="flex flex-col gap-1.5 mt-1">
                    {samplePackages.map((item) => (
                      <button
                        key={item.pkg}
                        onClick={() => {
                          setPackageName(item.pkg);
                        }}
                        className={`w-full text-left p-1.5 rounded border text-[11px] font-mono transition-all cursor-pointer flex justify-between items-center ${
                          packageName === item.pkg
                            ? 'bg-[#1e5a2f]/20 border-[#39c039] text-[#39c039]'
                            : 'bg-[#2b2b2b] border-[#444] text-[#bbbbbb] hover:border-[#646464] hover:text-white'
                        }`}
                      >
                        <div className="flex flex-col">
                          <span className="font-semibold text-[10px] text-[#888888]">{item.name}</span>
                          <span className="text-[11px]">{item.pkg}</span>
                        </div>
                        {packageName === item.pkg && (
                          <span className="text-[10px] bg-[#1e5a2f] text-white px-1 py-0.5 rounded scale-90">
                            已追踪
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  {packageName && (
                    <div className="mt-2 p-1.5 bg-[#2b2b2b] border border-[#444] rounded text-[11px] flex justify-between items-center">
                      <span className="text-[#888888]">当前解析 PID:</span>
                      <strong className={`font-mono text-xs ${trackedPid ? 'text-[#39c039]' : 'text-orange-400'}`}>
                        {trackedPid ? trackedPid : '未运行 (监测中)'}
                      </strong>
                    </div>
                  )}
                </div>

                {/* Section C: Live Interactive Sandbox triggers */}
                {mode === 'simulated' && (
                  <div className="flex flex-col gap-2.5">
                    <h3 className="font-semibold text-[#ffffff] flex items-center gap-1 text-[11px] uppercase tracking-wider">
                      <Sparkles size={13} className="text-[#39c039]" />
                      沙盒动态事件触发器
                    </h3>
                    <p className="text-[10px] text-[#888888] leading-normal">
                      你可以随意模拟被追踪 App 的冷启动或发生崩溃异常，观察日志输出、PID 重启更新和 Darcula 级别渲染。
                    </p>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <button
                        onClick={() => triggerSimulatedAction('cold_start')}
                        className="py-1.5 px-2 bg-[#2b2b2b] hover:bg-[#323232] border border-[#555] rounded text-white font-medium text-[11px] text-center cursor-pointer transition-colors flex flex-col items-center justify-center gap-1"
                      >
                        <span className="text-[10px] text-[#888888]">模拟进程</span>
                        <span>冷启动 🚀</span>
                      </button>
                      <button
                        onClick={() => triggerSimulatedAction('crash')}
                        className="py-1.5 px-2 bg-[#4a1d1d] hover:bg-[#5f2525] border border-red-800 rounded text-red-200 font-medium text-[11px] text-center cursor-pointer transition-colors flex flex-col items-center justify-center gap-1"
                      >
                        <span className="text-[10px] text-red-300">强制触发</span>
                        <span>Java 闪退 💥</span>
                      </button>
                    </div>
                    {packageName && (
                      <span className="text-[10px] text-[#888888] italic text-center mt-0.5">
                        操作将针对: {packageName}
                      </span>
                    )}
                  </div>
                )}

              </div>
            </motion.div>
          )}

          {showSettingsModal && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in font-sans">
              <div className="bg-[#3c3f41] border border-[#555] rounded shadow-2xl w-[480px] text-white flex flex-col overflow-hidden">
                {/* Header */}
                <div className="bg-[#2f3132] px-4 py-2.5 border-b border-[#323232] flex justify-between items-center select-none">
                  <span className="text-xs font-semibold text-[#bbbbbb] flex items-center gap-1.5">
                    <Settings size={13} />
                    日志查看器显示与颜色自定义设置 (Logcat Display Settings)
                  </span>
                  <button 
                    onClick={() => setShowSettingsModal(false)}
                    className="text-[#888888] hover:text-white font-bold cursor-pointer text-sm"
                  >
                    ×
                  </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4 max-h-[400px] overflow-y-auto text-xs">
                  {/* Section 1 */}
                  <div className="space-y-3">
                    <h3 className="text-[#a9b7c6] font-semibold border-b border-[#4d4d4d] pb-1">排版与行高 (Typography & Spacing)</h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[#909090] block">字体大小 (Font Size): {fontSize}px</label>
                        <input 
                          type="range" 
                          min="9" 
                          max="16" 
                          value={fontSize} 
                          onChange={(e) => setFontSize(Number(e.target.value))}
                          className="w-full accent-[#3b82f6] cursor-pointer" 
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[#909090] block">上下内边距 (Padding): {rowPadding}px</label>
                        <input 
                          type="range" 
                          min="0" 
                          max="10" 
                          value={rowPadding} 
                          onChange={(e) => setRowPadding(Number(e.target.value))}
                          className="w-full accent-[#3b82f6] cursor-pointer" 
                        />
                      </div>
                    </div>
                  </div>

                  {/* Section 2 */}
                  <div className="space-y-3">
                    <h3 className="text-[#a9b7c6] font-semibold border-b border-[#4d4d4d] pb-1">级别颜色配置 (Log Level Colors)</h3>
                    
                    <div className="space-y-2">
                      <div className="grid grid-cols-3 gap-2 text-center text-[#909090] font-medium border-b border-[#3c3f41] pb-1">
                        <span>日志级别</span>
                        <span>前景色 (Text)</span>
                        <span>背景色 (Badge)</span>
                      </div>

                      {['V', 'D', 'I', 'W', 'E', 'F'].map((lvl) => {
                        const label = lvl === 'V' ? 'Verbose (V)' :
                                      lvl === 'D' ? 'Debug (D)' :
                                      lvl === 'I' ? 'Info (I)' :
                                      lvl === 'W' ? 'Warn (W)' :
                                      lvl === 'E' ? 'Error (E)' : 'Fatal (F)';
                        return (
                          <div key={lvl} className="grid grid-cols-3 gap-2 items-center">
                            <span className="font-mono font-semibold text-[#bbbbbb]">{label}</span>
                            
                            <div className="flex items-center gap-1.5 justify-center">
                              <input 
                                type="color" 
                                value={levelColors[lvl as keyof typeof levelColors]} 
                                onChange={(e) => setLevelColors(prev => ({ ...prev, [lvl]: e.target.value }))}
                                className="w-6 h-5 border border-[#555] rounded cursor-pointer bg-transparent"
                              />
                              <span className="font-mono text-[10px] text-[#888]">{levelColors[lvl as keyof typeof levelColors]}</span>
                            </div>

                            <div className="flex items-center gap-1.5 justify-center">
                              <input 
                                type="color" 
                                value={levelBgs[lvl as keyof typeof levelBgs]} 
                                onChange={(e) => setLevelBgs(prev => ({ ...prev, [lvl]: e.target.value }))}
                                className="w-6 h-5 border border-[#555] rounded cursor-pointer bg-transparent"
                              />
                              <span className="font-mono text-[10px] text-[#888]">{levelBgs[lvl as keyof typeof levelBgs]}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="bg-[#2f3132] px-4 py-2.5 border-t border-[#323232] flex justify-between items-center">
                  <button 
                    onClick={() => {
                      setFontSize(11);
                      setRowPadding(2);
                      setColWidths({
                        time: 165,
                        pid: 95,
                        level: 30,
                        tag: 160,
                        pkg: 180,
                      });
                      setLevelColors({
                        V: '#808080',
                        D: '#3582e1',
                        I: '#39c039',
                        W: '#e2a007',
                        E: '#e53e3e',
                        F: '#ff3e3e',
                      });
                      setLevelBgs({
                        V: '#3c3f41',
                        D: '#223c5a',
                        I: '#204120',
                        W: '#4a3c10',
                        E: '#4a1d1d',
                        F: '#ff0000',
                      });
                    }}
                    className="px-3 py-1 bg-[#4b4e50] hover:bg-[#5b5e60] text-white rounded cursor-pointer border border-[#646464] transition-colors"
                  >
                    恢复默认 (Reset)
                  </button>
                  
                  <button 
                    onClick={() => setShowSettingsModal(false)}
                    className="px-4 py-1 bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded font-medium cursor-pointer transition-colors"
                  >
                    关闭 (Close)
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'code' && (
            <motion.div 
              id="view-code"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex-1 flex flex-col overflow-hidden w-full h-full p-4 bg-[#2b2b2b]"
            >
              <div className="mb-3 flex justify-between items-center shrink-0">
                <div>
                  <h2 className="text-[#ffffff] text-sm font-semibold flex items-center gap-1.5">
                    <Code size={16} className="text-[#39c039]" />
                    本地 Electron 项目完整源码
                  </h2>
                  <p className="text-[#888888] text-xs mt-0.5">
                    我们已在 workspace 的 <code className="text-[#39c039] bg-[#242424] px-1 py-0.5 rounded font-mono">/electron-project/</code> 目录中生成了如下三个随时可执行的完美文件。
                  </p>
                </div>
                
                {/* Source File tabs selector */}
                <div className="flex bg-[#3c3f41] p-0.5 rounded border border-[#323232] text-xs">
                  <button
                    onClick={() => setSelectedFileTab('html')}
                    className={`px-3 py-1 rounded transition-colors font-mono text-[11px] cursor-pointer ${
                      selectedFileTab === 'html' ? 'bg-[#2b2b2b] text-white font-semibold' : 'text-[#888888] hover:text-[#bbbbbb]'
                    }`}
                  >
                    index.html
                  </button>
                  <button
                    onClick={() => setSelectedFileTab('main')}
                    className={`px-3 py-1 rounded transition-colors font-mono text-[11px] cursor-pointer ${
                      selectedFileTab === 'main' ? 'bg-[#2b2b2b] text-white font-semibold' : 'text-[#888888] hover:text-[#bbbbbb]'
                    }`}
                  >
                    main.js
                  </button>
                  <button
                    onClick={() => setSelectedFileTab('package')}
                    className={`px-3 py-1 rounded transition-colors font-mono text-[11px] cursor-pointer ${
                      selectedFileTab === 'package' ? 'bg-[#2b2b2b] text-white font-semibold' : 'text-[#888888] hover:text-[#bbbbbb]'
                    }`}
                  >
                    package.json
                  </button>
                </div>
              </div>

              {/* Code Panel Display Box */}
              <div className="flex-1 border border-[#323232] rounded bg-[#242424] overflow-hidden flex flex-col position-relative">
                <div className="h-9 bg-[#2d2d2d] border-b border-[#323232] flex items-center justify-between px-4 shrink-0">
                  <span className="font-mono text-xs text-[#a9b7c6] flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#39c039]" />
                    {selectedFileTab === 'package' ? 'package.json' : selectedFileTab === 'main' ? 'main.js' : 'index.html'}
                  </span>
                  
                  <button
                    onClick={() => handleCopyCode(electronFiles[selectedFileTab], selectedFileTab)}
                    className="flex items-center gap-1 text-[11px] bg-[#3c3f41] hover:bg-[#4e5153] text-[#bbbbbb] hover:text-white px-2.5 py-1 rounded transition-colors cursor-pointer border border-[#444]"
                  >
                    {copiedFile === selectedFileTab ? (
                      <>
                        <Check size={11} className="text-[#39c039]" />
                        <span>已复制到剪切板!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={11} />
                        <span>复制代码</span>
                      </>
                    )}
                  </button>
                </div>

                <pre className="flex-1 overflow-auto p-4 font-mono text-xs text-[#bbbbbb] leading-relaxed select-text bg-[#1e1e1e]">
                  <code>{electronFiles[selectedFileTab]}</code>
                </pre>
              </div>
            </motion.div>
          )}

          {activeTab === 'guide' && (
            <motion.div 
              id="view-guide"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex-1 overflow-y-auto p-6 bg-[#2b2b2b] text-[#bbbbbb] leading-relaxed text-xs"
            >
              <div className="max-w-3xl mx-auto flex flex-col gap-6">
                <div>
                  <h2 className="text-white text-base font-semibold border-b border-[#3c3f41] pb-2 flex items-center gap-2">
                    <Monitor size={18} className="text-[#39c039]" />
                    如何打包与本地运行你的 Android Logcat 查看器？
                  </h2>
                  <p className="mt-2 text-xs text-[#888888]">
                    由于本系统是运行在云端服务器上的 Web 应用，浏览器处于沙箱环境，无法通过 USB 连接你本地的手持 Android 物理设备。因此，我们专门为您编写了可以本地原生运行的 Electron 桌面客户端代码。请按照以下三个简单步骤，一分钟在您的电脑上跑起来：
                  </p>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="flex gap-4">
                    <span className="w-6 h-6 shrink-0 rounded-full bg-[#39c039]/10 text-[#39c039] font-mono font-bold flex items-center justify-center border border-[#39c039]/30">
                      1
                    </span>
                    <div>
                      <h3 className="text-white font-semibold text-xs">拷贝项目代码文件</h3>
                      <p className="text-[11px] text-[#888888] mt-0.5">
                        在本地电脑上新建一个空目录（例如 <code className="bg-[#3c3f41] text-[#bbbbbb] px-1 rounded">logcat-app</code>），然后在该目录下创建三个文件，并将上方“Electron 源码包”标签页中的代码分别贴入：
                      </p>
                      <ul className="list-disc list-inside text-[11px] text-[#888888] mt-1 space-y-0.5 pl-2">
                        <li><strong className="text-white">package.json</strong>：包含启动依赖及 electron 包声明。</li>
                        <li><strong className="text-white">main.js</strong>：负责 Electron 主进程生命周期管理以及后台 ADB 底层进程的拉起和杀死。</li>
                        <li><strong className="text-white">index.html</strong>：高品质 Android Studio Darcula 经典主题的解析渲染器。</li>
                      </ul>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <span className="w-6 h-6 shrink-0 rounded-full bg-[#39c039]/10 text-[#39c039] font-mono font-bold flex items-center justify-center border border-[#39c039]/30">
                      2
                    </span>
                    <div>
                      <h3 className="text-white font-semibold text-xs">安装依赖并启动 Electron</h3>
                      <p className="text-[11px] text-[#888888] mt-0.5">
                        在项目目录下打开终端（Terminal），依次执行以下两行简单的命令：
                      </p>
                      <pre className="bg-[#242424] border border-[#323232] p-3 rounded font-mono text-[11px] text-white mt-1.5 select-text overflow-x-auto">
                        {`# 安装 Electron 运行容器 (如慢可加参数 --registry=https://registry.npmmirror.com)
npm install

# 启动 Logcat 查看器
npm start`}
                      </pre>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <span className="w-6 h-6 shrink-0 rounded-full bg-[#39c039]/10 text-[#39c039] font-mono font-bold flex items-center justify-center border border-[#39c039]/30">
                      3
                    </span>
                    <div>
                      <h3 className="text-white font-semibold text-xs">连接手机并开启调试</h3>
                      <p className="text-[11px] text-[#888888] mt-0.5">
                        确保本地电脑已安装 ADB（Android Debug Bridge）并且将其加入了系统环境变量，然后：
                      </p>
                      <ul className="list-decimal list-inside text-[11px] text-[#888888] mt-1 space-y-1 pl-2">
                        <li>在手机的“设置” -&gt; “关于手机”连续点击 7 次“版本号”以开启“开发者选项”。</li>
                        <li>进入“开发者选项”，找到并开启“<strong className="text-white">USB 调试</strong>”开关。</li>
                        <li>用 USB 线将手机连接电脑，并在手机弹出的“允许 USB 调试”询问框中选择“一律允许”。</li>
                        <li>Electron 应用将自动监测到您的设备连接。输入你的 App 包名即可进行不丢包冷启动日志过滤追踪！</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="bg-[#2a3036] border-l-4 border-blue-500 p-4 rounded text-xs mt-2 text-[#a9b7c6]">
                  <h4 className="font-semibold text-white flex items-center gap-1.5 mb-1 text-[11px] uppercase tracking-wider">
                    <AlertTriangle size={14} className="text-blue-400" />
                    核心实现技术细节解析
                  </h4>
                  <p className="text-[11px] text-[#888888] leading-normal mt-1">
                    <strong>1. 为什么采用 threadtime 格式？</strong><br />
                    标准的 <code className="text-[#39c039]">adb logcat -v threadtime</code> 包含了日期、微秒级时间戳、PID、TID、Level、Tag、Message。这使得我们在渲染进程（Renderer）中可以通过一套超轻量的正则表达式精准解析出各字段，在前端实现与 Android Studio 100% 吻合的多栏栅格化对齐布局，并按等级着色。
                  </p>
                  <p className="text-[11px] text-[#888888] leading-normal mt-2">
                    <strong>2. 自动滚动与滚动性能池:</strong><br />
                    在大吞吐量（如主板快速打印 GC 或触控刷新）下，海量 DOM 节点会产生渲染瓶颈。因此，本应用设定了可配的滚动性能控制，当行数多于 1500 行时，自动剔除最老的 DOM 节点，保障高吞吐下的无滞后平滑渲染。
                  </p>
                  <p className="text-[11px] text-[#888888] leading-normal mt-2">
                    <strong>3. 实时 PID 动态轮询的必要性:</strong><br />
                    在真机上开发时，由于 Crash 或重刷覆盖，应用 PID 往往瞬间改变。如果只在初始化时获取一次 PID，就无法抓取到冷启动或崩溃重启时的现场日志。通过在后台进程中进行每 1.5 秒的极速轮询，并发送至前台，可以实现对包名对应 PID 的动态全生命周期追踪。
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </main>
    </div>
  );
}
