// SICC-CMC: Sistema Integrado de Consulta e Conformidade de Certidões
// Câmara Municipal de Curitiba - Diretoria de Contratações
// Zero dependências externas (utiliza módulos nativos do Node.js v20+)

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { consultarSefaPr } = require('./sefa_automation');
const { abrirReceitaAssistida } = require('./receita_automation');
const { emitirCrfFgts } = require('./fgts_automation');
const { emitirCndCuritiba } = require('./curitiba_automation');
const { emitirCertidaoConsolidadaTcu } = require('./tcu_automation');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Garantir diretórios essenciais
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const CONTRATADAS_FILE = path.join(DATA_DIR, 'contratadas.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

if (!fs.existsSync(CONTRATADAS_FILE)) {
  fs.writeFileSync(CONTRATADAS_FILE, JSON.stringify([], null, 2), 'utf-8');
}
if (!fs.existsSync(CONFIG_FILE)) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ cguApiKey: '' }, null, 2), 'utf-8');
}

// Helpers
function sanitizeCnpj(cnpj) {
  return String(cnpj || '').replace(/\D/g, '');
}

function readJsonFile(filePath, defaultValue = []) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error(`Erro ao ler arquivo ${filePath}:`, err.message);
  }
  return defaultValue;
}

function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error(`Erro ao salvar arquivo ${filePath}:`, err.message);
    return false;
  }
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 25 * 1024 * 1024) { // Limite de 25MB para PDFs base64
        reject(new Error('Tamanho máximo da requisição excedido'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('JSON inválido'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
  });
  res.end(payload);
}

function sendError(res, statusCode, message, details = null) {
  sendJson(res, statusCode, { sucesso: false, erro: message, detalhes: details });
}

// Cabeçalhos HTTP para emular requisições de navegador
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
};

// =================== ROTAS DA API ===================

// 1. Consulta Unificada do CNPJ (BrasilAPI + Compras.gov.br SICAF + CGU + Histórico Local)
async function handleConsultaCnpj(req, res, cnpj) {
  const cleanCnpj = sanitizeCnpj(cnpj);
  if (cleanCnpj.length !== 14) {
    return sendError(res, 400, 'CNPJ inválido. O CNPJ deve conter exatamente 14 dígitos.');
  }

  const config = readJsonFile(CONFIG_FILE, { cguApiKey: '' });
  const contratadas = readJsonFile(CONTRATADAS_FILE, []);
  const dossieExistente = contratadas.find(c => sanitizeCnpj(c.cnpj) === cleanCnpj) || null;

  const resultado = {
    sucesso: true,
    cnpj: cleanCnpj,
    dadosCadastrais: null,
    sicaf: null,
    sancoesCgu: {
      ceis: [],
      cnep: [],
      cepim: [],
      chaveConfigurada: Boolean(config.cguApiKey),
      erro: null
    },
    dossieLocal: dossieExistente
  };

  // 1.1 BrasilAPI (Dados Cadastrais da RFB)
  try {
    const brasilRes = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(10000)
    });
    if (brasilRes.ok) {
      resultado.dadosCadastrais = await brasilRes.json();
    } else {
      resultado.dadosCadastrais = { erro: `Status ${brasilRes.status}: Não encontrado ou indisponível` };
    }
  } catch (err) {
    resultado.dadosCadastrais = { erro: `Erro ao consultar BrasilAPI: ${err.message}` };
  }

  // 1.2 Compras.gov.br / SICAF (Dados Abertos de Fornecedores do Governo Federal)
  try {
    const sicafUrl = `https://dadosabertos.compras.gov.br/modulo-fornecedor/1_consultarFornecedor?cnpj=${cleanCnpj}&ativo=true`;
    const sicafRes = await fetch(sicafUrl, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(10000)
    });
    if (sicafRes.ok) {
      const sicafData = await sicafRes.json();
      if (sicafData.resultado && sicafData.resultado.length > 0) {
        resultado.sicaf = {
          encontrado: true,
          cadastrado: true,
          ativo: sicafData.resultado[0].ativo,
          habilitadoLicitar: sicafData.resultado[0].habilitadoLicitar,
          porte: sicafData.resultado[0].porteEmpresaNome,
          naturezaJuridica: sicafData.resultado[0].naturezaJuridicaNome,
          detalhes: sicafData.resultado[0]
        };
      } else {
        resultado.sicaf = {
          encontrado: false,
          cadastrado: false,
          habilitadoLicitar: null,
          mensagem: 'Fornecedor sem cadastro ativo localizado no SICAF Dados Abertos.'
        };
      }
    }
  } catch (err) {
    resultado.sicaf = { encontrado: false, erro: err.message };
  }

  // 1.3 Portal da Transparência CGU (CEIS e CNEP)
  if (config.cguApiKey) {
    try {
      const cguHeaders = {
        ...BROWSER_HEADERS,
        'chave-api-dados': config.cguApiKey
      };
      
      const [ceisRes, cnepRes] = await Promise.all([
        fetch(`https://api.portaldatransparencia.gov.br/api-de-dados/ceis?codigoSancionado=${cleanCnpj}&pagina=1`, {
          headers: cguHeaders,
          signal: AbortSignal.timeout(10000)
        }),
        fetch(`https://api.portaldatransparencia.gov.br/api-de-dados/cnep?codigoSancionado=${cleanCnpj}&pagina=1`, {
          headers: cguHeaders,
          signal: AbortSignal.timeout(10000)
        })
      ]);

      if (ceisRes.ok) {
        resultado.sancoesCgu.ceis = await ceisRes.json();
      }
      if (cnepRes.ok) {
        resultado.sancoesCgu.cnep = await cnepRes.json();
      }
    } catch (err) {
      resultado.sancoesCgu.erro = `Erro ao consultar API da CGU: ${err.message}`;
    }
  }

  sendJson(res, 200, resultado);
}

