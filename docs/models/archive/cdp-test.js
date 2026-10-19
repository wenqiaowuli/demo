#!/usr/bin/env node
// CDP 交互验证：逐页测试 开始/暂停/倍速 切换
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PAGES = [
  'apparent-weight-demo.html',
  'free-fall-motion.html',
  'vertical-throw-demo.html',
  'horizontal-linear-motion.html',
  'oblique-throw-motion.html',
  'block-plate.html',
  'force-composition-demo.html',
  'force-equilibrium-demo.html',
  'horizontal-conveyor-belt.html',
  'inclined-conveyor-belt.html',
  'spring-vs-rope-demo.html',
  'chasing-meeting-model.html', // 参照页
];

const PORT = 8765;
const CDP_PORT = 9222;
const WORK_DIR = '/home/wq/physics-work';
const TIMEOUT_MS = 15000;

// 简易 WebSocket 客户端（Node v24 内置 WebSocket）
async function wsConnect(url) {
  const ws = new WebSocket(url);
  return new Promise((resolve, reject) => {
    ws.onopen = () => resolve(ws);
    ws.onerror = (e) => reject(new Error('WS error: ' + e.message));
    setTimeout(() => reject(new Error('WS connect timeout')), 5000);
  });
}

// CDP 调用封装
let msgId = 0;
function cdpSend(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    const handler = (data) => {
      try {
        const resp = JSON.parse(data.toString());
        if (resp.id === id) {
          ws.off('message', handler);
          if (resp.error) reject(new Error(`CDP error: ${resp.error.message}`));
          else resolve(resp.result);
        }
      } catch (e) {}
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => reject(new Error('CDP timeout')), TIMEOUT_MS);
  });
}

// 启动静态服务器
function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let file = req.url.split('?')[0];
      if (file === '/') file = '/index.html';
      const filePath = path.join(WORK_DIR, file);
      const ext = path.extname(filePath);
      const mimeTypes = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.png': 'image/png',
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
        } else {
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(data);
        }
      });
    });
    server.listen(PORT, () => resolve(server));
  });
}

// 启动 headless shell
function startHeadless() {
  const env = { ...process.env };
  env.LD_LIBRARY_PATH = '/tmp/debroot/usr/lib/x86_64-linux-gnu';
  return spawn('/tmp/debroot/opt/google/chrome-headless-shell/chrome-headless-shell', [
    '--headless',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    `--remote-debugging-port=${CDP_PORT}`,
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-translate',
    '--disable-sync',
  ], { env, stdio: ['ignore', 'pipe', 'pipe'] });
}

