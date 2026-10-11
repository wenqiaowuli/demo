import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';

const pageUrl = pathToFileURL(resolve('light-rope-connected-bodies.html')).href;
const screenshots = resolve('docs/models/artifacts/light-rope-connected-bodies');

test('renders, stays within the viewport, and supports the teaching controls', async ({ page }, testInfo) => {
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });

  await page.goto(pageUrl);
  await expect(page.getByRole('heading', { name: /轻绳连接体/ })).toBeVisible();
  await expect(page.locator('#dAcc')).toHaveText('2.00 m/s²');
  await expect(page.locator('#dTension')).toHaveText('6.00 N');

  const layout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    canvases: [...document.querySelectorAll('canvas')].map(canvas => ({
      width: canvas.clientWidth,
      height: canvas.clientHeight,
      bitmapWidth: canvas.width,
      bitmapHeight: canvas.height
    }))
  }));
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.canvases).toHaveLength(4);
  for (const canvas of layout.canvases) {
    expect(canvas.width).toBeGreaterThan(0);
    expect(canvas.height).toBeGreaterThan(0);
    expect(canvas.bitmapWidth).toBeGreaterThanOrEqual(canvas.width);
  }

  if (testInfo.project.name === 'desktop' || testInfo.project.name === 'mobile') {
    mkdirSync(screenshots, { recursive: true });
    await page.screenshot({ path: resolve(screenshots, `${testInfo.project.name}.png`), fullPage: true });
  }
  if (testInfo.project.name === 'desktop') {
    await page.getByRole('button', { name: '整体 A+B' }).click();
    await page.screenshot({ path: resolve(screenshots, 'desktop-system.png'), fullPage: true });
    await page.getByRole('button', { name: '隔离 A' }).click();
  }

  await page.locator('#speed').selectOption('2');
  await page.getByRole('button', { name: '开始播放' }).click();
  await expect(page.locator('#massARange')).toBeDisabled();
  await expect.poll(async () => Number.parseFloat(await page.locator('#dTime').textContent())).toBeGreaterThan(0.1);
  await page.getByRole('button', { name: '暂停动画' }).click();
  await expect(page.getByRole('button', { name: '继续播放' })).toBeEnabled();
  await expect(page.locator('#massARange')).toBeEnabled();

  await page.locator('#forceRange').evaluate(input => {
    input.value = '3';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#dTime')).toHaveText('0.00 s');
  await expect(page.locator('#dAcc')).toHaveText('0.60 m/s²');
  await expect(page.locator('#dTension')).toHaveText('1.80 N');

  await page.locator('#massA').fill('0.1');
  await page.locator('#massA').press('Tab');
  await expect(page.locator('#massARange')).toHaveValue('0.1');
  await expect(page.locator('#dAcc')).toHaveText('0.97 m/s²');
  await page.locator('#massB').fill('10');
  await page.locator('#massB').press('Tab');
  await expect(page.locator('#massBRange')).toHaveValue('10');
  await expect(page.locator('#dAcc')).toHaveText('0.30 m/s²');

  await page.locator('#forceRange').evaluate(input => {
    input.value = '0';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#dAcc')).toHaveText('0.00 m/s²');
  await expect(page.locator('#dTension')).toHaveText('0.00 N');
  await page.locator('#forceRange').evaluate(input => {
    input.value = '40';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#dAcc')).toHaveText('3.96 m/s²');
  await expect(page.locator('#dTension')).toHaveText('39.60 N');

  await page.getByRole('button', { name: /单步/ }).click();
  await expect(page.locator('#dTime')).toHaveText('0.10 s');
  await page.locator('#timeline').evaluate(input => {
    input.value = input.max;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#status')).toHaveText('演示结束');

  for (const [label, expected] of [
    ['整体 A+B', '整体A+B的受力图：外力F向右，绳张力为内力并抵消'],
    ['隔离 B', '隔离B的受力图：绳张力T向右，竖直方向支持力与重力平衡']
  ]) {
    await page.getByRole('button', { name: label }).click();
    await expect(page.locator('#forces')).toHaveAttribute('aria-label', expected);
  }
  await page.getByRole('button', { name: '重置动画' }).click();
  await expect(page.locator('#dTime')).toHaveText('0.00 s');
  await expect(page.locator('#status')).toHaveText('准备就绪');
  expect(browserErrors).toEqual([]);
});