// 2. TST - Obter Desafio Captcha
async function handleTstCaptcha(req, res) {
  try {
    console.log('[TST] Solicitando novo desafio de captcha...');
    let tstRes;
    try {
      tstRes = await fetch('https://cndt-certidao.tst.jus.br/api/captcha', {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(20000)
      });
    } catch (e) {
      console.warn(`[TST] Primeira tentativa falhou (${e.message}), tentando novamente...`);
      tstRes = await fetch('https://cndt-certidao.tst.jus.br/api/captcha', {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(25000)
      });
    }

    if (!tstRes.ok) {
      throw new Error(`Servidor do TST retornou HTTP ${tstRes.status}`);
    }
    const data = await tstRes.json();
    console.log('[TST] Desafio de captcha obtido com sucesso!');
    sendJson(res, 200, {
      sucesso: true,
      token: data.token,
      imagemBase64: data.imagem,
      audioBase64: data.audio
    });
  } catch (err) {
    console.error(`[TST] Erro ao obter captcha: ${err.message}`);
    sendError(res, 502, `Falha ao conectar com o serviço do TST: ${err.message}`);
  }
}

// 3. TST - Emitir Certidão com Captcha e Baixar PDF Oficial
async function handleTstEmitir(req, res) {
  try {
    const body = await parseJsonBody(req);
    const { cnpj, tokenDesafio, resposta } = body;
    const cleanCnpj = sanitizeCnpj(cnpj);

    if (!cleanCnpj || !tokenDesafio || !resposta) {
      return sendError(res, 400, 'Campos obrigatórios: cnpj, tokenDesafio e resposta do captcha');
    }

    console.log(`[TST] Emitindo certidão para CNPJ: ${cleanCnpj} com código: "${resposta}"...`);

    const tstRes = await fetch('https://cndt-certidao.tst.jus.br/api/certidao', {
      method: 'POST',
      headers: {
        ...BROWSER_HEADERS,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        cpfCnpj: cleanCnpj,
        tokenDesafio: tokenDesafio,
        resposta: resposta,
        email: null
      }),
      signal: AbortSignal.timeout(30000)
    });

    const contentType = tstRes.headers.get('content-type') || '';

    // Se o TST respondeu com PDF (sucesso na emissão)
    if (tstRes.ok && contentType.includes('application/pdf')) {
      const arrayBuffer = await tstRes.arrayBuffer();
      const pdfBuffer = Buffer.from(arrayBuffer);

      // Salvar PDF no disco
      const cnpjFolder = path.join(UPLOADS_DIR, cleanCnpj);
      if (!fs.existsSync(cnpjFolder)) fs.mkdirSync(cnpjFolder, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `CNDT_${cleanCnpj}_${timestamp}.pdf`;
      const filePath = path.join(cnpjFolder, fileName);
      fs.writeFileSync(filePath, pdfBuffer);

      return sendJson(res, 200, {
        sucesso: true,
        tipo: 'pdf',
        nomeArquivo: fileName,
        tamanhoBytes: pdfBuffer.length,
        downloadUrl: `/api/dossie/download/${cleanCnpj}/${fileName}`,
        pdfBase64: pdfBuffer.toString('base64')
      });
    }

    // Se houve erro (ex: captcha inválido ou erro no TST)
    const errorJson = await tstRes.json().catch(() => ({}));
    return sendError(res, 422, errorJson.erro || 'Falha na emissão da certidão pelo TST (verifique o captcha digitado)');
  } catch (err) {
    sendError(res, 500, `Erro ao processar emissão no TST: ${err.message}`);
  }
}

