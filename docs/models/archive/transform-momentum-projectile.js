#!/usr/bin/env node
// 对 momentum-collision.html 和 projectile-motion.html 进行布局改造
// 参照 chasing-meeting-model.html 的布局风格

const fs = require('fs');
const path = require('path');

const FILES = [
  'momentum-collision.html',
  'projectile-motion.html',
];

// CSS 样式（与参照页一致）
const PLAY_BAR_CSS = `
.play-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    background: #f8fafc;
    border-top: 1px solid #e2e8f0;
    border-radius: 0 0 8px 8px;
}
.play-bar button {
    padding: 8px 16px;
    font-size: 14px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #ffffff;
    cursor: pointer;
    transition: all 0.2s;
}
.play-bar button:hover:not(:disabled) {
    background: #f3f4f6;
    border-color: #9ca3af;
}
.play-bar button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}
.play-bar select {
    padding: 6px 10px;
    font-size: 13px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #ffffff;
    cursor: pointer;
}`;

const FORMULA_CARD_CSS = `
.formula-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 16px 20px;
    margin: 14px 0;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}
.formula-card .group-title {
    font-size: 15px;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid #e5e7eb;
}
.formula-card .fixed-note {
    font-size: 13px;
    line-height: 1.7;
    color: #4b5563;
}`;

function transformFile(file) {
  console.log(`\n处理: ${file}`);
  let content = fs.readFileSync(file, 'utf8');
  
  // 1. 检查是否已有 play-bar
  if (content.includes('class="play-bar"')) {
    console.log('  已有 play-bar，跳过');
    return;
  }
  
  // 2. 提取按钮内容
  const actionsMatch = content.match(/<div class="actions">([\s\S]*?)<\/div>\s*(?=<div class="status"|<div class="legend"|<\/main>)/);
  if (!actionsMatch) {
    console.log('  未找到 .actions 容器');
    return;
  }
  
  const buttonsHtml = actionsMatch[1].trim();
  console.log('  提取按钮:', buttonsHtml.substring(0, 100));
  
  // 3. 提取公式内容
  let formulaContent = '';
  
  // momentum-collision: 公式在 .legend .formula 中
  const legendFormulaMatch = content.match(/<span class="formula">([\s\S]*?)<\/span>/);
  if (legendFormulaMatch) {
    formulaContent = legendFormulaMatch[1].trim();
    console.log('  提取公式(legend):', formulaContent.substring(0, 50));
  }
  
  // projectile-motion: 公式在 .fixed-note 中
  const fixedNoteMatch = content.match(/<div class="fixed-note">([\s\S]*?)<\/div>(?=\s*<\/section>)/);
  if (fixedNoteMatch) {
    formulaContent = fixedNoteMatch[1].trim();
    console.log('  提取公式(fixed-note):', formulaContent.substring(0, 50));
  }
  
  // 4. 在 canvas 后添加 play-bar
  const canvasMatch = content.match(/(<canvas[^>]*id="(?:scene|canvas)"[^>]*><\/canvas>)/);
  if (canvasMatch) {
    const playBar = `\n            <div class="play-bar">\n                ${buttonsHtml}\n            </div>`;
    content = content.replace(canvasMatch[0], canvasMatch[0] + playBar);
    console.log('  插入 play-bar');
  }
  
  // 5. 在 charts-row 后、control-panel 前添加 formula-card
  if (formulaContent) {
    const formulaCard = `\n        <section class="formula-card">\n            <div class="group-title">公式与判定</div>\n            <div class="fixed-note">${formulaContent}</div>\n        </section>`;
    
    // 在 control-panel 前插入
    content = content.replace(/(<div class="control-panel">)/, formulaCard + '\n        $1');
    console.log('  插入 formula-card');
  }
  
  // 6. 删除 .actions 容器
  content = content.replace(/<div class="actions">[\s\S]*?<\/div>(?=\s*<div class="status"|<div class="legend"|<\/main>)/, '');
  console.log('  删除 .actions');
  
  // 7. 删除 legend 中的 formula span（momentum-collision）
  content = content.replace(/<span class="formula">[\s\S]*?<\/span>/, '');
  
  // 8. 删除 control-panel 中的 fixed-note（projectile-motion）
  content = content.replace(/<div class="fixed-note">[\s\S]*?<\/div>(?=\s*<\/section>)/g, '');
  
  // 9. 删除原有的 .actions CSS 规则
  content = content.replace(/\.actions\s*\{[^}]*\}/g, '');
  
  // 10. 添加新 CSS（在 </style> 前）
  const newCss = PLAY_BAR_CSS + FORMULA_CARD_CSS;
  content = content.replace('</style>', newCss + '\n    </style>');
  console.log('  添加 CSS 样式');
  
  // 11. 写回文件
  fs.writeFileSync(file, content);
  console.log('  完成');
}

// 主流程
FILES.forEach(transformFile);
console.log('\n全部完成');
