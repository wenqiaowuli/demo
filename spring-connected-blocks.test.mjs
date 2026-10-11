import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const fileUrl = pathToFileURL(resolve('spring-connected-blocks.html')).href;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

const near = (actual, expected, tolerance = 0.015) => {
  const value = Number.parseFloat(actual);
  assert.ok(Number.isFinite(value), `expected a finite number, received ${actual}`);
  assert.ok(Math.abs(value - expected) <= tolerance, `${actual} differs from ${expected} by more than ${tolerance}`);
};
async function range(id, value) {
  await page.locator(`#${id}`).evaluate((input, next) => {
    input.value = String(next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}
async function seek(time) {
  await page.locator('#timeSeek').evaluate((input, next) => {
    input.value = String(next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, time);
}
async function text(id) { return (await page.locator(`#${id}`).textContent()).trim(); }

try {
  await page.goto(fileUrl);
  await page.waitForTimeout(100);

  // 默认参数：初态 e=0，弹簧力为零；B 单独受外力。
  near(await text('extensionData'), 0, 0.001);
  near(await text('springForceData'), 0, 0.01);
  near(await text('accelAData'), 0);
  assert.equal(await text('accelAData'), '0.00 m/s²', 'rounding should not expose negative zero');
  near(await text('accelBData'), 4);
  near(await text('accelCMData'), 2);
  near(await text('equilibriumData'), 0.1);

  // t=0.25 s 接近默认相对振动四分之一周期。
  await seek(0.25);
  const omega = Math.sqrt(40);
  const eQuarter = 0.1 * (1 - Math.cos(omega * 0.25));
  near(await text('extensionData'), eQuarter, 0.003);
  near(await text('accelAData'), 20 * eQuarter, 0.02);
  near(await text('accelBData'), 4 - 20 * eQuarter, 0.02);

  // 平衡初态：形变保持恒定，两个物块以质心加速度共同运动。
  await range('initial', 0.1);
  await seek(5.23);
  near(await text('extensionData'), 0.1, 0.001);
  near(await text('accelAData'), 2);
  near(await text('accelBData'), 2);
  near(await text('accelCMData'), 2);

  // 压缩弹簧可令 B 的加速度超过 F/mB，核实页面没有错误的“最大”表述。
  await range('initial', -0.5);
  near(await text('extensionData'), -0.5, 0.001);
  near(await text('springForceData'), 10, 0.01);
  near(await text('accelAData'), -10);
  near(await text('accelBData'), 14);

  // 零外力压缩边界：两块受弹簧力相反，质心加速度为零。
  await range('force', 0);
  near(await text('extensionData'), -0.5, 0.001);
  near(await text('accelAData'), -10);
  near(await text('accelBData'), 10);
  near(await text('accelCMData'), 0);

  // 无外力伸长振子：质心不加速，释放后 A/B 沿相反方向运动。
  await range('initial', 0.2);
  near(await text('accelCMData'), 0);
  await seek(0.25);
  const eFree = 0.2 * Math.cos(omega * 0.25);
  near(await text('extensionData'), eFree, 0.003);
  assert.ok(Number.parseFloat(await text('velocityAData')) > 0);
  assert.ok(Number.parseFloat(await text('velocityBData')) < 0);
  const redForcePixels = await page.locator('#scene').evaluate(canvas => {
    const w = canvas.clientWidth, h = canvas.clientHeight, dpr = canvas.width / w;
    const blockW = Math.min(64, w * .07), blockH = Math.min(58, h * .17), trackY = h * .72;
    const massA = Number(document.querySelector('#massA').value), massB = Number(document.querySelector('#massB').value);
    const e = Number.parseFloat(document.querySelector('#extensionData').textContent);
    const gap = Math.max(blockW + 5, (2.2 + e) * Math.min(42, w * .05));
    const rightB = w / 2 + massA / (massA + massB) * gap + blockW / 2;
    const top = trackY - blockH;
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let y = Math.floor((top + 5) * dpr); y < Math.ceil((top + 15) * dpr); y++) {
      for (let x = Math.floor((rightB + 2) * dpr); x < Math.ceil((rightB + 42) * dpr); x++) {
        const i = (y * canvas.width + x) * 4;
        if (pixels[i] > 170 && pixels[i + 1] < 120 && pixels[i + 2] < 50 && pixels[i + 3] > 200) count++;
      }
    }
    return count;
  });
  assert.equal(redForcePixels, 0, 'F=0 should not draw a red external-force arrow');

  // 全静止特例。
  await range('initial', 0);
  await seek(6.37);
  for (const id of ['extensionData', 'springForceData', 'accelAData', 'accelBData', 'accelCMData', 'velocityAData', 'velocityBData']) {
    near(await text(id), 0, 0.001);
  }
  assert.equal(await page.locator('#scene').getAttribute('aria-label'), '水平光滑面上的弹簧连接物块，外力为零');

  // 参数上边界与系统动量方程校验：sum(m_i a_i) = F。
  await range('massA', 0.5);
  await range('massB', 0.5);
  await range('stiffness', 50);
  await range('force', 12);
  await range('initial', -0.5);
  const aA = Number.parseFloat(await text('accelAData'));
  const aB = Number.parseFloat(await text('accelBData'));
  near(0.5 * aA + 0.5 * aB, 12, 0.02);
  assert.ok(Number.isFinite(aA) && Number.isFinite(aB));

  // 参数变化总是回到初态；播放、暂停、单步与进度定位同步工作。
  await page.locator('#play').click();
  assert.equal(await page.locator('#massA').isDisabled(), true);
  await page.waitForTimeout(180);
  await page.locator('#pause').click();
  const pausedAt = Number.parseFloat(await text('timeData'));
  assert.ok(pausedAt > 0);
  assert.equal(await page.locator('#massA').isDisabled(), false);
  await page.locator('#stepForward').click();
  near(await text('timeData'), pausedAt + 0.1, 0.015);
  assert.equal(await page.locator('#play').textContent(), '▶ 继续');
  await range('force', 4);
  near(await text('timeData'), 0, 0.001);
  await seek(1.23);
  near(await text('timeData'), 1.23, 0.001);
  assert.equal(await page.locator('#seekValue').textContent(), '1.23 s');
  await page.locator('#force').focus();
  await page.keyboard.press('r');
  near(await text('timeData'), 0, 0.001);
  await page.locator('h1').click();
  await page.keyboard.press('Space');
  assert.equal(await page.locator('#pause').isDisabled(), false);
  await page.waitForTimeout(100);
  await page.keyboard.press('Space');
  assert.equal(await page.locator('#pause').isDisabled(), true);
  await page.locator('#play').click();
  await page.waitForTimeout(100);
  await page.locator('#timeSeek').dispatchEvent('pointerdown');
  await seek(0.7);
  assert.equal(await page.locator('#pause').isDisabled(), true);
  near(await text('timeData'), 0.7, 0.001);
  await seek(12);
  assert.equal(await page.locator('#play').isDisabled(), true);
  await page.locator('#reset').click();
  near(await text('timeData'), 0, 0.001);
  assert.equal(await page.locator('#play').isDisabled(), false);
  await page.locator('#speed').selectOption('2');
  await seek(11.99);
  await page.locator('#play').click();
  await page.waitForTimeout(150);
  near(await text('timeData'), 12, 0.001);
  assert.equal(await page.locator('#play').textContent(), '已完成');
  assert.equal(await page.locator('#play').isDisabled(), true);
  await page.locator('#reset').click();
  await page.locator('#speed').selectOption('1');

  // 截图保存默认参数初态，供人工视觉验收。
  await range('massA', 1);
  await range('massB', 1);
  await range('stiffness', 20);
  await range('force', 4);
  await range('initial', 0);
  await page.locator('#reset').click();

  // 桌面、800px 和手机视口均无水平溢出，三个画布都有可见尺寸。
  for (const width of [1280, 800, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(100);
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth,
      canvases: [...document.querySelectorAll('canvas')].map(canvas => {
        const rect = canvas.getBoundingClientRect();
        return { width: rect.width, height: rect.height, clientWidth: canvas.clientWidth, clientHeight: canvas.clientHeight, pixelWidth: canvas.width, pixelHeight: canvas.height, dpr: devicePixelRatio };
      })
    }));
    assert.ok(metrics.scrollWidth <= metrics.innerWidth, `${width}px viewport has horizontal overflow`);
    assert.equal(metrics.canvases.length, 3);
    assert.ok(metrics.canvases.every(canvas => canvas.width > 0 && canvas.height > 0 && Math.abs(canvas.pixelWidth - canvas.clientWidth * canvas.dpr) <= 1 && Math.abs(canvas.pixelHeight - canvas.clientHeight * canvas.dpr) <= 1));
    if (width === 1280) await page.screenshot({ path: 'docs/models/artifacts/spring-connected-blocks/desktop.png', fullPage: true });
    if (width === 800) await page.screenshot({ path: 'docs/models/artifacts/spring-connected-blocks/tablet.png', fullPage: true });
    if (width === 390) await page.screenshot({ path: 'docs/models/artifacts/spring-connected-blocks/mobile.png', fullPage: true });
  }

  assert.deepEqual(errors, [], `browser errors: ${errors.join('; ')}`);
  console.log('PASS: physics/readout cases 7, interaction cases 8, responsive viewports 3, browser errors 0');
} finally {
  await browser.close();
}