// 4. TST - Validar Certidão por Número e Ano (Sem Captcha!)
async function handleTstValidar(req, res) {
  try {
    const body = await parseJsonBody(req);
    const { cnpj, numCertidao, anoCertidao } = body;
    const cleanCnpj = sanitizeCnpj(cnpj);

    if (!cleanCnpj || !numCertidao || !anoCertidao) {
      return sendError(res, 400, 'Campos obrigatórios: cnpj, numCertidao e anoCertidao');
    }

    const tstRes = await fetch('https://cndt-certidao.tst.jus.br/api/certidao/validacao', {
      method: 'POST',
      headers: {
        ...BROWSER_HEADERS,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        cpfCnpj: cleanCnpj,
        numCertidao: parseInt(numCertidao, 10),
        anoCertidao: parseInt(anoCertidao, 10)
      }),
      signal: AbortSignal.timeout(20000)
    });

    const contentType = tstRes.headers.get('content-type') || '';

    if (tstRes.ok && contentType.includes('application/pdf')) {
      const arrayBuffer = await tstRes.arrayBuffer();
      const pdfBuffer = Buffer.from(arrayBuffer);

      const cnpjFolder = path.join(UPLOADS_DIR, cleanCnpj);
      if (!fs.existsSync(cnpjFolder)) fs.mkdirSync(cnpjFolder, { recursive: true });

      const fileName = `CNDT_VALIDADA_${cleanCnpj}_${numCertidao}_${anoCertidao}.pdf`;
      const filePath = path.join(cnpjFolder, fileName);
      fs.writeFileSync(filePath, pdfBuffer);

      return sendJson(res, 200, {
        sucesso: true,
        valida: true,
        mensagem: 'Certidão validada com sucesso pelo TST.',
        nomeArquivo: fileName,
        downloadUrl: `/api/dossie/download/${cleanCnpj}/${fileName}`,
        pdfBase64: pdfBuffer.toString('base64')
      });
    }

    const errorJson = await tstRes.json().catch(() => ({}));
    return sendJson(res, 200, {
      sucesso: false,
      valida: false,
      erro: errorJson.erro || 'Certidão não localizada ou inválida na base de dados do TST.'
    });
  } catch (err) {
    sendError(res, 500, `Erro ao validar certidão no TST: ${err.message}`);
  }
}

