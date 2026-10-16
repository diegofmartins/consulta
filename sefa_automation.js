const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function consultarSefaPr(cnpjLimpo) {
  let browser = null;
  try {
    browser = await puppeteer.launch({
      executablePath: '/usr/bin/google-chrome',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled'
      ],
      headless: true
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });

    let listaCertidoes = [];
    let certidaoPdfBuffer = null;
    let numeroCertidaoBaixada = null;

    // Interceptar respostas JSON e PDF
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
          certidaoPdfBuffer = buffer;
          const urlObj = new URL(url);
          numeroCertidaoBaixada = urlObj.searchParams.get('numeroCertidao');
        } catch (e) {}
      }
    });

    await page.goto('https://cdwfazenda.paas.pr.gov.br/cdwportal/certidao/automatica', {
      waitUntil: 'networkidle2',
      timeout: 25000
    });

    // Preencher CNPJ
    const inputSelector = 'input[type="text"]';
    await page.waitForSelector(inputSelector, { timeout: 10000 });
    await page.type(inputSelector, cnpjLimpo, { delay: 50 });

    // Clicar em Emitir Certidão
    const btnSubmit = await page.$('button[type="submit"]');
    if (!btnSubmit) throw new Error('Botão de emissão não encontrado no portal da SEFA-PR');
    await btnSubmit.click();

    // Aguardar requisição de emissão
    await new Promise(r => setTimeout(r, 5000));

    // Se encontramos certidão na lista, tentar baixar o PDF clicando em file_save
    if (listaCertidoes.length > 0) {
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const saveBtn = btns.find(b => b.innerText.includes('file_save'));
        if (saveBtn) saveBtn.click();
      });
      // Aguardar download do PDF
      await new Promise(r => setTimeout(r, 4000));
    }

    await browser.close();
    browser = null;

    if (listaCertidoes.length > 0) {
      const maisRecente = listaCertidoes[0];
      return {
        sucesso: true,
        encontrado: true,
        numeroCertidao: maisRecente.numeroCertidao,
        tipoCertidao: maisRecente.tipoCertidao,
        situacao: maisRecente.tipoCertidao?.toLowerCase().includes('negativa') ? 'NEGATIVA' : 'POSITIVA',
        emissao: maisRecente.emissao ? maisRecente.emissao.split('T')[0] : null,
        validade: maisRecente.validade ? maisRecente.validade.split('T')[0] : null,
        pdfBuffer: certidaoPdfBuffer,
        numeroBaixado: numeroCertidaoBaixada
      };
    }

    return {
      sucesso: false,
      mensagem: 'Não foi possível localizar ou emitir a certidão automaticamente na SEFA-PR.'
    };
  } catch (err) {
    if (browser) await browser.close();
    return {
      sucesso: false,
      erro: err.message
    };
  }
}

module.exports = { consultarSefaPr };
