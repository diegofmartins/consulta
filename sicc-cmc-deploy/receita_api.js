'use strict';

// Cliente da API oficial "Consulta CND" (SERPRO / Conecta Gov).
// Documentação: consulta de certidões negativas federais (PGFN e RFB).
// Autenticação: OAuth2 client_credentials no gateway do SERPRO.

const TOKEN_URL_PADRAO = 'https://gateway.apiserpro.serpro.gov.br/token';
const CERTIDAO_URL = {
  producao: 'https://gateway.apiserpro.serpro.gov.br/consulta-cnd/v1/certidao',
  homologacao: 'https://gateway.apiserpro.serpro.gov.br/consulta-cnd-hml/v1/certidao'
};

const MENSAGENS_STATUS = {
  3: 'A certidão não pôde ser emitida.',
  4: 'A certidão não pôde ser emitida por situação cadastral impeditiva.',
  8: 'Número de identificação do contribuinte não cadastrado.',
  9: 'Parâmetros inválidos: um ou mais campos não foram informados.',
  10: 'Tipo de contribuinte inválido.',
  11: 'Número de identificação do contribuinte inválido.',
  12: 'Código de identificação inválido.',
  13: 'Chave de consulta demorada inválida ou expirada.',
  14: 'Chave de consulta não encontrada.',
  15: 'Chave informada não se aplica a imóvel rural.',
  99: 'Erro interno do servidor da API CND.'
};

function normalizarAmbiente(valor) {
  return valor === 'homologacao' ? 'homologacao' : 'producao';
}

function falha(codigo, httpStatus, mensagem, extra) {
  return { ok: false, codigo, httpStatus, mensagem, ...(extra || {}) };
}

function normalizarCertidao(certidao) {
  if (!certidao) return null;
  return {
    tipoContribuinte: certidao.TipoContribuinte ?? null,
    contribuinte: certidao.ContribuinteCertidao || null,
    tipoCertidao: certidao.TipoCertidao ?? null,
    codigoControle: certidao.CodigoControle || null,
    dataEmissao: certidao.DataEmissao || null,
    dataValidade: certidao.DataValidade || null,
    documentoPdfBase64: certidao.DocumentoPdf || null
  };
}