// 4.1. SEFA-PR - Emissão Automática via Robô com Puppeteer Stealth
async function handleSefaEmitir(req, res) {
  try {
    const body = await parseJsonBody(req);
    const cleanCnpj = sanitizeCnpj(body.cnpj);

    if (!cleanCnpj || cleanCnpj.length !== 14) {
      return sendError(res, 400, 'CNPJ inválido');
    }

    const resultado = await consultarSefaPr(cleanCnpj);

    if (!resultado.sucesso) {
      return sendError(res, 422, resultado.erro || resultado.mensagem || 'Falha ao consultar a SEFA-PR');
    }

    let fileName = null;
    let downloadUrl = null;

    if (resultado.pdfBuffer) {
      const cnpjFolder = path.join(UPLOADS_DIR, cleanCnpj);
      if (!fs.existsSync(cnpjFolder)) fs.mkdirSync(cnpjFolder, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      fileName = `CND_ESTADUAL_PR_${cleanCnpj}_${resultado.numeroCertidao || timestamp}.pdf`;
      const filePath = path.join(cnpjFolder, fileName);
      fs.writeFileSync(filePath, resultado.pdfBuffer);
      downloadUrl = `/api/dossie/download/${cleanCnpj}/${fileName}`;
    }

    sendJson(res, 200, {
      sucesso: true,
      numeroCertidao: resultado.numeroCertidao,
      situacao: resultado.situacao,
      emissao: resultado.emissao,
      validade: resultado.validade,
      nomeArquivo: fileName,
      downloadUrl: downloadUrl,
      pdfBase64: resultado.pdfBuffer ? resultado.pdfBuffer.toString('base64') : null
    });
  } catch (err) {
    sendError(res, 500, `Erro na automação da SEFA-PR: ${err.message}`);
  }
}

// 4.2. Receita Federal - Emissão Assistida com Janela Compacta e Resolução de hCaptcha
async function handleReceitaEmitirAssistido(req, res) {
  try {
    const body = await parseJsonBody(req);
    const cleanCnpj = sanitizeCnpj(body.cnpj);

    if (!cleanCnpj || cleanCnpj.length !== 14) {
      return sendError(res, 400, 'CNPJ inválido');
    }

    const resultado = await abrirReceitaAssistida(cleanCnpj);

    if (!resultado.sucesso) {
      return sendError(res, 422, resultado.erro || 'Emissão cancelada ou tempo limite excedido na Receita Federal');
    }

    let downloadUrl = null;
    let fileName = resultado.nomeArquivo;

    if (!fileName && resultado.pdfBuffer) {
      const cnpjFolder = path.join(UPLOADS_DIR, cleanCnpj);
      if (!fs.existsSync(cnpjFolder)) fs.mkdirSync(cnpjFolder, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      fileName = `CND_FEDERAL_${cleanCnpj}_${timestamp}.pdf`;
      const filePath = path.join(cnpjFolder, fileName);
      fs.writeFileSync(filePath, resultado.pdfBuffer);
    }

    if (fileName) {
      downloadUrl = `/api/dossie/download/${cleanCnpj}/${fileName}`;
    }

    sendJson(res, 200, {
      sucesso: true,
      numeroCertidao: resultado.numeroCertidao || 'Emitida via RFB',
      situacao: resultado.situacao || 'NEGATIVA',
      emissao: resultado.emissao || new Date().toISOString().split('T')[0],
      validade: resultado.validade || null,
      nomeArquivo: fileName,
      downloadUrl: downloadUrl,
      pdfBase64: resultado.pdfBuffer ? resultado.pdfBuffer.toString('base64') : null
    });
  } catch (err) {
    sendError(res, 500, `Erro na automação da Receita Federal: ${err.message}`);
  }
}

// 4.3. Caixa Econômica Federal - Emissão Automática de CRF FGTS (Robô Headless)
async function handleFgtsEmitir(req, res) {
  try {
    const body = await parseJsonBody(req);
    const cleanCnpj = sanitizeCnpj(body.cnpj);

    if (!cleanCnpj || cleanCnpj.length !== 14) {
      return sendError(res, 400, 'CNPJ inválido');
    }

    const resultado = await emitirCrfFgts(cleanCnpj);

    if (!resultado.sucesso) {
      return sendJson(res, 200, {
        sucesso: false,
        situacao: resultado.situacao || 'IRREGULAR',
        erro: resultado.erro || 'Empresa não regular no FGTS'
      });
    }

    sendJson(res, 200, {
      sucesso: true,
      numeroCertidao: resultado.numeroCertidao,
      situacao: resultado.situacao,
      emissao: resultado.emissao,
      validade: resultado.validade,
      nomeArquivo: resultado.nomeArquivo,
      downloadUrl: resultado.downloadUrl,
      pdfBase64: resultado.pdfBuffer ? resultado.pdfBuffer.toString('base64') : null
    });
  } catch (err) {
    sendError(res, 500, `Erro na automação do FGTS/Caixa: ${err.message}`);
  }
}

// 4.4. Prefeitura Municipal de Curitiba (PMC) - Emissão Automática de CND Municipal
async function handleCuritibaEmitir(req, res) {
  try {
    const body = await parseJsonBody(req);
    const cleanCnpj = sanitizeCnpj(body.cnpj);

    if (!cleanCnpj || cleanCnpj.length !== 14) {
      return sendError(res, 400, 'CNPJ inválido');
    }

    const resultado = await emitirCndCuritiba(cleanCnpj);

    if (!resultado.sucesso) {
      return sendJson(res, 200, {
        sucesso: false,
        situacao: resultado.situacao || 'PENDENTE',
        erro: resultado.erro || 'Não foi possível emitir a certidão municipal'
      });
    }

    sendJson(res, 200, {
      sucesso: true,
      numeroCertidao: resultado.numeroCertidao,
      situacao: resultado.situacao,
      emissao: resultado.emissao,
      validade: resultado.validade,
      nomeArquivo: resultado.nomeArquivo,
      downloadUrl: resultado.downloadUrl,
      pdfBase64: resultado.pdfBuffer ? resultado.pdfBuffer.toString('base64') : null
    });
  } catch (err) {
    sendError(res, 500, `Erro na automação da Prefeitura de Curitiba: ${err.message}`);
  }
}

// 4.5. TCU / APF - Emissão Automática da Certidão Consolidada (TCU, CNJ, CEIS, CNEP)
async function handleTcuEmitir(req, res) {
  try {
    const body = await parseJsonBody(req);
    const cleanCnpj = sanitizeCnpj(body.cnpj);

    if (!cleanCnpj || cleanCnpj.length !== 14) {
      return sendError(res, 400, 'CNPJ inválido');
    }

    const resultado = await emitirCertidaoConsolidadaTcu(cleanCnpj);

    if (!resultado.sucesso) {
      return sendJson(res, 200, {
        sucesso: false,
        situacao: resultado.situacao || 'PENDENTE',
        erro: resultado.erro || 'Não foi possível emitir a certidão consolidada'
      });
    }

    sendJson(res, 200, {
      sucesso: true,
      numeroCertidao: resultado.numeroCertidao,
      situacao: resultado.situacao,
      emissao: resultado.emissao,
      validade: resultado.validade,
      nomeArquivo: resultado.nomeArquivo,
      downloadUrl: resultado.downloadUrl,
      detalhes: resultado.detalhes || [],
      pdfBase64: resultado.pdfBuffer ? resultado.pdfBuffer.toString('base64') : null
    });
  } catch (err) {
    sendError(res, 500, `Erro na automação da Certidão APF (TCU/CGU): ${err.message}`);
  }
}

// 5. Upload e Vinculação de Arquivo PDF de Certidão
async function handleUploadPdf(req, res) {
  try {
    const body = await parseJsonBody(req);
    const { cnpj, certTipo, nomeArquivo, base64 } = body;
    const cleanCnpj = sanitizeCnpj(cnpj);

    if (!cleanCnpj || !certTipo || !base64) {
      return sendError(res, 400, 'Campos obrigatórios: cnpj, certTipo e base64');
    }

    const cnpjFolder = path.join(UPLOADS_DIR, cleanCnpj);
    if (!fs.existsSync(cnpjFolder)) fs.mkdirSync(cnpjFolder, { recursive: true });

    const safeBaseName = (nomeArquivo || `${certTipo}.pdf`).replace(/[^a-zA-Z0-9_.-]/g, '_');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const finalFileName = `${certTipo.toUpperCase()}_${timestamp}_${safeBaseName}`;
    const filePath = path.join(cnpjFolder, finalFileName);

    const pdfBuffer = Buffer.from(base64, 'base64');
    fs.writeFileSync(filePath, pdfBuffer);

    sendJson(res, 200, {
      sucesso: true,
      nomeArquivo: finalFileName,
      tamanhoBytes: pdfBuffer.length,
      downloadUrl: `/api/dossie/download/${cleanCnpj}/${finalFileName}`
    });
  } catch (err) {
    sendError(res, 500, `Erro ao salvar PDF: ${err.message}`);
  }
}

// 6. Download / Visualização de Arquivo PDF
function handleDownloadPdf(req, res, cnpj, fileName) {
  const cleanCnpj = sanitizeCnpj(cnpj);
  const safeFileName = path.basename(fileName);
  const filePath = path.join(UPLOADS_DIR, cleanCnpj, safeFileName);

  if (!fs.existsSync(filePath)) {
    return sendError(res, 404, 'Arquivo PDF não encontrado');
  }

  const stat = fs.statSync(filePath);
  const isAttachment = req.url.includes('download=1') || req.url.includes('attachment=1');
  res.writeHead(200, {
    'Content-Type': 'application/pdf',
    'Content-Length': stat.size,
    'Content-Disposition': `${isAttachment ? 'attachment' : 'inline'}; filename="${safeFileName}"`
  });
  if (req.method === 'HEAD') {
    return res.end();
  }
  const readStream = fs.createReadStream(filePath);
  readStream.pipe(res);
}

// 7. Salvar Dossiê de Certidões de Contratada
async function handleSalvarDossie(req, res) {
  try {
    const dossie = await parseJsonBody(req);
    const cleanCnpj = sanitizeCnpj(dossie.cnpj);

    if (!cleanCnpj || cleanCnpj.length !== 14) {
      return sendError(res, 400, 'CNPJ inválido');
    }

    const contratadas = readJsonFile(CONTRATADAS_FILE, []);
    const index = contratadas.findIndex(c => sanitizeCnpj(c.cnpj) === cleanCnpj);

    dossie.cnpj = cleanCnpj;
    dossie.atualizadoEm = new Date().toISOString();

    if (index >= 0) {
      contratadas[index] = { ...contratadas[index], ...dossie };
    } else {
      dossie.criadoEm = new Date().toISOString();
      contratadas.push(dossie);
    }

    writeJsonFile(CONTRATADAS_FILE, contratadas);

    sendJson(res, 200, {
      sucesso: true,
      mensagem: 'Dossiê da contratada salvo com sucesso.',
      dossie: dossie
    });
  } catch (err) {
    sendError(res, 500, `Erro ao salvar dossiê: ${err.message}`);
  }
}

// 8. Listar Todas as Contratadas
function handleListarContratadas(req, res) {
  const contratadas = readJsonFile(CONTRATADAS_FILE, []);
  sendJson(res, 200, {
    sucesso: true,
    total: contratadas.length,
    contratadas: contratadas
  });
}

// 9. Excluir Contratada
function handleExcluirContratada(req, res, cnpj) {
  const cleanCnpj = sanitizeCnpj(cnpj);
  let contratadas = readJsonFile(CONTRATADAS_FILE, []);
  const initialLength = contratadas.length;
  contratadas = contratadas.filter(c => sanitizeCnpj(c.cnpj) !== cleanCnpj);

  if (contratadas.length === initialLength) {
    return sendError(res, 404, 'Contratada não encontrada');
  }

  writeJsonFile(CONTRATADAS_FILE, contratadas);
  sendJson(res, 200, { sucesso: true, mensagem: 'Contratada removida com sucesso' });
}

// 10. Obter e Atualizar Configurações (ex: Chave CGU)
async function handleConfig(req, res) {
  if (req.method === 'GET') {
    const config = readJsonFile(CONFIG_FILE, { cguApiKey: '' });
    // Mascarar a chave na exibição
    const maskedKey = config.cguApiKey
      ? config.cguApiKey.slice(0, 4) + '****************' + config.cguApiKey.slice(-4)
      : '';
    sendJson(res, 200, {
      sucesso: true,
      temChaveCgu: Boolean(config.cguApiKey),
      chaveMascarada: maskedKey
    });
  } else if (req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const config = readJsonFile(CONFIG_FILE, { cguApiKey: '' });
      if (typeof body.cguApiKey === 'string') {
        config.cguApiKey = body.cguApiKey.trim();
      }
      writeJsonFile(CONFIG_FILE, config);
      sendJson(res, 200, { sucesso: true, mensagem: 'Configurações atualizadas com sucesso' });
    } catch (err) {
      sendError(res, 400, 'Erro ao salvar configurações');
    }
  } else {
    sendError(res, 405, 'Método não permitido');
  }
}

// =================== SERVIDOR DE ARQUIVOS ESTÁTICOS ===================
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf'
};

