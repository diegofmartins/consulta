'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { criarClienteReceita } = require('../receita_api');

const TOKEN_URL = 'https://token.test';
const CERT_URL = 'https://cert.test';

function resposta(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

function certidao(extra = {}) {
  return {
    TipoContribuinte: 1,
    ContribuinteCertidao: '00000000000002',
    TipoCertidao: 2,
    CodigoControle: 'CTRL123',
    DataEmissao: '2026-05-05T10:56:41',
    DataValidade: '2026-11-01',
    DocumentoPdf: 'UERG',
    ...extra
  };
}

function cliente(fetchImpl, over = {}) {
  return criarClienteReceita({
    consumerKey: 'chave',
    consumerSecret: 'segredo',
    tokenUrl: TOKEN_URL,
    certidaoUrl: CERT_URL,
    fetchImpl,
    sleep: async () => {},
    ...over
  });
}

test('status 1 retorna a certidão normalizada', async () => {
  const fetchImpl = async (u) =>
    u === TOKEN_URL ? resposta({ access_token: 'T', expires_in: 3600 }) : resposta({ Status: 1, Mensagem: 'ok', Certidao: certidao() });

  const r = await cliente(fetchImpl).consultarCnd('00000000000001');

  assert.equal(r.ok, true);
  assert.equal(r.status, 1);
  assert.equal(r.certidao.codigoControle, 'CTRL123');
  assert.equal(r.certidao.dataValidade, '2026-11-01');
  assert.equal(r.certidao.documentoPdfBase64, 'UERG');
});

test('envia o corpo esperado e usa Basic auth no token', async () => {
  const chamadas = [];
  const fetchImpl = async (u, o) => {
    chamadas.push({ u, o });
    return u === TOKEN_URL ? resposta({ access_token: 'T', expires_in: 3600 }) : resposta({ Status: 2, Certidao: certidao() });
  };

  await cliente(fetchImpl).consultarCnd('12345678000199');

  const token = chamadas[0];
  assert.equal(token.o.method, 'POST');
  assert.equal(token.o.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(token.o.headers.Authorization, 'Basic ' + Buffer.from('chave:segredo').toString('base64'));
  assert.equal(token.o.body, 'grant_type=client_credentials');

  const cert = chamadas[1];
  assert.equal(cert.u, CERT_URL);
  assert.equal(cert.o.headers.Authorization, 'Bearer T');
  const corpo = JSON.parse(cert.o.body);
  assert.deepEqual(corpo, {
    TipoContribuinte: 1,
    ContribuinteConsulta: '12345678000199',
    CodigoIdentificacao: '9201',
    GerarCertidaoPdf: true
  });
});

test('status 7 repete a consulta usando a chave retornada', async () => {
  let n = 0;
  const corpos = [];
  const fetchImpl = async (u, o) => {
    if (u === TOKEN_URL) return resposta({ access_token: 'T', expires_in: 3600 });
    corpos.push(JSON.parse(o.body));
    n += 1;
    return n === 1 ? resposta({ Status: 7, Mensagem: 'processando', Chave: 'K1' }) : resposta({ Status: 2, Certidao: certidao() });
  };

  const r = await cliente(fetchImpl).consultarCnd('00000000000001');

  assert.equal(r.ok, true);
  assert.equal(corpos.length, 2);
  assert.equal(corpos[1].Chave, 'K1');
});

test('status 5 e 6 são repetidos', async () => {
  let n = 0;
  const fetchImpl = async (u) => {
    if (u === TOKEN_URL) return resposta({ access_token: 'T', expires_in: 3600 });
    n += 1;
    if (n === 1) return resposta({ Status: 5 });
    if (n === 2) return resposta({ Status: 6 });
    return resposta({ Status: 1, Certidao: certidao() });
  };

  const r = await cliente(fetchImpl).consultarCnd('00000000000001');
  assert.equal(r.ok, true);
  assert.equal(n, 3);
});

test('status 4 informa certidão não emitida', async () => {
  const fetchImpl = async (u) =>
    u === TOKEN_URL ? resposta({ access_token: 'T', expires_in: 3600 }) : resposta({ Status: 4, Mensagem: 'Situação cadastral impeditiva' });

  const r = await cliente(fetchImpl).consultarCnd('00000000000001');

  assert.equal(r.ok, false);
  assert.equal(r.codigo, 'CERTIDAO_NAO_EMITIDA');
  assert.equal(r.httpStatus, 422);
});

test('HTTP 401 informa problema de token ou limite', async () => {
  const fetchImpl = async (u) =>
    u === TOKEN_URL ? resposta({ access_token: 'T', expires_in: 3600 }) : resposta({ erro: 'x' }, 401);

  const r = await cliente(fetchImpl).consultarCnd('00000000000001');

  assert.equal(r.ok, false);
  assert.equal(r.codigo, 'NAO_AUTORIZADO');
  assert.equal(r.httpStatus, 502);
});

test('reutiliza o token entre consultas', async () => {
  let tokens = 0;
  const fetchImpl = async (u) => {
    if (u === TOKEN_URL) { tokens += 1; return resposta({ access_token: 'T', expires_in: 3600 }); }
    return resposta({ Status: 1, Certidao: certidao() });
  };

  const c = cliente(fetchImpl);
  await c.consultarCnd('00000000000001');
  await c.consultarCnd('00000000000002');

  assert.equal(tokens, 1);
});

test('rejeita CNPJ com tamanho inválido sem chamar a rede', async () => {
  let chamadas = 0;
  const fetchImpl = async () => { chamadas += 1; return resposta({}); };

  const r = await cliente(fetchImpl).consultarCnd('123');

  assert.equal(r.ok, false);
  assert.equal(r.codigo, 'CNPJ_INVALIDO');
  assert.equal(chamadas, 0);
});
