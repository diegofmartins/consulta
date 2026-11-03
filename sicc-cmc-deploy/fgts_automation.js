const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

/**
 * Emite o Certificado de Regularidade do FGTS (CRF) da Caixa Econômica Federal
 * 100% automático via robô headless (sem captcha).
 * @param {string} cnpj - CNPJ da empresa (14 dígitos)
 * @returns {Promise<Object>} Dados da certidão e buffer do PDF
 */
async function emitirCrfFgts(cnpj) {
  const cleanCnpj = String(cnpj).replace(/\D/g, '');
  if (!cleanCnpj || cleanCnpj.length !== 14) {
    throw new Error('CNPJ inválido para consulta do FGTS');
  }

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

    console.log(`[FGTS] Acessando portal da Caixa para CNPJ: ${cleanCnpj}...`);
    await page.goto('https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Selecionar Tipo de Inscrição: CNPJ (value="1")
    await page.waitForSelector('#mainForm\\:tipoEstabelecimento', { timeout: 15000 });
    await page.select('#mainForm\\:tipoEstabelecimento', '1');

    // Preencher CNPJ
    await page.type('#mainForm\\:txtInscricao1', cleanCnpj, { delay: 20 });

    // Submeter consulta
    console.log('[FGTS] Submetendo formulário de consulta...');
    await page.click('#mainForm\\:btnConsultar');

    // Aguardar atualização do conteúdo da página
    await page.waitForFunction(
      () => {
        const text = document.body ? document.body.innerText : '';
        return text.includes('Situação de Regularidade') ||
               text.includes('REGULAR') ||
               text.includes('não cadastrado') ||
               text.includes('não está regular') ||
               text.includes('Mensagem');
      },
      { timeout: 20000 }
    );

    const textoResultado = await page.evaluate(() => document.body.innerText);

    // Se o empregador não estiver cadastrado ou não estiver regular
    if (textoResultado.includes('não cadastrado') || textoResultado.includes('Inscrição não encontrada')) {
      return {
        sucesso: false,
        situacao: 'NÃO CADASTRADO',
        erro: 'Empregador não cadastrado no sistema do FGTS da Caixa.'
      };
    }

    if (textoResultado.includes('não está regular') || textoResultado.includes('IRREGULAR')) {
      return {
        sucesso: true,
        situacao: 'IRREGULAR',
        numeroCertidao: 'Constam Pendências',
        erro: 'Empresa com pendências cadastrais ou financeiras perante o FGTS.'
      };
    }

    // Clicar no link para obter o Certificado de Regularidade do FGTS - CRF
    console.log('[FGTS] Clicando para obter o Certificado CRF...');
    const linkClicado = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const link = links.find(a => a.innerText.includes('Certificado de Regularidade do FGTS') || a.innerText.includes('CRF'));
      if (link) {
        link.click();
        return true;
      }
      return false;
    });

    if (!linkClicado) {
      throw new Error('Não foi possível localizar o link do Certificado CRF após consulta.');
    }

    // Aguardar renderização da tela final do CRF
    await page.waitForFunction(
      () => {
        const text = document.body ? document.body.innerText : '';
        return text.includes('Certificado Número:') || text.includes('Validade:');
      },
      { timeout: 20000 }
    );

    const crfTexto = await page.evaluate(() => document.body.innerText);

    // Extrair dados: Validade e Número do Certificado
    let numeroCertidao = null;
    let emissao = null;
    let validade = null;

    const matchNum = crfTexto.match(/Certificado Número:\s*([0-9]+)/i);
    if (matchNum) {
      numeroCertidao = matchNum[1].trim();
    }

    const matchVal = crfTexto.match(/Validade:\s*([0-9]{2}\/[0-9]{2}\/[0-9]{4})\s*a\s*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i);
    if (matchVal) {
      const [d1, m1, y1] = matchVal[1].split('/');
      const [d2, m2, y2] = matchVal[2].split('/');
      emissao = `${y1}-${m1}-${d1}`;
      validade = `${y2}-${m2}-${d2}`;
    }

    // Gerar PDF oficial do Certificado CRF
    console.log('[FGTS] Gerando PDF oficial do CRF...');
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '12mm',
        bottom: '12mm',
        left: '15mm',
        right: '15mm'
      }
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const nomeArquivo = `CRF_FGTS_${cleanCnpj}_${numeroCertidao || timestamp}.pdf`;
    const filePath = path.join(cnpjFolder, nomeArquivo);
    fs.writeFileSync(filePath, pdfBuffer);

    console.log(`[FGTS] CRF emitido com sucesso! Número: ${numeroCertidao}, Validade: ${validade}`);

    return {
      sucesso: true,
      situacao: 'REGULAR',
      numeroCertidao: numeroCertidao || 'Emitido Caixa',
      emissao: emissao || new Date().toISOString().split('T')[0],
      validade: validade,
      nomeArquivo: nomeArquivo,
      downloadUrl: `/api/dossie/download/${cleanCnpj}/${nomeArquivo}`,
      pdfBuffer: pdfBuffer
    };

  } catch (err) {
    console.error('[FGTS] Erro na automação:', err.message);
    throw err;
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { emitirCrfFgts };