function serveStatic(req, res, pathname) {
  let relativePath = pathname === '/' ? '/index.html' : pathname;
  let filePath = path.join(PUBLIC_DIR, relativePath);

  // Prevenir Directory Traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return sendError(res, 403, 'Acesso negado');
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      return sendError(res, 404, 'Arquivo não encontrado');
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
}

// =================== ROTEADOR HTTP PRINCIPAL ===================
const server = http.createServer((req, res) => {
  // Tratar requisições OPTIONS (CORS preflight)
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
    });
    return res.end();
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Rotas de API
  if (pathname.startsWith('/api/')) {
    if (pathname.startsWith('/api/consulta/') && req.method === 'GET') {
      const cnpj = pathname.replace('/api/consulta/', '');
      return handleConsultaCnpj(req, res, cnpj);
    }
    if (pathname === '/api/tst/captcha' && req.method === 'GET') {
      return handleTstCaptcha(req, res);
    }
    if (pathname === '/api/tst/emitir' && req.method === 'POST') {
      return handleTstEmitir(req, res);
    }
    if (pathname === '/api/tst/validar' && req.method === 'POST') {
      return handleTstValidar(req, res);
    }
    if (pathname === '/api/sefa/emitir' && req.method === 'POST') {
      return handleSefaEmitir(req, res);
    }
    if (pathname === '/api/receita/emitir-assistido' && req.method === 'POST') {
      return handleReceitaEmitirAssistido(req, res);
    }
    if (pathname === '/api/fgts/emitir' && req.method === 'POST') {
      return handleFgtsEmitir(req, res);
    }
    if (pathname === '/api/curitiba/emitir' && req.method === 'POST') {
      return handleCuritibaEmitir(req, res);
    }
    if (pathname === '/api/tcu/emitir' && req.method === 'POST') {
      return handleTcuEmitir(req, res);
    }
    if (pathname === '/api/dossie/upload-pdf' && req.method === 'POST') {
      return handleUploadPdf(req, res);
    }
    if (pathname.startsWith('/api/dossie/download/') && (req.method === 'GET' || req.method === 'HEAD')) {
      const parts = pathname.replace('/api/dossie/download/', '').split('/');
      if (parts.length >= 2) {
        return handleDownloadPdf(req, res, parts[0], parts.slice(1).join('/'));
      }
      return sendError(res, 400, 'Parâmetros de download inválidos');
    }
    if (pathname === '/api/dossie/salvar' && req.method === 'POST') {
      return handleSalvarDossie(req, res);
    }
    if (pathname === '/api/contratadas' && req.method === 'GET') {
      return handleListarContratadas(req, res);
    }
    if (pathname.startsWith('/api/contratadas/') && req.method === 'DELETE') {
      const cnpj = pathname.replace('/api/contratadas/', '');
      return handleExcluirContratada(req, res, cnpj);
    }
    if (pathname === '/api/config') {
      return handleConfig(req, res);
    }

    return sendError(res, 404, 'Endpoint de API não encontrado');
  }

  // Arquivos Estáticos da Aplicação Web
  serveStatic(req, res, pathname);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`================================================================`);
  console.log(` SICC - Sistema de Consulta de Certidões (Câmara de Curitiba)`);
  console.log(` Servidor ativo e pronto para uso em: http://localhost:${PORT}`);
  console.log(`================================================================`);
});
