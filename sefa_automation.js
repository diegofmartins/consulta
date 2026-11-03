const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

puppeteer.use(StealthPlugin());

// Copia um texto para a área de transferência do usuário (Ctrl+V).
function copiarParaAreaDeTransferencia(texto) {
  const tentativas = [
    ['xclip', ['-selection', 'clipboard']],
    ['xsel', ['--clipboard', '--input']],
    ['wl-copy', []]
  ];
  for (const [cmd, args] of tentativas) {
    try {
      execFileSync(cmd, args, { input: texto, stdio: ['pipe', 'ignore', 'ignore'] });
      console.log(`[SEFA] CNPJ copiado para a área de transferência via ${cmd}.`);
      return true;
    } catch (err) {
      // Tenta o próximo utilitário disponível.
    }
  }
  console.warn('[SEFA] Nenhum utilitário de clipboard encontrado (xclip/xsel/wl-copy).');
  return false;
}

async function consultarSefaPr(cnpjLimpo, timeoutMs = 180000) {
  const cleanCnpj = String(cnpjLimpo || '').replace(/\D/g, '');
  let browser = null;

  const tempDownloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sefa-dl-'));

  try {
    browser = await puppeteer.launch({
      executablePath: '/usr/bin/google-chrome',
      headless: false,
      ignoreDefaultArgs: ['--enable-automation'],
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--no-default-browser-check',
        '--no-first-run',
        '--window-size=920,860',
        '--window-position=200,60'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 840 });

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.chrome = { runtime: {} };
    });

    async function configurarDownloadPage(targetPage) {
      try {
        const client = await targetPage.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', {
          behavior: 'allow',
          downloadPath: tempDownloadDir
        });
      } catch (e) {
        // Ignora erro se a página já estiver fechada.
      }
    }

    await configurarDownloadPage(page);

    let listaCertidoes = [];
    let certidaoPdfBuffer = null;
    let numeroCertidaoBaixada = null;

    page.on('response', async res => {
      const url = res.url();
      if (url.includes('certidaoAutomatica') && res.status() === 200) {
        try {
          const json = await res.json();
          if (json.ack && Array.isArray(json.listaCertidao)) {
            listaCertidoes = json.listaCertidao;
          }
        } catch (e) {}
      }
      if (url.includes('certidaoPDF') && res.status() === 200) {
        try {
          const buffer = await res.buffer();
          if (buffer && buffer.length > 2000) {
            certidaoPdfBuffer = buffer;
            const urlObj = new URL(url);
            numeroCertidaoBaixada = urlObj.searchParams.get('numeroCertidao');
          }
        } catch (e) {}
      }
      const contentType = res.headers()['content-type'] || '';
      if (contentType.includes('application/pdf')) {
        try {
          const buffer = await res.buffer();
          if (buffer && buffer.length > 2000) certidaoPdfBuffer = buffer;
        } catch (e) {}
      }
    });

    await page.goto('https://cdwfazenda.paas.pr.gov.br/cdwportal/certidao/automatica', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await page.waitForSelector('input[type="text"]', { timeout: 15000 });

    // Não digitamos (o reCAPTCHA + detecção bloqueariam): copiamos o CNPJ
    // para a área de transferência e o usuário cola manualmente.
    const copiou = copiarParaAreaDeTransferencia(cleanCnpj);
    if (!copiou) {
      try {
        const origem = new URL(page.url()).origin;
        await browser.defaultBrowserContext().overridePermissions(origem, ['clipboard-read', 'clipboard-write']);
        await page.bringToFront();
        await page.evaluate(async (texto) => { await navigator.clipboard.writeText(texto); }, cleanCnpj);
        console.log('[SEFA] CNPJ copiado via navegador (navigator.clipboard).');
      } catch (err) {
        console.warn('[SEFA] Falha ao copiar CNPJ para a área de transferência:', err.message);
      }
    }
    try { await page.focus('input[type="text"]'); } catch (e) {}
    console.log(`[SEFA] CNPJ ${cleanCnpj} copiado. Cole com Ctrl+V, resolva o reCAPTCHA e clique em "Emitir Certidão".`);
    console.log('[SEFA] Aguardando o usuário emitir a certidão e o PDF ser capturado...');

    const startTime = Date.now();
    let tentouBaixar = false;

    while (Date.now() - startTime < timeoutMs) {
      if (!browser.isConnected()) {
        console.log('[SEFA] Navegador fechado pelo usuário.');
        break;
      }

      // Quando a certidão já consta na lista, tenta disparar o download do PDF.
      if (listaCertidoes.length > 0 && !tentouBaixar) {
        tentouBaixar = true;
        try {
          await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const saveBtn = btns.find(b => (b.innerText || '').includes('file_save') || (b.innerText || '').toLowerCase().includes('baixar'));
            if (saveBtn) saveBtn.click();
          });
        } catch (e) {}
      }

      if (certidaoPdfBuffer && certidaoPdfBuffer.length > 2000) {
        break;
      }

      // Fallback: PDF salvo na pasta de downloads.
      try {
        const arquivos = fs.readdirSync(tempDownloadDir);
        const baixando = arquivos.some(f => f.endsWith('.crdownload') || f.endsWith('.tmp'));
        const pdfs = arquivos.filter(f => f.toLowerCase().endsWith('.pdf'));
        if (!baixando && pdfs.length > 0) {
          const caminho = path.join(tempDownloadDir, pdfs[0]);
          const stat = fs.statSync(caminho);
          if (stat.size > 2000) {
            certidaoPdfBuffer = fs.readFileSync(caminho);
            break;
          }
        }
      } catch (e) {}

      await new Promise(r => setTimeout(r, 1000));
    }

    if (browser && browser.isConnected()) {
      await browser.close();
    }
    browser = null;

    if (listaCertidoes.length > 0) {
      const maisRecente = listaCertidoes[0];
      return {
        sucesso: true,
        encontrado: true,
        numeroCertidao: maisRecente.numeroCertidao,
        tipoCertidao: maisRecente.tipoCertidao,
        situacao: (maisRecente.tipoCertidao || '').toLowerCase().includes('negativa') ? 'NEGATIVA' : 'POSITIVA',
        emissao: maisRecente.emissao ? maisRecente.emissao.split('T')[0] : null,
        validade: maisRecente.validade ? maisRecente.validade.split('T')[0] : null,
        pdfBuffer: certidaoPdfBuffer,
        numeroBaixado: numeroCertidaoBaixada
      };
    }

    if (certidaoPdfBuffer && certidaoPdfBuffer.length > 2000) {
      return {
        sucesso: true,
        encontrado: true,
        numeroCertidao: numeroCertidaoBaixada || 'SEFA-PR',
        tipoCertidao: null,
        situacao: 'NEGATIVA',
        emissao: null,
        validade: null,
        pdfBuffer: certidaoPdfBuffer,
        numeroBaixado: numeroCertidaoBaixada
      };
    }

    return {
      sucesso: false,
      mensagem: 'A emissão na SEFA-PR não foi concluída a tempo. Tente novamente.'
    };
  } catch (err) {
    if (browser && browser.isConnected()) {
      await browser.close().catch(() => {});
    }
    return {
      sucesso: false,
      erro: err.message
    };
  } finally {
    try {
      if (fs.existsSync(tempDownloadDir)) {
        fs.rmSync(tempDownloadDir, { recursive: true, force: true });
      }
    } catch (e) {}
  }
}

module.exports = { consultarSefaPr };