// 获取 CDP WebSocket URL
async function getCdpWsUrl() {
  for (let i = 0; i < 20; i++) {
    try {
      const resp = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${CDP_PORT}/json/version`, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
      });
      return resp.webSocketDebuggerUrl;
    } catch (e) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error('CDP not ready');
}

// 测试单个页面
async function testPage(ws, page, idx) {
  const url = `http://127.0.0.1:${PORT}/${page}`;
  console.log(`\n[${idx + 1}/${PAGES.length}] ${page}`);
  
  // 导航到页面
  await cdpSend(ws, 'Page.navigate', { url });
  await new Promise((r) => setTimeout(r, 800)); // 等待页面加载
  
  // 获取页面内容检查元素
  const { result: docResult } = await cdpSend(ws, 'DOM.getDocument');
  const root = docResult.root;
  
  // 查找开始按钮
  const { nodeIds: startBtns } = await cdpSend(ws, 'DOM.querySelectorAll', {
    nodeId: root.nodeId,
    selector: '#startBtn, button:has-text("开始")',
  });
  
  // 用 JavaScript 检查页面状态
  const checkState = async () => {
    const { result } = await cdpSend(ws, 'Runtime.evaluate', {
      expression: JSON.stringify({
        hasStartBtn: !!document.getElementById('startBtn'),
        hasPauseBtn: !!document.getElementById('pauseBtn'),
        hasResetBtn: !!document.getElementById('resetBtn'),
        hasSpeedSel: !!document.getElementById('speedSel'),
        running: typeof running !== 'undefined' ? running : (typeof state !== 'undefined' ? state.running : null),
        speed: typeof speed !== 'undefined' ? speed : (typeof state !== 'undefined' ? state.speed : null),
      }),
      returnByValue: true,
    });
    return result.value;
  };
  
  let state0 = await checkState();
  console.log('  初始状态:', state0);
  
  // 点击开始按钮
  if (state0.hasStartBtn) {
    await cdpSend(ws, 'Runtime.evaluate', {
      expression: 'document.getElementById("startBtn").click()',
    });
    await new Promise((r) => setTimeout(r, 300));
  }
  
  let state1 = await checkState();
  console.log('  点击开始后:', state1);
  
  // 点击暂停按钮
  if (state1.hasPauseBtn) {
    await cdpSend(ws, 'Runtime.evaluate', {
      expression: 'document.getElementById("pauseBtn").click()',
    });
    await new Promise((r) => setTimeout(r, 200));
  }
  
  let state2 = await checkState();
  console.log('  点击暂停后:', state2);
  
  // 切换倍速
  if (state2.hasSpeedSel) {
    await cdpSend(ws, 'Runtime.evaluate', {
      expression: 'document.getElementById("speedSel").value = "2"; document.getElementById("speedSel").dispatchEvent(new Event("change"))',
    });
    await new Promise((r) => setTimeout(r, 200));
  }
  
  let state3 = await checkState();
  console.log('  切换倍速后:', state3);
  
  // 验证
  const issues = [];
  if (!state0.hasStartBtn) issues.push('缺少开始按钮');
  if (!state0.hasPauseBtn) issues.push('缺少暂停按钮');
  if (!state0.hasResetBtn) issues.push('缺少重置按钮');
  if (!state0.hasSpeedSel) issues.push('缺少倍速选择');
  
  // 检查 running 状态变化
  if (state0.running === false && state1.running !== true) {
    issues.push('开始按钮未触发运行');
  }
  if (state1.running === true && state2.running !== false) {
    issues.push('暂停按钮未停止运行');
  }
  if (state2.speed !== 2 && state3.speed !== 2) {
    issues.push('倍速切换未生效');
  }
  
  if (issues.length === 0) {
    console.log('  ✓ 通过');
    return { page, pass: true };
  } else {
    console.log('  ✗ 问题:', issues.join(', '));
    return { page, pass: false, issues };
  }
}

async function main() {
  console.log('启动静态服务器...');
  const server = await startServer();
  
  console.log('启动 headless shell...');
  const shell = startHeadless();
  shell.stderr.on('data', (d) => process.stderr.write(d));
  
  try {
    console.log('等待 CDP 就绪...');
    const wsUrl = await getCdpWsUrl();
    console.log('CDP WebSocket:', wsUrl);
    
    const ws = await wsConnect(wsUrl);
    console.log('WebSocket 已连接');
    
    // 启用必要的域
    await cdpSend(ws, 'Page.enable');
    await cdpSend(ws, 'Runtime.enable');
    await cdpSend(ws, 'DOM.enable');
    
    const results = [];
    for (let i = 0; i < PAGES.length; i++) {
      const result = await testPage(ws, PAGES[i], i);
      results.push(result);
    }
    
    console.log('\n========== 测试结果 ==========');
    const passed = results.filter((r) => r.pass);
    const failed = results.filter((r) => !r.pass);
    console.log(`通过: ${passed.length}/${results.length}`);
    if (failed.length > 0) {
      console.log('失败:');
      failed.forEach((f) => console.log(`  - ${f.page}: ${f.issues.join(', ')}`));
    }
    
    ws.close();
  } finally {
    shell.kill();
    server.close();
  }
}

main().catch((e) => {
  console.error('错误:', e);
  process.exit(1);
});
