import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';

const pageUrl = pathToFileURL(resolve('acceleration-force-mass.html')).href;
const screenshots = resolve('docs/models/artifacts/acceleration-force-mass');

test('compares the two controlled-variable experiments across viewports', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

  await page.goto(pageUrl);
  await expect(page.getByRole('heading', { name: '加速度与力、质量的关系' })).toBeVisible();
  await expect(page.locator('#dAcc')).toHaveText('2.00 m/s²');
  await expect(page.locator('#relationText')).toContainText('a/F = 1/m');
  await expect(page.locator('#axisSwitch')).toBeHidden();
  await expect(page.getByText('保持质量 m = 2.0 kg 不变')).toBeVisible();

  const initialLayout = await page.evaluate(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    canvases: [...document.querySelectorAll('canvas')].map(canvas => ({ css: canvas.clientWidth, bitmap: canvas.width, height: canvas.clientHeight }))
  }));
  expect(initialLayout.scrollWidth).toBeLessThanOrEqual(initialLayout.width);
  expect(initialLayout.canvases).toHaveLength(2);
  for (const canvas of initialLayout.canvases) {
    expect(canvas.css).toBeGreaterThan(0);
    expect(canvas.height).toBeGreaterThan(0);
    expect(canvas.bitmap).toBeGreaterThanOrEqual(canvas.css);
  }

  if (testInfo.project.name === 'desktop' || testInfo.project.name === 'mobile') {
    mkdirSync(screenshots, { recursive: true });
    await page.screenshot({ path: resolve(screenshots, `${testInfo.project.name}-force.png`), fullPage: true });
  }
  if (testInfo.project.name === 'desktop') {
    await page.getByRole('button', { name: /固定合力/ }).click();
    await page.getByRole('button', { name: /倒数 1\/m/ }).click();
    await page.screenshot({ path: resolve(screenshots, 'desktop-inverse-mass.png'), fullPage: true });
    await page.getByRole('button', { name: /实验一.*固定质量/ }).click();
  }

  await page.locator('#forceRange').evaluate(input => {
    input.value = '8';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#dAcc')).toHaveText('4.00 m/s²');
  await expect(page.locator('#relationText')).toContainText('a/F = 1/m = 0.500');
  for (const [expectedF, expectedA] of [['0.0', '0.00'], ['4.0', '2.00'], ['8.0', '4.00'], ['12.0', '6.00'], ['16.0', '8.00'], ['20.0', '10.00']]) {
    await expect(page.locator('.trial').filter({ hasText: `F=${expectedF} N` })).toContainText(`a=${expectedA} m/s²`);
  }

  await page.locator('#speed').selectOption('2');
  await page.getByRole('button', { name: '开始播放' }).click();
  await expect(page.locator('#massRange')).toBeDisabled();
  await expect(page.locator('#forceRange')).toBeDisabled();
  await expect.poll(async () => Number.parseFloat(await page.locator('#dTime').textContent())).toBeGreaterThan(0.1);
  await page.getByRole('button', { name: '暂停动画' }).click();
  await expect(page.getByRole('button', { name: '继续播放' })).toBeEnabled();
  await page.getByRole('button', { name: /固定合力/ }).click();
  await expect(page.locator('#dTime')).toHaveText('0.00 s');
  await expect(page.locator('#force')).toHaveValue('8');
  await expect(page.locator('#axisSwitch')).toBeVisible();
  await expect(page.getByText('保持合力 F = 8.0 N 不变')).toBeVisible();
  await expect(page.locator('#dAcc')).toHaveText('4.00 m/s²');
  await page.getByRole('button', { name: '横轴：质量 m' }).click();

  await page.locator('#mass').fill('4');
  await page.locator('#mass').press('Tab');
  await expect(page.locator('#massRange')).toHaveValue('4');
  await expect(page.locator('#dAcc')).toHaveText('2.00 m/s²');
  await expect(page.locator('#relationText')).toContainText('a·m = F = 8.00 N');
  await expect(page.locator('.trial').filter({ hasText: 'm=4.0 kg' })).toContainText('a=2.00 m/s²');

  await page.getByRole('button', { name: '横轴：倒数 1/m' }).click();
  await expect(page.locator('[data-axis="inverse"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.trial').filter({ hasText: '1/m=0.25 kg⁻¹' })).toContainText('a=2.00 m/s²');
  await page.getByRole('button', { name: '横轴：质量 m' }).click();
  await page.locator('#forceRange').evaluate(input => {
    input.value = '0';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#dAcc')).toHaveText('0.00 m/s²');
  await expect(page.locator('.trial').first()).toContainText('a=0.00 m/s²');
  await page.locator('#forceRange').evaluate(input => {
    input.value = '20';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('#massRange').evaluate(input => {
    input.value = '0.5';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#dAcc')).toHaveText('40.00 m/s²');

  await page.getByRole('button', { name: /单步/ }).click();
  await expect(page.locator('#dTime')).toHaveText('0.10 s');
  await page.locator('#timeline').evaluate(input => {
    input.value = input.max;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#status')).toHaveText('演示结束');
  await page.getByRole('button', { name: '重置动画' }).click();
  await expect(page.locator('#dTime')).toHaveText('0.00 s');
  await expect(page.locator('#status')).toHaveText('准备就绪');
  expect(errors).toEqual([]);
});
