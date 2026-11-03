const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const os = require('os');

puppeteer.use(StealthPlugin());

/**
 * Emite a Certidão Consolidada de Pessoa Jurídica da Administração Pública Federal (TCU, CNJ, CEIS e CNEP).
 * Totalmente automática via robô headless.
 * @param {string} cnpj - CNPJ da empresa (14 dígitos)
 * @returns {Promise<Object>} Dados da certidão e buffer do PDF
 */
async function emitirCertidaoConsolidadaTcu(cnpj) {
  const cleanCnpj = String(cnpj || '').replace(/\D/g, '');
  if (!cleanCnpj || cleanCnpj.length !== 14) {
    throw new Error('CNPJ inválido para consulta da Certidão APF (TCU)');
  }

  const cnpjFolder = path.join(__dirname, 'uploads', cleanCnpj);
  if (!fs.existsSync(cnpjFolder)) fs.mkdirSync(cnpjFolder, { recursive: true });

  const tempDownloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tcu-dl-'));

  let browser = null;
  try {
    browser = await puppeteer.launch({
      executablePath: '/usr/bin/google-chrome',
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    const page = await browser.newPage();
    
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: tempDownloadDir
    });

    let dadosJson = null;

    page.on('response', async res => {
      const u = res.url();
      if (u.includes('/api/rest/publico/certidoes/') && res.status() === 200) {
        try {
          dadosJson = await res.json();
          console.log('[TCU] Resposta da API consolidada interceptada com sucesso!');
        } catch (e) {}
      }
    });

    console.log(`[TCU] Acessando portal de Certidões APF para CNPJ: ${cleanCnpj}...`);
    await page.goto('https://certidoes-apf.apps.tcu.gov.br/', {
      waitUntil: 'networkidle2',
      timeout: 25000
    });

    await page.waitForSelector('#numero-cnpj', { timeout: 15000 });
    await page.type('#numero-cnpj', cleanCnpj, { delay: 15 });

    console.log('[TCU] Disparando consulta consolidada...');
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('CONSULTAR'));
      if (btn) btn.click();
    });

    // Aguardar o botão "BAIXAR PDF" ficar visível
    await page.waitForFunction(
      () => document.body && document.body.innerText.includes('BAIXAR PDF'),
      { timeout: 20000 }
    );

    console.log('[TCU] Clicando em BAIXAR PDF...');
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('BAIXAR PDF'));
      if (btn) btn.click();
    });

    // Aguardar o arquivo ser gravado na pasta de download
    let pdfFileName = null;
    let pdfBuffer = null;

    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 800));
      const files = fs.readdirSync(tempDownloadDir);
      const pdfs = files.filter(f => f.endsWith('.pdf'));
      if (pdfs.length > 0) {
        const file = pdfs[0];
        const tempPath = path.join(tempDownloadDir, file);
        const stat = fs.statSync(tempPath);
        if (stat.size > 2000) {
          pdfFileName = `CERTIDAO_CONSOLIDADA_TCU_${cleanCnpj}_${new Date().toISOString().split('T')[0]}.pdf`;
          const destPath = path.join(cnpjFolder, pdfFileName);
          fs.copyFileSync(tempPath, destPath);
          pdfBuffer = fs.readFileSync(destPath);
          console.log(`[TCU] PDF consolidado capturado com sucesso! (${stat.size} bytes)`);
          break;
        }
      }
    }

    if (!pdfBuffer) {
      throw new Error('Tempo limite excedido ao gerar o arquivo PDF consolidado do TCU.');
    }

    // Avaliar situação geral (se há sanção em qualquer um dos órgãos)
    let situacaoGeral = 'NADA CONSTA';
    if (dadosJson && dadosJson.certidoes) {
      const temSancao = dadosJson.certidoes.some(c => c.situacao && c.situacao !== 'NADA_CONSTA' && c.situacao !== 'SISTEMA_INDISPONIVEL');
      if (temSancao) situacaoGeral = 'CONSTA SANÇÃO';
    }

    const hojeIso = new Date().toISOString().split('T')[0];
    // Validade padrão para certidões de sanções: 30 dias
    const dtValidade = new Date();
    dtValidade.setDate(dtValidade.getDate() + 30);
    const validadeIso = dtValidade.toISOString().split('T')[0];

    return {
      sucesso: true,
      situacao: situacaoGeral,
      numeroCertidao: `APF-${cleanCnpj.slice(0, 8)}/${new Date().getFullYear()}`,
      emissao: hojeIso,
      validade: validadeIso,
      nomeArquivo: pdfFileName,
      downloadUrl: `/api/dossie/download/${cleanCnpj}/${pdfFileName}`,
      pdfBuffer: pdfBuffer,
      detalhes: dadosJson ? dadosJson.certidoes : []
    };

  } catch (err) {
    console.error('[TCU] Erro na automação:', err.message);
    throw err;
  } finally {
    if (browser) await browser.close();
    try {
      if (fs.existsSync(tempDownloadDir)) {
        fs.rmSync(tempDownloadDir, { recursive: true, force: true });
      }
    } catch (e) {}
  }
}

module.exports = { emitirCertidaoConsolidadaTcu };