function criarClienteReceita(opcoes = {}) {
  const ambiente = normalizarAmbiente(opcoes.ambiente || process.env.CND_AMBIENTE);
  const tokenUrl = opcoes.tokenUrl || process.env.CND_TOKEN_URL || TOKEN_URL_PADRAO;
  const certidaoUrl = opcoes.certidaoUrl || process.env.CND_CERTIDAO_URL || CERTIDAO_URL[ambiente];
  const fetchImpl = opcoes.fetchImpl || globalThis.fetch;
  const sleep = opcoes.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = opcoes.now || Date.now;
  const timeoutMs = opcoes.timeoutMs || 30000;
  const maxTentativas = opcoes.maxTentativas || 12;
  const retryDelayMs = opcoes.retryDelayMs ?? 1000;

  const consumerKey = opcoes.consumerKey || '';
  const consumerSecret = opcoes.consumerSecret || '';

  let tokenCache = null;

  async function obterToken() {
    if (tokenCache && now() < tokenCache.expiraEm) {
      return { ok: true, token: tokenCache.token };
    }
    if (!consumerKey || !consumerSecret) {
      return falha(
        'CREDENCIAIS_AUSENTES',
        503,
        'Credenciais do SERPRO não configuradas. Informe o consumer key e o consumer secret.'
      );
    }

    const basico = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    let resposta;
    try {
      resposta = await fetchImpl(tokenUrl, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basico}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials',
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (err) {
      return falha('REDE_TOKEN', 502, `Falha de rede ao obter o token do SERPRO: ${err.message}`);
    }

    if (resposta.status === 401) {
      return falha('CREDENCIAIS_INVALIDAS', 502, 'Consumer key ou secret inválidos, ou limite do plano de consumo atingido.');
    }
    if (resposta.status === 415) {
      return falha('TOKEN_CONTENT_TYPE', 502, 'Requisição de token recusada: use Content-Type application/x-www-form-urlencoded.');
    }

    let json = {};
    try { json = await resposta.json(); } catch (err) { json = {}; }

    if (!resposta.ok || !json.access_token) {
      return falha(
        'TOKEN_FALHOU',
        502,
        json.error_description || `Não foi possível obter o token do SERPRO (HTTP ${resposta.status}).`
      );
    }

    const expiraEmSegundos = Number(json.expires_in) || 3600;
    tokenCache = {
      token: json.access_token,
      expiraEm: now() + Math.max(0, expiraEmSegundos - 60) * 1000
    };
    return { ok: true, token: json.access_token };
  }

  async function consultarCnd(cnpj, opcoesConsulta = {}) {
    const limpo = String(cnpj || '').replace(/\D/g, '');
    if (limpo.length !== 14) {
      return falha('CNPJ_INVALIDO', 400, 'O CNPJ deve conter 14 dígitos.');
    }

    const gerarPdf = opcoesConsulta.gerarPdf !== false;
    let chave = null;

    for (let tentativa = 1; tentativa <= maxTentativas; tentativa += 1) {
      const token = await obterToken();
      if (!token.ok) return token;

      const corpo = {
        TipoContribuinte: 1,
        ContribuinteConsulta: limpo,
        CodigoIdentificacao: '9201',
        GerarCertidaoPdf: gerarPdf
      };
      if (chave) corpo.Chave = chave;

      let resposta;
      try {
        resposta = await fetchImpl(certidaoUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token.token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify(corpo),
          signal: AbortSignal.timeout(timeoutMs)
        });
      } catch (err) {
        if (tentativa < maxTentativas) { await sleep(retryDelayMs); continue; }
        return falha('REDE', 502, `Falha de rede ao consultar a API CND: ${err.message}`);
      }

      let json = {};
      try { json = await resposta.json(); } catch (err) { json = {}; }

      if (resposta.status === 401) {
        return falha('NAO_AUTORIZADO', 502, json.Mensagem || 'Token inválido ou expirado, ou limite do plano de consumo atingido.');
      }
      if (resposta.status === 403) {
        return falha('IP_NAO_AUTORIZADO', 502, json.Mensagem || 'O IP deste servidor não tem permissão para acessar o serviço.');
      }
      if (resposta.status === 415) {
        return falha('TOKEN_CONTENT_TYPE', 502, json.Mensagem || 'Tipo de mídia não suportado na chamada do token.');
      }
      if (resposta.status === 504) {
        if (tentativa < maxTentativas) { await sleep(retryDelayMs); continue; }
        return falha('GATEWAY_TIMEOUT', 504, 'O serviço da Receita não respondeu a tempo. Tente novamente.');
      }

      const status = Number(json.Status);

      if (status === 1 || status === 2) {
        return {
          ok: true,
          status,
          mensagem: json.Mensagem || 'Processamento OK.',
          certidao: normalizarCertidao(json.Certidao)
        };
      }

      if (status === 7) {
        // Consulta demorada: repetir usando sempre a chave mais recente.
        chave = json.Chave || chave;
        if (tentativa < maxTentativas) { await sleep(retryDelayMs); continue; }
        break;
      }

      if (status === 5 || status === 6) {
        // Análise inconsistente ou base indisponível: repetir a consulta.
        if (tentativa < maxTentativas) { await sleep(retryDelayMs); continue; }
        return falha('PROCESSAMENTO_INCONSISTENTE', 503, json.Mensagem || MENSAGENS_STATUS[status]);
      }

      if (status === 13 || status === 14) {
        // Chave expirada/inexistente: repetir sem a chave para iniciar nova consulta.
        if (chave) { chave = null; continue; }
        return falha('CHAVE_INVALIDA', 404, json.Mensagem || MENSAGENS_STATUS[status]);
      }

      const httpStatus = status === 3 || status === 4 ? 422
        : status === 8 ? 404
          : status === 99 ? 500
            : status >= 9 && status <= 12 || status === 15 ? 400
              : 422;

      const codigo = status === 3 || status === 4 ? 'CERTIDAO_NAO_EMITIDA'
        : status === 8 ? 'CONTRIBUINTE_NAO_ENCONTRADO'
          : status === 99 ? 'ERRO_SERVIDOR'
            : `STATUS_${status}`;

      return falha(codigo, httpStatus, json.Mensagem || MENSAGENS_STATUS[status] || `Status inesperado ${status}.`, {
        statusCnd: Number.isFinite(status) ? status : null
      });
    }

    return falha(
      'TEMPO_ESGOTADO',
      504,
      'A consulta não foi concluída após várias tentativas. Tente novamente em instantes.'
    );
  }

  return { ambiente, certidaoUrl, tokenUrl, consultarCnd, obterToken };
}

module.exports = { criarClienteReceita, CERTIDAO_URL, TOKEN_URL_PADRAO, normalizarAmbiente };
