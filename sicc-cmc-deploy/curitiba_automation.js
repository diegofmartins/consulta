const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

function formatarCnpj(cnpj) {
  const c = String(cnpj || '').replace(/\D/g, '');
  return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

/**
 * Emite a Certidão Negativa de Tributos Municipais da Prefeitura Municipal de Curitiba (PMC).
 * Prioriza a obtenção da certidão vigente oficial via listagem municipal ou solicita nova via Altcha.
 * @param {string} cnpj - CNPJ da empresa (14 dígitos)
 * @returns {Promise<Object>} Dados da certidão e buffer do PDF
 */
async function emitirCndCuritiba(cnpj) {
  const cleanCnpj = String(cnpj || '').replace(/\D/g, '');
  if (!cleanCnpj || cleanCnpj.length !== 14) {
    throw new Error('CNPJ inválido para consulta da Prefeitura de Curitiba');
  }

  const cnpjFmt = formatarCnpj(cleanCnpj);
  const cnpjFolder = path.join(__dirname, 'uploads', cleanCnpj);
  if (!fs.existsSync(cnpjFolder)) fs.mkdirSync(cnpjFolder, { recursive: true });

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
    await page.setViewport({ width: 1280, height: 900 });

    console.log(`[Curitiba] Consultando certidões de tributos municipais para ${cnpjFmt}...`);

    let numeroCertidao = null;
    let emissao = null;
    let validade = null;
    let situacao = 'NEGATIVA';
    let imgSrc = null;

    // 1. Tentar obter certidão vigente diretamente pela listagem da PMC
    const listUrl = `https://cnd-cidadao.curitiba.pr.gov.br/ListagemCertidoesPessoaJuridica/ListagemCertidoes?numeroCnpj=${encodeURIComponent(cnpjFmt)}`;
    await page.goto(listUrl, { waitUntil: 'networkidle2', timeout: 25000 });

    // Aguardar o carregamento da tabela
    await page.waitForSelector('.btn.btn-success, tbody tr td', { timeout: 15000 }).catch(() => {});

    const temCertidaoListagem = await page.$('.btn.btn-success');

    if (temCertidaoListagem) {
      console.log('[Curitiba] Certidão encontrada na listagem oficial! Coletando dados...');

      const dadosLinha = await page.evaluate(() => {
        const tr = document.querySelector('tbody tr');
        if (!tr) return null;
        const tds = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim());
        return {
          numero: tds[0] || '',
          emissao: tds[1] || ''
        };
      });

      if (dadosLinha) {
        numeroCertidao = dadosLinha.numero.replace(/\D/g, '') || dadosLinha.numero;
        if (dadosLinha.emissao) {
          const [d, m, y] = dadosLinha.emissao.split('/');
          emissao = `${y}-${m}-${d}`;
          // Validade legal da CND Municipal de Curitiba: 90 dias a contar da emissão
          const dtVal = new Date(Number(y), Number(m) - 1, Number(d) + 90);
          validade = dtVal.toISOString().split('T')[0];
        }
      }

      await page.click('.btn.btn-success');
      await page.waitForSelector('.bootstrap-dialog img', { timeout: 15000 });

      imgSrc = await page.evaluate(() => {
        const img = document.querySelector('.bootstrap-dialog img');
        return img ? img.src : null;
      });
    }

    // 2. Se não houver certidão na listagem prévia, solicitar nova certidão
    if (!imgSrc) {
      console.log('[Curitiba] Nenhuma certidão prévia encontrada. Solicitando nova certidão...');
      await page.goto('https://cnd-cidadao.curitiba.pr.gov.br/Certidao/SolicitarCnpj', {
        waitUntil: 'networkidle2',
        timeout: 25000
      });

      await page.type('#DocumentoCnpj', cleanCnpj, { delay: 15 });
      await page.waitForSelector('.altcha-label', { timeout: 10000 });
      await page.click('.altcha-label');

      await page.waitForFunction(() => {
        const altcha = document.querySelector('.altcha');
        return altcha && altcha.getAttribute('data-state') === 'verified';
      }, { timeout: 15000 });

      await page.click('#btnSolicitar');
      await new Promise(r => setTimeout(r, 3000));

      // Se abrir o modal de já existente ou aviso de 15 minutos
      const btnSegundaVia = await page.$('#btnEmitirSegundaVia');
      if (btnSegundaVia) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {}),
          page.evaluate(() => document.getElementById('btnEmitirSegundaVia').click())
        ]);

        await page.waitForSelector('.btn.btn-success', { timeout: 15000 });
        await page.click('.btn.btn-success');
        await page.waitForSelector('.bootstrap-dialog img', { timeout: 15000 });

        imgSrc = await page.evaluate(() => {
          const img = document.querySelector('.bootstrap-dialog img');
          return img ? img.src : null;
        });
      }
    }

    if (!imgSrc) {
      throw new Error('Não foi possível obter a certidão municipal no portal da Prefeitura de Curitiba');
    }

    // 3. Renderizar a certidão oficial em formato PDF A4 em alta definição
    console.log('[Curitiba] Renderizando documento oficial em PDF...');
    const printPage = await browser.newPage();
    await printPage.setContent(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          @page { size: A4 portrait; margin: 0; }
          html, body { margin: 0; padding: 0; width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; background: white; }
          img { width: 100%; height: 100%; object-fit: contain; }
        </style>
      </head>
      <body>
        <img src="${imgSrc}" />
      </body>
      </html>
    `, { waitUntil: 'load' });

    const pdfBuffer = await printPage.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '5mm', bottom: '5mm', left: '5mm', right: '5mm' }
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const nomeArquivo = `CND_MUNICIPAL_CURITIBA_${cleanCnpj}_${numeroCertidao || timestamp}.pdf`;
    const filePath = path.join(cnpjFolder, nomeArquivo);
    fs.writeFileSync(filePath, pdfBuffer);

    console.log(`[Curitiba] Certidão Municipal nº ${numeroCertidao} salva com sucesso! (${pdfBuffer.length} bytes)`);

    return {
      sucesso: true,
      situacao: situacao,
      numeroCertidao: numeroCertidao || 'Emitida PMC',
      emissao: emissao || new Date().toISOString().split('T')[0],
      validade: validade,
      nomeArquivo: nomeArquivo,
      downloadUrl: `/api/dossie/download/${cleanCnpj}/${nomeArquivo}`,
      pdfBuffer: pdfBuffer
    };

  } catch (err) {
    console.error('[Curitiba] Erro na automação:', err.message);
    throw err;
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { emitirCndCuritiba };
