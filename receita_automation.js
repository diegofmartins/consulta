const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

puppeteer.use(StealthPlugin());

// Copia um texto para a área de transferência do usuário (Ctrl+V).
// Tenta, em ordem, os utilitários de clipboard comuns no Linux.
function copiarParaAreaDeTransferencia(texto) {
  const tentativas = [
    ['xclip', ['-selection', 'clipboard']],
    ['xsel', ['--clipboard', '--input']],
    ['wl-copy', []]
  ];
  for (const [cmd, args] of tentativas) {
    try {
      execFileSync(cmd, args, { input: texto, stdio: ['pipe', 'ignore', 'ignore'] });
      console.log(`[Receita] CNPJ copiado para a área de transferência via ${cmd}.`);
      return true;
    } catch (err) {
      // Tenta o próximo utilitário disponível.
    }
  }
  console.warn('[Receita] Nenhum utilitário de clipboard encontrado (xclip/xsel/wl-copy).');
  return false;
}

async function abrirReceitaAssistida(cnpj, timeoutMs = 180000) {
  const cleanCnpj = String(cnpj).replace(/\D/g, '');
  const cnpjFolder = path.join(__dirname, 'uploads', cleanCnpj);
  if (!fs.existsSync(cnpjFolder)) fs.mkdirSync(cnpjFolder, { recursive: true });

  // Pasta temporária exclusiva para downloads desta sessão
  const tempDownloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rfb-dl-'));

  let browser = null;
  try {
    const tempUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rfb-chrome-profile-'));
    browser = await puppeteer.launch({
      executablePath: '/usr/bin/google-chrome',
      headless: false,
      ignoreDefaultArgs: ['--enable-automation'],
      userDataDir: tempUserDataDir,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--no-default-browser-check',
        '--no-first-run',
        '--window-size=860,920',
        '--window-position=260,30'
      ]
    });

    const page = await browser.newPage();
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
        // Ignora erro se a página já estiver fechada
      }
    }

    await configurarDownloadPage(page);

    let dadosCapturados = {
      sucesso: false,
      numeroCertidao: null,
      validade: null,
      emissao: null,
      situacao: 'NEGATIVA',
      pdfBuffer: null,
      nomeArquivo: null
    };

    // Monitorar novas abas/popups que a Receita possa abrir
    browser.on('targetcreated', async target => {
      if (target.type() === 'page') {
        const newPage = await target.page();
        if (newPage) {
          await configurarDownloadPage(newPage);
          
          newPage.on('response', async res => {
            const contentType = res.headers()['content-type'] || '';
            if (contentType.includes('application/pdf')) {
              try {
                dadosCapturados.pdfBuffer = await res.buffer();
                console.log('[Receita] PDF capturado via stream em nova aba!');
              } catch (e) {}
            }
          });
        }
      }
    });

    // Monitorar respostas de rede da página principal
    page.on('response', async res => {
      const url = res.url();
      const contentType = res.headers()['content-type'] || '';
      
      if (contentType.includes('application/pdf')) {
        try {
          dadosCapturados.pdfBuffer = await res.buffer();
          console.log('[Receita] PDF capturado via stream na página principal!');
        } catch (e) {}
      }

      if (contentType.includes('application/json') && (url.includes('certidao') || url.includes('consulta'))) {
        try {
          const json = await res.json();
          console.log('[Receita] JSON de resposta interceptado:', JSON.stringify(json).slice(0, 200));
          if (json.numeroCertidao) dadosCapturados.numeroCertidao = json.numeroCertidao;
          if (json.dataValidade) dadosCapturados.validade = json.dataValidade;
          if (json.tipoCertidao) dadosCapturados.situacao = json.tipoCertidao;
        } catch (e) {}
      }
    });

    console.log(`[Receita] Navegando para emissão CNPJ: ${cleanCnpj}...`);
    await page.goto('https://servicos.receitafederal.gov.br/servico/certidoes/#/home/cnpj', {
      waitUntil: 'networkidle2',
      timeout: 35000
    });

    // Fechar aviso de cookies se existir
    try {
      const btnCookies = await page.$('button[id="btn-cookies-header"]');
      if (btnCookies) await btnCookies.click();
    } catch (e) {}

    // Aguardar o campo de CNPJ. Não digitamos (evita a detecção de robô):
    // copiamos o CNPJ para a área de transferência e o usuário cola manualmente.
    await page.waitForSelector('input[name="niContribuinte"]', { timeout: 15000 });
    const copiou = copiarParaAreaDeTransferencia(cleanCnpj);
    if (!copiou) {
      // Fallback: copia via API de clipboard do próprio navegador.
      try {
        const origem = new URL(page.url()).origin;
        await browser.defaultBrowserContext().overridePermissions(origem, ['clipboard-read', 'clipboard-write']);
        await page.bringToFront();
        await page.evaluate(async (texto) => { await navigator.clipboard.writeText(texto); }, cleanCnpj);
        console.log('[Receita] CNPJ copiado via navegador (navigator.clipboard).');
      } catch (err) {
        console.warn('[Receita] Falha ao copiar CNPJ para a área de transferência:', err.message);
      }
    }
    try { await page.focus('input[name="niContribuinte"]'); } catch (e) {}
    console.log(`[Receita] CNPJ ${cleanCnpj} copiado. Cole com Ctrl+V no campo e clique em "Emitir Certidão".`);
    console.log('[Receita] Aguardando o usuário colar o CNPJ, resolver o hCaptcha e emitir a certidão...');

    const startTime = Date.now();
    let resolvido = false;

    while (Date.now() - startTime < timeoutMs) {
      // Se o usuário fechou o navegador manualmente
      if (!browser.isConnected()) {
        console.log('[Receita] Navegador foi fechado pelo usuário.');
        break;
      }

      // 1. Verificar se um novo PDF foi salvo na pasta temporária de downloads
      const tempFiles = fs.readdirSync(tempDownloadDir);
      const isDownloading = tempFiles.some(f => f.endsWith('.crdownload') || f.endsWith('.tmp'));
      const downloadedPdfs = tempFiles.filter(f => f.toLowerCase().endsWith('.pdf'));

      if (!isDownloading && downloadedPdfs.length > 0) {
        const pdfFile = downloadedPdfs[0];
        const tempFilePath = path.join(tempDownloadDir, pdfFile);
        const stat = fs.statSync(tempFilePath);

        if (stat.size > 2000) {
          console.log(`[Receita] PDF detectado na pasta de download: ${pdfFile} (${stat.size} bytes)`);
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const destName = `CND_FEDERAL_${cleanCnpj}_${timestamp}.pdf`;
          const destPath = path.join(cnpjFolder, destName);
          
          fs.copyFileSync(tempFilePath, destPath);
          dadosCapturados.pdfBuffer = fs.readFileSync(destPath);
          dadosCapturados.nomeArquivo = destName;
          dadosCapturados.sucesso = true;
          resolvido = true;
          break;
        }
      }

      // 2. Se o PDF veio via stream interceptado de rede
      if (dadosCapturados.pdfBuffer && dadosCapturados.pdfBuffer.length > 2000) {
        console.log('[Receita] PDF capturado via stream de rede!');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const destName = `CND_FEDERAL_${cleanCnpj}_${timestamp}.pdf`;
        const destPath = path.join(cnpjFolder, destName);
        fs.writeFileSync(destPath, dadosCapturados.pdfBuffer);
        dadosCapturados.nomeArquivo = destName;
        dadosCapturados.sucesso = true;
        resolvido = true;
        break;
      }

      // 3. Verificar o texto das abas abertas para detectar conclusão ou dados cadastrais
      try {
        const pages = await browser.pages();
        for (const p of pages) {
          const text = await p.evaluate(() => document.body ? document.body.innerText : '').catch(() => '');
          
          if (text.includes('Certidão emitida com sucesso') || 
              text.includes('CERTIDÃO NEGATIVA DE DÉBITOS') || 
              text.includes('CERTIDÃO POSITIVA COM EFEITOS DE NEGATIVA') ||
              text.includes('Certidão Positiva de Débitos')) {
            
            if (text.includes('CERTIDÃO POSITIVA COM EFEITOS DE NEGATIVA')) {
              dadosCapturados.situacao = 'POSITIVA COM EFEITOS DE NEGATIVA';
            } else if (text.includes('Certidão Positiva de Débitos')) {
              dadosCapturados.situacao = 'POSITIVA';
            } else {
              dadosCapturados.situacao = 'NEGATIVA';
            }

            const matchNum = text.match(/(?:código de controle|número|certidão nº)[:\s]*([0-9A-Z\.\-\/]{6,})/i);
            if (matchNum) dadosCapturados.numeroCertidao = matchNum[1].trim();

            const matchVal = text.match(/(?:válida até|validade)[:\s]*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i);
            if (matchVal) {
              const [d, m, y] = matchVal[1].split('/');
              dadosCapturados.validade = `${y}-${m}-${d}`;
            }

            // Se ainda não baixou o PDF, tenta encontrar e clicar no botão "Baixar Certidão" ou "Imprimir"
            if (!resolvido) {
              try {
                const btnBaixar = await p.$('button:has-text("Baixar"), button:has-text("Imprimir"), a:has-text("Baixar"), a:has-text("Imprimir")');
                if (btnBaixar) {
                  await btnBaixar.click();
                  await new Promise(r => setTimeout(r, 2000));
                }
              } catch (e) {}
            }
          }
        }
      } catch (e) {}

      await new Promise(r => setTimeout(r, 1000));
    }

    // Aguardar pequeno tempo para garantir que escrita de arquivos encerrou
    await new Promise(r => setTimeout(r, 2000));

    if (browser && browser.isConnected()) {
      await browser.close();
    }
    browser = null;

    // Se detectou dados ou PDF, considera sucesso
    if (dadosCapturados.pdfBuffer || dadosCapturados.nomeArquivo || dadosCapturados.numeroCertidao) {
      dadosCapturados.sucesso = true;
    }

    return dadosCapturados;
  } catch (err) {
    if (browser && browser.isConnected()) {
      await browser.close().catch(() => {});
    }
    return {
      sucesso: false,
      erro: err.message
    };
  } finally {
    // Limpar diretório temporário
    try {
      if (fs.existsSync(tempDownloadDir)) {
        fs.rmSync(tempDownloadDir, { recursive: true, force: true });
      }
    } catch (e) {}
  }
}

module.exports = { abrirReceitaAssistida };
