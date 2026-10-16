// SICC-CMC: Lógica de Frontend para Consulta e Gestão de Certidões
// Câmara Municipal de Curitiba - Diretoria de Contratações

(function () {
  "use strict";

  // Estado da Aplicação
  const state = {
    cnpjAtual: '',
    dadosCadastrais: null,
    sicaf: null,
    sancoesCgu: null,
    dossie: null,
    tstCaptchaToken: null,
    uploadCertTipo: null,
    selectedPdfBase64: null,
    selectedPdfNome: null
  };

  // Configuração padrão das 6 certidões essenciais
  const CERTIDOES_PADRAO = [
    {
      id: 'cnd_federal',
      nome: 'Certidão Conjunta Federal e Dívida Ativa da União',
      orgao: 'Receita Federal do Brasil (RFB) e PGFN',
      linkEmissao: 'https://servicos.receitafederal.gov.br/servico/certidoes',
      linkValidacao: 'https://servicos.receitafederal.gov.br/servico/certidoes',
      descricao: 'Abrange tributos federais, previdenciários e inscrição em dívida ativa da União.'
    },
    {
      id: 'cndt_trabalhista',
      nome: 'Certidão Negativa de Débitos Trabalhistas (CNDT)',
      orgao: 'Tribunal Superior do Trabalho (TST) / BNDT',
      linkEmissao: 'https://cndt-certidao.tst.jus.br/inicio.faces',
      linkValidacao: 'https://cndt-certidao.tst.jus.br/consultarCertidao',
      descricao: 'Comprova inexistência de débitos inadimplidos perante a Justiça do Trabalho.'
    },
    {
      id: 'crf_fgts',
      nome: 'Certificado de Regularidade do FGTS (CRF)',
      orgao: 'Caixa Econômica Federal',
      linkEmissao: 'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf',
      linkValidacao: 'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf',
      descricao: 'Atesta regularidade perante o Fundo de Garantia por Tempo de Serviço.'
    },
    {
      id: 'cnd_estadual_pr',
      nome: 'Certidão de Regularidade Fiscal Estadual',
      orgao: 'Secretaria da Fazenda do Paraná (SEFA/PR)',
      linkEmissao: 'http://www.cre.sefa.pr.gov.br/cext/certidao_emitir.jsp',
      linkValidacao: 'https://www.fazenda.pr.gov.br/Servicos/Certidoes',
      descricao: 'Tributos estaduais (ICMS, ITCMD, IPVA) e Dívida Ativa do Estado do Paraná.'
    },
    {
      id: 'cnd_municipal_curitiba',
      nome: 'Certidão Negativa de Débitos Municipais',
      orgao: 'Prefeitura Municipal de Curitiba (SMF / PMC)',
      linkEmissao: 'https://cnd-cidadao.curitiba.pr.gov.br/Certidao/SolicitarCnpj',
      linkValidacao: 'https://cnd-cidadao.curitiba.pr.gov.br/Certidao/SolicitarCnpj',
      descricao: 'ISS, IPTU, taxas municipais e Dívida Ativa do Município de Curitiba.'
    },
    {
      id: 'sancoes_tcu_cgu',
      nome: 'Certidão Correcional / Inidôneos (TCU e CGU)',
      orgao: 'Tribunal de Contas da União e Controladoria-Geral da União',
      linkEmissao: 'https://contasirregulares.tcu.gov.br/',
      linkValidacao: 'https://certidoes.cgu.gov.br/',
      descricao: 'Verificação de impedimentos, inidoneidade e contas julgadas irregulares.'
    }
  ];

  // Elementos do DOM
  const el = {
    formBusca: document.getElementById('form-busca-cnpj'),
    inputCnpj: document.getElementById('input-cnpj'),
    btnBuscar: document.getElementById('btn-buscar'),
    btnLimpar: document.getElementById('btn-limpar'),
    loadingSpinner: document.getElementById('loading-spinner'),
    alertContainer: document.getElementById('alert-container'),
    areaResultado: document.getElementById('area-resultado'),
    
    // Cadastrais
    infoRazaoSocial: document.getElementById('info-razao-social'),
    infoNomeFantasia: document.getElementById('info-nome-fantasia'),
    infoCnpj: document.getElementById('info-cnpj'),
    infoPorte: document.getElementById('info-porte'),
    infoCnae: document.getElementById('info-cnae'),
    infoMunicipio: document.getElementById('info-municipio'),
    badgeSituacaoRfb: document.getElementById('badge-situacao-rfb'),
    
    // SICAF e CGU
    badgeSicaf: document.getElementById('badge-sicaf'),
    sicafBody: document.getElementById('sicaf-body'),
    badgeSancoes: document.getElementById('badge-sancoes'),
    sancoesBody: document.getElementById('sancoes-body'),
    
    // Tabela e Contrato
    tbodyCertidoes: document.getElementById('tbody-certidoes'),
    contratoNumero: document.getElementById('contrato-numero'),
    contratoObjeto: document.getElementById('contrato-objeto'),
    contratoFiscal: document.getElementById('contrato-fiscal'),
    contratoVigencia: document.getElementById('contrato-vigencia'),
    btnSalvarDossie: document.getElementById('btn-salvar-dossie'),
    btnImprimir: document.getElementById('btn-imprimir'),
    
    // Modais
    modalTstEmitir: document.getElementById('modal-tst-emitir'),
    btnEmitirCndt: document.getElementById('btn-emitir-cndt'),
    tstCaptchaImg: document.getElementById('tst-captcha-img'),
    tstCaptchaInput: document.getElementById('tst-captcha-input'),
    btnRecarregarCaptcha: document.getElementById('btn-recarregar-captcha'),
    btnOuvirCaptcha: document.getElementById('btn-ouvir-captcha'),
    tstCaptchaAudio: document.getElementById('tst-captcha-audio'),
    btnConfirmarEmitirCndt: document.getElementById('btn-confirmar-emitir-cndt'),
    tstEmitirStatus: document.getElementById('tst-emitir-status'),
    
    modalTstValidar: document.getElementById('modal-tst-validar'),
    btnValidarCndt: document.getElementById('btn-validar-cndt'),
    tstValidarNum: document.getElementById('tst-validar-num'),
    tstValidarAno: document.getElementById('tst-validar-ano'),
    btnConfirmarValidarCndt: document.getElementById('btn-confirmar-validar-cndt'),
    tstValidarStatus: document.getElementById('tst-validar-status'),
    
    modalUploadPdf: document.getElementById('modal-upload-pdf'),
    modalUploadTitle: document.getElementById('modal-upload-title'),
    uploadCertTipo: document.getElementById('upload-cert-tipo'),
    dropArea: document.getElementById('drop-area'),
    fileInputPdf: document.getElementById('file-input-pdf'),
    uploadFileInfo: document.getElementById('upload-file-info'),
    btnConfirmarUpload: document.getElementById('btn-confirmar-upload'),
    
    modalConfig: document.getElementById('modal-config'),
    btnConfig: document.getElementById('btn-config'),
    configCguKey: document.getElementById('config-cgu-key'),
    btnSalvarConfig: document.getElementById('btn-salvar-config'),
    
    // Lista de Contratadas
    tbodyContratadasLista: document.getElementById('tbody-contratadas-lista'),
    filtroContratadas: document.getElementById('filtro-contratadas'),
    countContratadas: document.getElementById('count-contratadas'),
    tabBtnContratadas: document.getElementById('tab-btn-contratadas'),
    printDate: document.getElementById('print-date'),

    // Novo Layout: Barra de Sequência e Expansão
    btnIniciarSequencia: document.getElementById('btn-iniciar-sequencia'),
    btnExpandirTodas: document.getElementById('btn-expandir-todas'),
    stepperCertidoes: document.getElementById('stepper-certidoes'),
    stepTcu: document.getElementById('step-tcu'),
    stepFgts: document.getElementById('step-fgts'),
    stepSefa: document.getElementById('step-sefa'),
    stepCuritiba: document.getElementById('step-curitiba'),
    stepCndt: document.getElementById('step-cndt'),
    stepReceita: document.getElementById('step-receita')
  };

  // =================== UTILITÁRIOS ===================
  function mascaraCnpj(valor) {
    const limpo = String(valor || '').replace(/\D/g, '').slice(0, 14);
    if (limpo.length <= 2) return limpo;
    if (limpo.length <= 5) return `${limpo.slice(0, 2)}.${limpo.slice(2)}`;
    if (limpo.length <= 8) return `${limpo.slice(0, 2)}.${limpo.slice(2, 5)}.${limpo.slice(5)}`;
    if (limpo.length <= 12) return `${limpo.slice(0, 2)}.${limpo.slice(2, 5)}.${limpo.slice(5, 8)}/${limpo.slice(8)}`;
    return `${limpo.slice(0, 2)}.${limpo.slice(2, 5)}.${limpo.slice(5, 8)}/${limpo.slice(8, 12)}-${limpo.slice(12, 14)}`;
  }

  function limparCnpj(valor) {
    return String(valor || '').replace(/\D/g, '');
  }

  function formatarData(dataStr) {
    if (!dataStr) return '-';
    // Se vier YYYY-MM-DD
    const partes = dataStr.split('-');
    if (partes.length === 3) {
      return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    return dataStr;
  }

  function calcularDiasRestantes(dataValidadeStr) {
    if (!dataValidadeStr) return null;
    const partes = dataValidadeStr.split('-');
    if (partes.length !== 3) return null;
    
    const validade = new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]), 23, 59, 59);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const diffMs = validade.getTime() - hoje.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  function obterBadgeValidade(dias) {
    if (dias === null || isNaN(dias)) {
      return '<span class="badge badge-neutral">PENDENTE</span>';
    }
    if (dias < 0) {
      return `<span class="badge badge-danger">VENCIDA HÁ ${Math.abs(dias)} DIAS</span>`;
    }
    if (dias === 0) {
      return '<span class="badge badge-warn">VENCE HOJE</span>';
    }
    if (dias <= 30) {
      return `<span class="badge badge-warn">VENCE EM ${dias} DIAS</span>`;
    }
    return `<span class="badge badge-ok">VÁLIDA (${dias} DIAS)</span>`;
  }

  function obterBadgeSituacao(situacao) {
    const s = String(situacao || 'PENDENTE').toUpperCase();
    if (s === 'NEGATIVA' || s === 'REGULAR' || s === 'NADA CONSTA') {
      return `<span class="badge badge-ok">${s}</span>`;
    }
    if (s === 'CPEN' || s.includes('EFEITO DE NEGATIVA')) {
      return `<span class="badge badge-warn">CPEN</span>`;
    }
    if (s === 'POSITIVA' || s === 'IRREGULAR' || s.includes('DÉBITO') || s.includes('SANÇÃO') || s.includes('REGISTROS')) {
      return `<span class="badge badge-danger">${s}</span>`;
    }
    return `<span class="badge badge-neutral">PENDENTE</span>`;
  }

  function mostrarAlerta(tipo, mensagem) {
    el.alertContainer.innerHTML = `
      <div class="alert alert-${tipo}">
        <span>${mensagem}</span>
      </div>
    `;
    setTimeout(() => {
      // Deixar alerta visível ou esmaecer se desejar
    }, 5000);
  }

  function limparAlertas() {
    el.alertContainer.innerHTML = '';
  }

  function downloadBlob(blob, nomeArquivo) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function downloadBase64Pdf(base64Data, nomeArquivo) {
    try {
      if (!base64Data) return;
      const cleanBase64 = String(base64Data).replace(/^data:.*?;base64,/, '').replace(/\s+/g, '');
      const byteCharacters = atob(cleanBase64);
      const byteNumbers = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const blob = new Blob([byteNumbers], { type: 'application/pdf' });
      downloadBlob(blob, nomeArquivo);
    } catch (e) {
      console.warn('Erro ao processar download base64:', e);
    }
  }

  function dispararDownloadUrl(url, nomeArquivo) {
    if (!url) return;
    const downloadUrl = url.includes('?') ? `${url}&download=1` : `${url}?download=1`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = nomeArquivo || 'certidao.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  /**
   * Wrapper seguro para fetch que garante resposta JSON válida.
   * Evita o erro "JSON.parse: unexpected character at line 1 column 1"
   * quando o servidor retorna HTML (ex: página de erro 502/504).
   */
  async function fetchJson(url, opcoes) {
    let res;
    try {
      res = await fetch(url, opcoes);
    } catch (err) {
      throw new Error(`Erro de rede ao acessar ${url}: ${err.message}`);
    }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      let textoResposta = '';
      try { textoResposta = await res.text(); } catch (_) {}
      throw new Error(
        `Servidor retornou resposta inesperada (HTTP ${res.status}). ` +
        `Conteúdo: ${textoResposta.slice(0, 120).replace(/<[^>]+>/g, '').trim()}`
      );
    }
    let data;
    try {
      data = await res.json();
    } catch (err) {
      throw new Error(`Resposta inválida do servidor: ${err.message}`);
    }
    return { res, data };
  }

  // =================== GESTÃO DE ABAS ===================
  document.querySelectorAll('.nav-tab').forEach(tabBtn => {
    tabBtn.addEventListener('click', () => {
      const targetId = tabBtn.getAttribute('data-tab');
      document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      tabBtn.classList.add('active');
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.classList.add('active');

      if (targetId === 'tab-contratadas') {
        carregarListaContratadas();
      }
    });
  });

  // Fechar modais
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
      if (typeof resolveCndtSequencial === 'function') {
        resolveCndtSequencial(false);
        resolveCndtSequencial = null;
      }
    });
  });

  // =================== BUSCA DE CNPJ ===================
  el.inputCnpj.addEventListener('input', (e) => {
    e.target.value = mascaraCnpj(e.target.value);
  });

  document.querySelectorAll('.btn-sample').forEach(btn => {
    btn.addEventListener('click', () => {
      el.inputCnpj.value = btn.getAttribute('data-cnpj');
      realizarConsulta(btn.getAttribute('data-cnpj'));
    });
  });

  el.formBusca.addEventListener('submit', (e) => {
    e.preventDefault();
    realizarConsulta(el.inputCnpj.value);
  });

  el.btnLimpar.addEventListener('click', () => {
    el.inputCnpj.value = '';
    el.areaResultado.style.display = 'none';
    limparAlertas();
    state.cnpjAtual = '';
    state.dadosCadastrais = null;
    state.dossie = null;
  });

  async function realizarConsulta(cnpj) {
    const cleanCnpj = limparCnpj(cnpj);
    if (cleanCnpj.length !== 14) {
      mostrarAlerta('warning', 'Por favor, informe um CNPJ válido com 14 dígitos.');
      return;
    }

    limparAlertas();
    el.loadingSpinner.style.display = 'block';
    el.areaResultado.style.display = 'none';
    state.cnpjAtual = cleanCnpj;

    try {
      const { res, data } = await fetchJson(`/api/consulta/${cleanCnpj}`);

      if (!res.ok || !data.sucesso) {
        throw new Error(data.erro || 'Falha ao realizar a consulta');
      }

      state.dadosCadastrais = data.dadosCadastrais;
      state.sicaf = data.sicaf;
      state.sancoesCgu = data.sancoesCgu;
      state.dossie = data.dossieLocal || null;

      renderizarDadosCadastrais(data.dadosCadastrais, cleanCnpj);
      renderizarSicaf(data.sicaf);
      renderizarSancoes(data.sancoesCgu);
      renderizarCertidoes(data.dossieLocal);

      el.areaResultado.style.display = 'block';
      if (el.printDate) {
        el.printDate.textContent = new Date().toLocaleDateString('pt-BR', {
          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
      }
    } catch (err) {
      mostrarAlerta('danger', `Erro na consulta: ${err.message}`);
    } finally {
      el.loadingSpinner.style.display = 'none';
    }
  }

  // =================== RENDERIZAÇÃO ===================

  // 1. Dados Cadastrais
  function renderizarDadosCadastrais(dados, cnpj) {
    if (!dados || dados.erro) {
      el.infoRazaoSocial.textContent = 'Não localizada na BrasilAPI';
      el.infoNomeFantasia.textContent = '-';
      el.infoCnpj.textContent = mascaraCnpj(cnpj);
      el.infoPorte.textContent = '-';
      el.infoCnae.textContent = '-';
      el.infoMunicipio.textContent = '-';
      el.badgeSituacaoRfb.className = 'badge badge-neutral';
      el.badgeSituacaoRfb.textContent = 'NÃO CONSULTADO';
      return;
    }

    el.infoRazaoSocial.textContent = dados.razao_social || '-';
    el.infoNomeFantasia.textContent = dados.nome_fantasia || '(Não informado)';
    el.infoCnpj.textContent = mascaraCnpj(cnpj);
    el.infoPorte.textContent = `${dados.porte || 'Não especificado'} • ${dados.natureza_juridica || ''}`;
    el.infoCnae.textContent = `${dados.cnae_fiscal || ''} - ${dados.cnae_fiscal_descricao || '-'}`;
    el.infoMunicipio.textContent = `${dados.municipio || '-'} / ${dados.uf || '-'}`;

    const situacao = (dados.descricao_situacao_cadastral || 'DESCONHECIDA').toUpperCase();
    if (situacao === 'ATIVA') {
      el.badgeSituacaoRfb.className = 'badge badge-ok';
      el.badgeSituacaoRfb.textContent = 'SITUAÇÃO ATIVA (RFB)';
    } else {
      el.badgeSituacaoRfb.className = 'badge badge-danger';
      el.badgeSituacaoRfb.textContent = `SITUAÇÃO: ${situacao}`;
    }
  }

  // 2. Compras.gov.br / SICAF
  function renderizarSicaf(sicaf) {
    if (!sicaf || sicaf.erro) {
      el.badgeSicaf.className = 'badge badge-neutral';
      el.badgeSicaf.textContent = 'INDISPONÍVEL';
      el.sicafBody.innerHTML = `<p style="font-size: 0.85rem; color: var(--text-muted);">Não foi possível consultar os dados abertos do Compras.gov.br no momento.</p>`;
      return;
    }

    if (sicaf.encontrado && sicaf.cadastrado) {
      if (sicaf.habilitadoLicitar) {
        el.badgeSicaf.className = 'badge badge-ok';
        el.badgeSicaf.textContent = 'HABILITADO A LICITAR';
        el.sicafBody.innerHTML = `
          <div style="font-size: 0.88rem; color: var(--text-primary);">
            <p><strong>Cadastro Ativo no SICAF:</strong> Empresa regular perante os registros federais.</p>
            <p style="margin-top: 4px; font-size: 0.82rem; color: var(--status-ok);">
              ✓ <strong>Regularidade Nível III atestada:</strong> Certidões Federais, FGTS e CNDT conferidas pelo sistema do Compras.gov.br.
            </p>
          </div>
        `;
      } else {
        el.badgeSicaf.className = 'badge badge-danger';
        el.badgeSicaf.textContent = 'NÃO HABILITADO NO SICAF';
        el.sicafBody.innerHTML = `
          <div style="font-size: 0.88rem; color: var(--status-danger);">
            <p><strong>Consta pendência no SICAF:</strong> A empresa possui cadastro, mas constam impedimentos ou certidões federais/trabalhistas vencidas no sistema.</p>
          </div>
        `;
      }
    } else {
      el.badgeSicaf.className = 'badge badge-neutral';
      el.badgeSicaf.textContent = 'SEM CADASTRO NO SICAF';
      el.sicafBody.innerHTML = `
        <div style="font-size: 0.85rem; color: var(--text-muted);">
          <p>Fornecedor sem registro ativo no SICAF Federal. Verifique individualmente as certidões estaduais e municipais na tabela abaixo.</p>
        </div>
      `;
    }
  }

  // 3. CGU Sanções
  function renderizarSancoes(sancoes) {
    if (!sancoes) return;

    const temCeis = sancoes.ceis && sancoes.ceis.length > 0;
    const temCnep = sancoes.cnep && sancoes.cnep.length > 0;

    if (temCeis || temCnep) {
      el.badgeSancoes.className = 'badge badge-danger';
      el.badgeSancoes.textContent = 'CONSTA SANÇÃO IMPEDITIVA';
      
      let html = '<div style="color: var(--status-danger); font-size: 0.85rem;">';
      if (temCeis) {
        html += `<p><strong>⚠️ Registro no CEIS (Inidôneas e Suspensas):</strong></p><ul style="padding-left: 18px; margin-top: 4px;">`;
        sancoes.ceis.forEach(s => {
          html += `<li>Órgão: ${s.orgaoSancionador?.nome || '-'} | Motivo: ${s.tipoSancao?.descricaoPortal || '-'} | Término: ${formatarData(s.dataFimSancao) || 'Indeterminado'}</li>`;
        });
        html += `</ul>`;
      }
      if (temCnep) {
        html += `<p style="margin-top: 6px;"><strong>⚠️ Registro no CNEP (Lei Anticorrupção):</strong></p><ul style="padding-left: 18px; margin-top: 4px;">`;
        sancoes.cnep.forEach(s => {
          html += `<li>Órgão: ${s.orgaoSancionador?.nome || '-'} | Processo: ${s.numeroProcesso || '-'}</li>`;
        });
        html += `</ul>`;
      }
      html += '</div>';
      el.sancoesBody.innerHTML = html;
    } else {
      el.badgeSancoes.className = 'badge badge-ok';
      el.badgeSancoes.textContent = 'NENHUMA SANÇÃO';
      
      let html = `<p style="color: var(--status-ok); font-size: 0.88rem;">✓ Nenhum registro impeditivo ativo encontrado no CEIS e CNEP.</p>`;
      if (!sancoes.chaveConfigurada) {
        html += `
          <p style="margin-top: 6px; font-size: 0.78rem; color: var(--text-muted);">
            💡 <em>Dica:</em> Para habilitar a consulta automática em tempo real à base da CGU, 
            <a href="#" id="link-abrir-config-cgu" style="color: var(--cmc-blue-light); font-weight: 600;">cadastre gratuitamente sua chave de API</a>.
          </p>
        `;
      }
      el.sancoesBody.innerHTML = html;

      const linkConfig = document.getElementById('link-abrir-config-cgu');
      if (linkConfig) {
        linkConfig.addEventListener('click', (e) => {
          e.preventDefault();
          abrirModalConfig();
        });
      }
    }
  }

  // =================== 4. TABELA DE CERTIDÕES EXPANSÍVEIS ===================

  // Alternar abertura/fechamento da gaveta de detalhes da certidão
  function alternarGaveta(certId) {
    const row = document.getElementById(`row-${certId}`);
    const drawer = document.getElementById(`drawer-${certId}`);
    if (!row || !drawer) return;

    const isOpen = drawer.classList.contains('is-open');
    if (isOpen) {
      drawer.classList.remove('is-open');
      row.classList.remove('is-expanded');
    } else {
      drawer.classList.add('is-open');
      row.classList.add('is-expanded');
    }
  }

  // Atualização centralizada e reativa da interface de uma certidão (linha + gaveta)
  function atualizarInterfaceCertidao(certId, dados) {
    const row = document.getElementById(`row-${certId}`);
    const drawer = document.getElementById(`drawer-${certId}`);
    if (!row || !drawer) return;

    // Atualizar campos da gaveta se informados
    if (dados.situacao) {
      const sel = drawer.querySelector('.input-situacao');
      if (sel) sel.value = dados.situacao;
    }
    if (dados.numeroCertidao !== undefined) {
      const inp = drawer.querySelector('.input-numero');
      if (inp) inp.value = dados.numeroCertidao;
    }
    if (dados.codigoValidacao !== undefined) {
      const inp = drawer.querySelector('.input-codigo');
      if (inp) inp.value = dados.codigoValidacao;
    }
    if (dados.emissao !== undefined) {
      const inp = drawer.querySelector('.input-emissao');
      if (inp) inp.value = dados.emissao;
    }
    if (dados.validade !== undefined) {
      const inp = drawer.querySelector('.input-validade');
      if (inp) inp.value = dados.validade;
    }

    // Atualizar badges da linha principal
    const situacaoAtual = drawer.querySelector('.input-situacao')?.value || dados.situacao || 'PENDENTE';
    const badgeSitEl = document.getElementById(`main-badge-situacao-${certId}`);
    if (badgeSitEl) {
      badgeSitEl.innerHTML = obterBadgeSituacao(situacaoAtual);
    }

    const validadeAtual = drawer.querySelector('.input-validade')?.value || dados.validade || '';
    const diasRestantes = calcularDiasRestantes(validadeAtual);
    const wrapValidade = row.querySelector(`.validade-badge-wrap[data-cert="${certId}"]`);
    if (wrapValidade) {
      wrapValidade.innerHTML = obterBadgeValidade(diasRestantes);
    }
    const dateSub = document.getElementById(`main-validade-data-${certId}`);
    if (dateSub) {
      dateSub.textContent = validadeAtual ? `Venc.: ${formatarData(validadeAtual)}` : '';
    }

    // Atualizar containers de download do PDF
    if (dados.downloadUrl) {
      const quickPdf = row.querySelector(`.quick-pdf-link[data-cert="${certId}"]`);
      if (quickPdf) {
        quickPdf.innerHTML = `
          <a href="${dados.downloadUrl}" target="_blank" download class="btn btn-sm btn-primary" style="padding: 4px 8px; font-size: 0.75rem; text-decoration: none;">
            📄 Baixar PDF
          </a>
        `;
      }

      const pdfContainer = drawer.querySelector('.pdf-container');
      if (pdfContainer) {
        pdfContainer.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: space-between; background: var(--status-ok-bg); padding: 5px 10px; border-radius: 4px; border: 1px solid var(--status-ok-border); font-size: 0.78rem;">
            <span title="${dados.nomeArquivo || 'certidao.pdf'}" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 150px; font-weight: 600; color: var(--status-ok);">
              📄 ${dados.nomeArquivo || 'certidao.pdf'}
            </span>
            <a href="${dados.downloadUrl}" target="_blank" download class="btn btn-sm btn-primary" style="padding: 2px 6px; font-size: 0.72rem;">Baixar</a>
          </div>
        `;
        pdfContainer.setAttribute('data-download-url', dados.downloadUrl);
        pdfContainer.setAttribute('data-file-name', dados.nomeArquivo || 'certidao.pdf');
      }
    }
  }

  // Renderizar Linhas Expansíveis das Certidões
  function renderizarCertidoes(dossieSalvo) {
    el.tbodyCertidoes.innerHTML = '';
    const certsSalvas = dossieSalvo?.certidoes || {};

    // Preencher dados do contrato se existirem
    el.contratoNumero.value = dossieSalvo?.contratoNumero || '';
    el.contratoObjeto.value = dossieSalvo?.contratoObjeto || '';
    el.contratoFiscal.value = dossieSalvo?.contratoFiscal || '';
    el.contratoVigencia.value = dossieSalvo?.contratoVigencia || '';

    CERTIDOES_PADRAO.forEach(item => {
      const dadosCert = certsSalvas[item.id] || {};
      const diasRestantes = calcularDiasRestantes(dadosCert.validade);

      // 1. Linha Principal (Resumo + Ações Rápidas)
      const trMain = document.createElement('tr');
      trMain.className = 'cert-row-main';
      trMain.id = `row-${item.id}`;
      trMain.setAttribute('data-cert', item.id);
      trMain.title = 'Clique para expandir ou recolher detalhes';

      trMain.innerHTML = `
        <td class="cert-title-cell" style="vertical-align: middle;">
          <div style="display: flex; align-items: center;">
            <span class="cert-chevron" data-cert="${item.id}">▶</span>
            <div>
              <strong style="font-size: 0.92rem; color: #0f2b48;">${item.nome}</strong>
              <div style="font-size: 0.78rem; color: #64748b; margin-top: 2px;">${item.orgao}</div>
            </div>
          </div>
        </td>
        <td style="vertical-align: middle;">
          <div id="main-badge-situacao-${item.id}">
            ${obterBadgeSituacao(dadosCert.situacao)}
          </div>
        </td>
        <td style="vertical-align: middle;">
          <div class="validade-badge-wrap" data-cert="${item.id}">
            ${obterBadgeValidade(diasRestantes)}
          </div>
          <div id="main-validade-data-${item.id}" style="font-size: 0.72rem; color: #64748b; margin-top: 3px;">
            ${dadosCert.validade ? 'Venc.: ' + formatarData(dadosCert.validade) : ''}
          </div>
        </td>
        <td class="cert-actions-cell no-print" style="vertical-align: middle; text-align: right;">
          <div style="display: flex; gap: 6px; justify-content: flex-end; align-items: center; flex-wrap: wrap;">
            <div class="quick-pdf-link" data-cert="${item.id}">
              ${dadosCert.downloadUrl ? `
                <a href="${dadosCert.downloadUrl}" target="_blank" download class="btn btn-sm btn-primary" style="padding: 4px 8px; font-size: 0.75rem; text-decoration: none;">
                  📄 Baixar PDF
                </a>
              ` : ''}
            </div>

            ${item.id === 'sancoes_tcu_cgu' ? `
              <button type="button" class="btn btn-outline btn-sm btn-emitir-tcu" data-cert="${item.id}" title="Emitir Certidão Consolidada da APF (TCU, CNJ, CEIS e CNEP)">
                🤖 TCU
              </button>
            ` : ''}

            ${item.id === 'crf_fgts' ? `
              <button type="button" class="btn btn-outline btn-sm btn-emitir-fgts" data-cert="${item.id}" title="Emitir Certificado CRF FGTS via robô 100% automático">
                🤖 FGTS
              </button>
            ` : ''}

            ${item.id === 'cnd_estadual_pr' ? `
              <button type="button" class="btn btn-outline btn-sm btn-emitir-sefa" data-cert="${item.id}" title="Emitir CND Estadual via robô SEFA-PR">
                🤖 SEFA-PR
              </button>
            ` : ''}

            ${item.id === 'cnd_municipal_curitiba' ? `
              <button type="button" class="btn btn-outline btn-sm btn-emitir-curitiba" data-cert="${item.id}" title="Emitir CND Municipal de Curitiba via robô PMC">
                🤖 Curitiba
              </button>
            ` : ''}

            ${item.id === 'cndt_trabalhista' ? `
              <button type="button" class="btn btn-outline btn-sm btn-emitir-cndt-row" data-cert="${item.id}" title="Emitir CNDT via API do TST">
                ⚡ CNDT
              </button>
            ` : ''}

            ${item.id === 'cnd_federal' ? `
              <button type="button" class="btn btn-outline btn-sm btn-emitir-receita" data-cert="${item.id}" title="Emitir Certidão Conjunta Federal RFB/PGFN">
                🤖 Receita
              </button>
            ` : ''}

            <button type="button" class="btn btn-outline btn-sm btn-toggle-drawer" data-cert="${item.id}" style="padding: 4px 8px; font-size: 0.75rem;" title="Expandir ou recolher campos">
              Detalhes ▾
            </button>
          </div>
        </td>
      `;

      // 2. Linha Gaveta Expansível (Campos Detalhados)
      const trDrawer = document.createElement('tr');
      trDrawer.className = 'cert-row-drawer';
      trDrawer.id = `drawer-${item.id}`;
      trDrawer.setAttribute('data-cert', item.id);

      trDrawer.innerHTML = `
        <td colspan="4" style="padding: 0;">
          <div class="drawer-inner">
            <div class="drawer-grid">
              <div class="drawer-field">
                <label>Situação Cadastral</label>
                <select class="cert-input-control input-situacao" data-cert="${item.id}" style="width: 100%;">
                  <option value="NEGATIVA" ${dadosCert.situacao === 'NEGATIVA' ? 'selected' : ''}>Negativa (Regular)</option>
                  <option value="CPEN" ${dadosCert.situacao === 'CPEN' ? 'selected' : ''}>Positiva c/ Efeito de Negativa</option>
                  <option value="POSITIVA" ${dadosCert.situacao === 'POSITIVA' ? 'selected' : ''}>Positiva (Irregular / Débito)</option>
                  <option value="NADA CONSTA" ${dadosCert.situacao === 'NADA CONSTA' ? 'selected' : ''}>Nada Consta (Regular)</option>
                  <option value="PENDENTE" ${(!dadosCert.situacao || dadosCert.situacao === 'PENDENTE') ? 'selected' : ''}>Pendente / Em Consulta</option>
                </select>
              </div>
              <div class="drawer-field">
                <label>Número da Certidão</label>
                <input type="text" class="cert-input-control input-numero" data-cert="${item.id}" 
                  placeholder="Ex: 12345/2026" value="${dadosCert.numero || ''}" style="width: 100%;">
              </div>
              <div class="drawer-field">
                <label>Código de Autenticação / Controle</label>
                <input type="text" class="cert-input-control input-codigo" data-cert="${item.id}" 
                  placeholder="Cód. Autenticação" value="${dadosCert.codigoValidacao || ''}" style="width: 100%; font-family: monospace; font-size: 0.78rem;">
              </div>
              <div class="drawer-field">
                <label>Data de Emissão</label>
                <input type="date" class="cert-input-control input-emissao" data-cert="${item.id}" 
                  value="${dadosCert.emissao || ''}" style="width: 100%;">
              </div>
              <div class="drawer-field">
                <label>Data de Validade</label>
                <input type="date" class="cert-input-control input-validade" data-cert="${item.id}" 
                  value="${dadosCert.validade || ''}" style="width: 100%;">
              </div>
            </div>
            <div class="drawer-footer-actions">
              <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                <a href="${item.linkEmissao}" target="_blank" rel="noopener" class="btn btn-outline btn-sm" title="Acessar portal emissor oficial">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  Portal Oficial do Órgão
                </a>
                <button type="button" class="btn btn-outline btn-sm btn-anexar-pdf" data-cert="${item.id}" title="Anexar arquivo PDF manualmente">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                  Anexar PDF Manual
                </button>
                <small style="color: #64748b;">${item.descricao}</small>
              </div>
              <div class="pdf-container" data-cert="${item.id}" style="min-width: 220px;">
                ${dadosCert.downloadUrl ? `
                  <div style="display: flex; align-items: center; justify-content: space-between; background: var(--status-ok-bg); padding: 5px 10px; border-radius: 4px; border: 1px solid var(--status-ok-border); font-size: 0.78rem;">
                    <span title="${dadosCert.pdfNome || 'Arquivo PDF'}" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px; font-weight: 600; color: var(--status-ok);">
                      📄 ${dadosCert.pdfNome || 'certidao.pdf'}
                    </span>
                    <a href="${dadosCert.downloadUrl}" target="_blank" download class="btn btn-sm btn-primary" style="padding: 2px 6px; font-size: 0.72rem;">Baixar</a>
                  </div>
                ` : '<small style="color: var(--text-light); font-size: 0.75rem;">Nenhum PDF anexado</small>'}
              </div>
            </div>
          </div>
        </td>
      `;

      el.tbodyCertidoes.appendChild(trMain);
      el.tbodyCertidoes.appendChild(trDrawer);
    });

    // Event listener: clique na linha principal para expandir/recolher
    document.querySelectorAll('.cert-row-main').forEach(row => {
      row.addEventListener('click', (e) => {
        // Ignorar cliques se foram disparados em botões ou links
        if (e.target.closest('button') || e.target.closest('a') || e.target.closest('input') || e.target.closest('select')) {
          return;
        }
        const certId = row.getAttribute('data-cert');
        alternarGaveta(certId);
      });
    });

    // Botões "Detalhes ▾"
    document.querySelectorAll('.btn-toggle-drawer').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const certId = btn.getAttribute('data-cert');
        alternarGaveta(certId);
      });
    });

    // Sincronização reativa de Situação e Validade na gaveta
    document.querySelectorAll('.input-situacao').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const certId = e.target.getAttribute('data-cert');
        const badgeSitEl = document.getElementById(`main-badge-situacao-${certId}`);
        if (badgeSitEl) badgeSitEl.innerHTML = obterBadgeSituacao(e.target.value);
      });
    });

    document.querySelectorAll('.input-validade').forEach(inp => {
      inp.addEventListener('change', (e) => {
        const certId = e.target.getAttribute('data-cert');
        const dias = calcularDiasRestantes(e.target.value);
        const wrap = document.querySelector(`.validade-badge-wrap[data-cert="${certId}"]`);
        if (wrap) wrap.innerHTML = obterBadgeValidade(dias);
        const dateSub = document.getElementById(`main-validade-data-${certId}`);
        if (dateSub) {
          dateSub.textContent = e.target.value ? `Venc.: ${formatarData(e.target.value)}` : '';
        }
      });
    });

    // Anexar PDF manual
    document.querySelectorAll('.btn-anexar-pdf').forEach(btn => {
      btn.addEventListener('click', () => {
        const certId = btn.getAttribute('data-cert');
        const certConfig = CERTIDOES_PADRAO.find(c => c.id === certId);
        abrirModalUpload(certId, certConfig?.nome || 'Certidão');
      });
    });

    // Conectar botões individuais aos emissores modulares
    document.querySelectorAll('.btn-emitir-tcu').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); emitirTcu(false, btn); });
    });
    document.querySelectorAll('.btn-emitir-fgts').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); emitirFgts(false, btn); });
    });
    document.querySelectorAll('.btn-emitir-sefa').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); emitirSefa(false, btn); });
    });
    document.querySelectorAll('.btn-emitir-curitiba').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); emitirCuritiba(false, btn); });
    });
    document.querySelectorAll('.btn-emitir-cndt-row').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!state.cnpjAtual) {
          mostrarAlerta('warning', 'Consulte um CNPJ primeiro.');
          return;
        }
        abrirModalTstEmitir();
      });
    });
    document.querySelectorAll('.btn-emitir-receita').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); emitirReceita(false, btn); });
    });
  }

  // Alternar expansão de todas as certidões simultaneamente
  if (el.btnExpandirTodas) {
    el.btnExpandirTodas.addEventListener('click', () => {
      const drawers = document.querySelectorAll('.cert-row-drawer');
      const algumFechado = Array.from(drawers).some(d => !d.classList.contains('is-open'));

      drawers.forEach(drawer => {
        const certId = drawer.getAttribute('data-cert');
        const row = document.getElementById(`row-${certId}`);
        if (algumFechado) {
          drawer.classList.add('is-open');
          if (row) row.classList.add('is-expanded');
        } else {
          drawer.classList.remove('is-open');
          if (row) row.classList.remove('is-expanded');
        }
      });
    });
  }

  // =================== EMISSORES MODULARES ===================

  // 1. TCU / APF (Correcional e Sanções)
  async function emitirTcu(silencioso = false, btnDisparador = null) {
    if (!state.cnpjAtual) {
      mostrarAlerta('warning', 'Consulte um CNPJ primeiro.');
      return;
    }

    const btn = btnDisparador || document.querySelector('.btn-emitir-tcu');
    let originalText = '';
    if (btn) {
      originalText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '⏳ TCU...';
    }

    if (!silencioso) {
      mostrarAlerta('info', '🤖 O robô está consultando a base consolidada do TCU, CNJ e CGU e gerando a Certidão da APF oficial em PDF...');
    }

    try {
      const { res, data } = await fetchJson('/api/tcu/emitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnpj: state.cnpjAtual })
      });

      if (!res.ok || !data.sucesso) {
        throw new Error(data.erro || 'Erro na consulta do TCU');
      }

      if (data.downloadUrl) {
        dispararDownloadUrl(data.downloadUrl, data.nomeArquivo || `CERTIDAO_TCU_${state.cnpjAtual}.pdf`);
      }

      atualizarInterfaceCertidao('sancoes_tcu_cgu', {
        situacao: data.situacao || 'NADA CONSTA',
        numeroCertidao: data.numeroCertidao || 'Consolidada APF',
        emissao: data.emissao || new Date().toISOString().split('T')[0],
        validade: data.validade || '',
        downloadUrl: data.downloadUrl,
        nomeArquivo: data.nomeArquivo
      });

      if (!silencioso) {
        mostrarAlerta('success', `✅ Certidão Consolidada da APF (TCU, CNJ, CEIS e CNEP) emitida com sucesso! Situação: <strong>${data.situacao || 'NADA CONSTA'}</strong>. PDF baixado.`);
      }
      return data;
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    }
  }

  // 2. FGTS / CRF (Caixa)
  async function emitirFgts(silencioso = false, btnDisparador = null) {
    if (!state.cnpjAtual) {
      mostrarAlerta('warning', 'Consulte um CNPJ primeiro.');
      return;
    }

    const btn = btnDisparador || document.querySelector('.btn-emitir-fgts');
    let originalText = '';
    if (btn) {
      originalText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '⏳ FGTS...';
    }

    if (!silencioso) {
      mostrarAlerta('info', '🤖 O robô está consultando a Caixa Econômica Federal e emitindo o Certificado CRF do FGTS...');
    }

    try {
      const { res, data } = await fetchJson('/api/fgts/emitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnpj: state.cnpjAtual })
      });

      if (!res.ok || !data.sucesso) {
        throw new Error(data.erro || 'Erro na emissão do FGTS');
      }

      if (data.downloadUrl) {
        dispararDownloadUrl(data.downloadUrl, data.nomeArquivo || `CRF_FGTS_${state.cnpjAtual}.pdf`);
      }

      atualizarInterfaceCertidao('crf_fgts', {
        situacao: data.situacao || 'REGULAR',
        numeroCertidao: data.numeroCertidao || '',
        emissao: data.emissao || '',
        validade: data.validade || '',
        downloadUrl: data.downloadUrl,
        nomeArquivo: data.nomeArquivo
      });

      if (!silencioso) {
        mostrarAlerta('success', `✅ Certificado CRF do FGTS nº <strong>${data.numeroCertidao}</strong> emitido com sucesso e baixado em PDF!`);
      }
      return data;
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    }
  }

  // 3. SEFA-PR (Estadual)
  async function emitirSefa(silencioso = false, btnDisparador = null) {
    if (!state.cnpjAtual) {
      mostrarAlerta('warning', 'Consulte um CNPJ primeiro.');
      return;
    }

    const uf = (state.dadosCadastrais?.uf || '').toUpperCase();
    if (uf && uf !== 'PR') {
      mostrarAlerta('warning', `⚠️ Esta empresa está sediada no estado <strong>${uf}</strong>. A automação SEFA-PR aplica-se exclusivamente a empresas do Paraná.`);
      return;
    }

    const btn = btnDisparador || document.querySelector('.btn-emitir-sefa');
    let originalText = '';
    if (btn) {
      originalText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '⏳ SEFA...';
    }

    if (!silencioso) {
      mostrarAlerta('info', '🤖 O robô está consultando a SEFA-PR com evasão de detecção. Aguarde cerca de 10 a 15 segundos...');
    }

    try {
      const { res, data } = await fetchJson('/api/sefa/emitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnpj: state.cnpjAtual })
      });

      if (!res.ok || !data.sucesso) {
        throw new Error(data.erro || 'Falha na emissão pela SEFA-PR');
      }

      if (data.downloadUrl) {
        dispararDownloadUrl(data.downloadUrl, data.nomeArquivo || `CND_ESTADUAL_${state.cnpjAtual}.pdf`);
      }

      atualizarInterfaceCertidao('cnd_estadual_pr', {
        situacao: data.situacao || 'NEGATIVA',
        numeroCertidao: data.numeroCertidao || '',
        emissao: data.emissao || '',
        validade: data.validade || '',
        downloadUrl: data.downloadUrl,
        nomeArquivo: data.nomeArquivo
      });

      if (!silencioso) {
        mostrarAlerta('success', `✅ Certidão Estadual (SEFA-PR) nº <strong>${data.numeroCertidao}</strong> emitida com sucesso e baixada em PDF!`);
      }
      return data;
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    }
  }

  // 4. Curitiba / PMC (Municipal)
  async function emitirCuritiba(silencioso = false, btnDisparador = null) {
    if (!state.cnpjAtual) {
      mostrarAlerta('warning', 'Consulte um CNPJ primeiro.');
      return;
    }

    const mun = (state.dadosCadastrais?.municipio || '').toUpperCase();
    if (mun && !mun.includes('CURITIBA')) {
      mostrarAlerta('warning', `⚠️ Esta empresa está sediada em <strong>${state.dadosCadastrais?.municipio}</strong>. A CND da PMC aplica-se a contribuintes de Curitiba.`);
      return;
    }

    const btn = btnDisparador || document.querySelector('.btn-emitir-curitiba');
    let originalText = '';
    if (btn) {
      originalText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '⏳ Curitiba...';
    }

    if (!silencioso) {
      mostrarAlerta('info', '🤖 O robô está consultando a Prefeitura de Curitiba e gerando a CND Municipal oficial em PDF...');
    }

    try {
      const { res, data } = await fetchJson('/api/curitiba/emitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnpj: state.cnpjAtual })
      });

      if (!res.ok || !data.sucesso) {
        throw new Error(data.erro || 'Falha na emissão pela Prefeitura de Curitiba');
      }

      if (data.downloadUrl) {
        dispararDownloadUrl(data.downloadUrl, data.nomeArquivo || `CND_MUNICIPAL_CURITIBA_${state.cnpjAtual}.pdf`);
      }

      atualizarInterfaceCertidao('cnd_municipal_curitiba', {
        situacao: data.situacao || 'NEGATIVA',
        numeroCertidao: data.numeroCertidao || '',
        emissao: data.emissao || '',
        validade: data.validade || '',
        downloadUrl: data.downloadUrl,
        nomeArquivo: data.nomeArquivo
      });

      if (!silencioso) {
        mostrarAlerta('success', `✅ CND Municipal de Curitiba nº <strong>${data.numeroCertidao}</strong> emitida com sucesso e baixada em PDF!`);
      }
      return data;
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    }
  }

  // 5. Receita Federal (RFB/PGFN)
  async function emitirReceita(silencioso = false, btnDisparador = null) {
    if (!state.cnpjAtual) {
      mostrarAlerta('warning', 'Consulte um CNPJ primeiro.');
      return;
    }

    const btn = btnDisparador || document.querySelector('.btn-emitir-receita');
    let originalText = '';
    if (btn) {
      originalText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '⏳ Receita...';
    }

    mostrarAlerta('info',
      '🌐 Uma janela do Chrome foi aberta no portal da Receita Federal com o CNPJ preenchido. ' +
      'Resolva o hCaptcha na janela aberta e clique em <strong>Emitir Certidão</strong>. ' +
      'O robô capturará o PDF automaticamente.'
    );

    try {
      const { res, data } = await fetchJson('/api/receita/emitir-assistido', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnpj: state.cnpjAtual }),
        signal: AbortSignal.timeout(140000)
      });

      if (!res.ok || !data.sucesso) {
        throw new Error(data.erro || 'Falha na emissão pela Receita Federal');
      }

      if (data.downloadUrl) {
        dispararDownloadUrl(data.downloadUrl, data.nomeArquivo || `CND_FEDERAL_${state.cnpjAtual}.pdf`);
      }

      atualizarInterfaceCertidao('cnd_federal', {
        situacao: data.situacao || 'NEGATIVA',
        numeroCertidao: data.numeroCertidao || '',
        emissao: data.emissao || '',
        validade: data.validade || '',
        downloadUrl: data.downloadUrl,
        nomeArquivo: data.nomeArquivo
      });

      mostrarAlerta('success', `✅ Certidão Conjunta Federal (RFB/PGFN) capturada com sucesso! PDF baixado automaticamente.`);
      return data;
    } catch (err) {
      if (err.name === 'TimeoutError') {
        throw new Error('Tempo esgotado (2 minutos) aguardando resolução do captcha da Receita Federal.');
      }
      throw err;
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    }
  }

  // =================== ESTEIRA DE VERIFICAÇÃO EM SEQUÊNCIA ===================

  let resolveCndtSequencial = null;

  async function abrirModalTstEmitirSequencial() {
    return new Promise((resolve) => {
      resolveCndtSequencial = resolve;
      abrirModalTstEmitir();
    });
  }

  async function executarFilaSequencial() {
    if (!state.cnpjAtual) {
      mostrarAlerta('warning', 'Consulte um CNPJ primeiro antes de iniciar a verificação em sequência.');
      return;
    }
    if (state.emExecucaoSequencial) return;
    state.emExecucaoSequencial = true;

    el.btnIniciarSequencia.disabled = true;
    const textoOriginal = el.btnIniciarSequencia.innerHTML;
    el.btnIniciarSequencia.innerHTML = '⏳ Verificando em Sequência...';

    const setPillActive = (id, label) => {
      const p = document.getElementById(id);
      if (p) {
        p.className = 'stepper-pill active';
        p.innerHTML = `<span>⏳ ${label}</span>`;
      }
    };
    const setPillDone = (id, label) => {
      const p = document.getElementById(id);
      if (p) {
        p.className = 'stepper-pill done';
        p.innerHTML = `<span>✓ ${label}</span>`;
      }
    };
    const setPillSkipped = (id, label) => {
      const p = document.getElementById(id);
      if (p) {
        p.className = 'stepper-pill skipped';
        p.innerHTML = `<span>⏭️ ${label}</span>`;
      }
    };
    const setPillError = (id, label) => {
      const p = document.getElementById(id);
      if (p) {
        p.className = 'stepper-pill';
        p.style.borderColor = '#fca5a5';
        p.style.background = '#fef2f2';
        p.style.color = '#991b1b';
        p.innerHTML = `<span>⚠️ ${label}</span>`;
      }
    };

    try {
      // 1. TCU / APF
      setPillActive('step-tcu', '1. TCU / APF');
      mostrarAlerta('info', '<strong>[1/6] TCU / APF:</strong> Consultando base de inidôneos, sanções (CEIS/CNEP/CNJ) e contas irregulares do TCU...');
      try {
        await emitirTcu(true);
        setPillDone('step-tcu', '1. TCU / APF');
      } catch (e) {
        console.warn('Erro TCU:', e);
        setPillError('step-tcu', '1. TCU (Falha)');
      }

      // 2. FGTS / Caixa
      setPillActive('step-fgts', '2. FGTS / Caixa');
      mostrarAlerta('info', '<strong>[2/6] FGTS:</strong> Consultando a Caixa Econômica Federal e emitindo o Certificado CRF...');
      try {
        await emitirFgts(true);
        setPillDone('step-fgts', '2. FGTS / Caixa');
      } catch (e) {
        console.warn('Erro FGTS:', e);
        setPillError('step-fgts', '2. FGTS (Falha)');
      }

      // 3. SEFA-PR
      const uf = (state.dadosCadastrais?.uf || '').toUpperCase();
      if (uf && uf !== 'PR') {
        setPillSkipped('step-sefa', `3. SEFA (${uf} - Fora PR)`);
        mostrarAlerta('warning', `<strong>[3/6] SEFA-PR Ignorada:</strong> A empresa é sediada no estado <strong>${uf}</strong>. A emissão de certidão estadual automática aplica-se apenas a empresas do Paraná (SEFA-PR).`);
      } else {
        setPillActive('step-sefa', '3. SEFA-PR');
        mostrarAlerta('info', '<strong>[3/6] SEFA-PR:</strong> Consultando a Secretaria da Fazenda do Paraná com robô anti-bloqueio...');
        try {
          await emitirSefa(true);
          setPillDone('step-sefa', '3. SEFA-PR');
        } catch (e) {
          console.warn('Erro SEFA:', e);
          setPillError('step-sefa', '3. SEFA (Falha)');
        }
      }

      // 4. Curitiba / PMC
      const mun = (state.dadosCadastrais?.municipio || '').toUpperCase();
      if (mun && !mun.includes('CURITIBA')) {
        setPillSkipped('step-curitiba', '4. PMC (Fora de Curitiba)');
        mostrarAlerta('warning', `<strong>[4/6] Curitiba Ignorada:</strong> A empresa é sediada no município de <strong>${state.dadosCadastrais?.municipio}</strong>. A CND da Prefeitura de Curitiba aplica-se a contribuintes de Curitiba.`);
      } else {
        setPillActive('step-curitiba', '4. Curitiba / PMC');
        mostrarAlerta('info', '<strong>[4/6] Curitiba:</strong> Consultando a Prefeitura Municipal de Curitiba e gerando CND...');
        try {
          await emitirCuritiba(true);
          setPillDone('step-curitiba', '4. Curitiba / PMC');
        } catch (e) {
          console.warn('Erro Curitiba:', e);
          setPillError('step-curitiba', '4. Curitiba (Falha)');
        }
      }

      // 5. CNDT (TST) - Requer captcha interativo
      setPillActive('step-cndt', '5. CNDT (TST)');
      mostrarAlerta('info', '<strong>[5/6] CNDT (TST):</strong> O portal do Tribunal Superior do Trabalho exige a digitação dos caracteres. Digite o código na janela que se abriu e pressione Confirmar.');
      const cndtSucesso = await abrirModalTstEmitirSequencial();
      if (cndtSucesso) {
        setPillDone('step-cndt', '5. CNDT (TST)');
      } else {
        setPillSkipped('step-cndt', '5. CNDT (Pular)');
      }

      // 6. Receita Federal (RFB/PGFN)
      setPillActive('step-receita', '6. Receita Federal');
      const querReceita = confirm(
        'Etapa [6/6]: Deseja iniciar a emissão assistida da Certidão Conjunta da Receita Federal / PGFN agora?\n\n' +
        '(Uma janela do navegador será aberta com o CNPJ preenchido para validação do hCaptcha).'
      );
      if (querReceita) {
        try {
          await emitirReceita(false);
          setPillDone('step-receita', '6. Receita Federal');
        } catch (e) {
          console.warn('Erro Receita:', e);
          setPillError('step-receita', '6. Receita (Falha)');
        }
      } else {
        setPillSkipped('step-receita', '6. Receita (Pulada)');
      }

      mostrarAlerta('success', '🎉 <strong>Verificação contínua concluída!</strong> As certidões foram consultadas e os PDFs oficiais baixados automaticamente. Clique nas linhas para inspecionar os detalhes.');
    } finally {
      state.emExecucaoSequencial = false;
      el.btnIniciarSequencia.disabled = false;
      el.btnIniciarSequencia.innerHTML = textoOriginal;
    }
  }

  if (el.btnIniciarSequencia) {
    el.btnIniciarSequencia.addEventListener('click', executarFilaSequencial);
  }

  // =================== CNDT TST: EMISSÃO VIA API ===================
  if (el.btnEmitirCndt) {
    el.btnEmitirCndt.addEventListener('click', () => {
      abrirModalTstEmitir();
    });
  }

  async function abrirModalTstEmitir() {
    el.tstEmitirStatus.innerHTML = '';
    el.tstCaptchaInput.value = '';
    el.modalTstEmitir.classList.add('active');
    await carregarCaptchaTst();
  }

  async function carregarCaptchaTst() {
    el.tstEmitirStatus.innerHTML = '<span style="color: var(--text-muted);">Obtendo imagem do desafio do TST...</span>';
    el.tstCaptchaImg.src = '';

    try {
      const { res, data } = await fetchJson('/api/tst/captcha');
      if (!res.ok || !data.sucesso) {
        throw new Error(data.erro || 'Falha ao obter captcha do TST');
      }

      state.tstCaptchaToken = data.token;
      el.tstCaptchaImg.src = `data:image/jpeg;base64,${data.imagemBase64}`;
      if (data.audioBase64) {
        el.tstCaptchaAudio.src = `data:audio/wav;base64,${data.audioBase64}`;
      }
      el.tstEmitirStatus.innerHTML = '';
      el.tstCaptchaInput.focus();
    } catch (err) {
      el.tstEmitirStatus.innerHTML = `<span style="color: var(--status-danger);">Erro ao carregar desafio: ${err.message}</span>`;
    }
  }

  el.btnRecarregarCaptcha.addEventListener('click', carregarCaptchaTst);

  el.btnOuvirCaptcha.addEventListener('click', () => {
    if (el.tstCaptchaAudio.src) {
      el.tstCaptchaAudio.play();
      el.tstCaptchaInput.focus();
    }
  });

  // Permitir submissão rápida com a tecla Enter no input do Captcha
  el.tstCaptchaInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      el.btnConfirmarEmitirCndt.click();
    }
  });

  el.btnConfirmarEmitirCndt.addEventListener('click', async () => {
    const resposta = el.tstCaptchaInput.value.trim();
    if (!resposta) {
      el.tstEmitirStatus.innerHTML = '<span style="color: var(--status-danger);">Por favor, digite os caracteres da imagem.</span>';
      el.tstCaptchaInput.focus();
      return;
    }

    el.tstEmitirStatus.innerHTML = '<span style="color: var(--cmc-blue-primary); font-weight: 600;">Emitindo certidão no TST e processando PDF...</span>';
    el.btnConfirmarEmitirCndt.disabled = true;

    try {
      const { res, data } = await fetchJson('/api/tst/emitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cnpj: state.cnpjAtual,
          tokenDesafio: state.tstCaptchaToken,
          resposta: resposta
        })
      });

      if (!res.ok || !data.sucesso) {
        throw new Error(data.erro || 'Falha ao emitir certidão no TST');
      }

      // Baixar PDF no navegador
      if (data.downloadUrl) {
        dispararDownloadUrl(data.downloadUrl, data.nomeArquivo || `CNDT_${state.cnpjAtual}.pdf`);
      } else if (data.pdfBase64) {
        downloadBase64Pdf(data.pdfBase64, data.nomeArquivo || `CNDT_${state.cnpjAtual}.pdf`);
      }

      // CNDT tem validade legal de 180 dias
      const validadeDate = new Date();
      validadeDate.setDate(validadeDate.getDate() + 180);
      const validadeIso = validadeDate.toISOString().split('T')[0];
      const hojeIso = new Date().toISOString().split('T')[0];

      // Atualizar interface completa da CNDT (linha e gaveta)
      atualizarInterfaceCertidao('cndt_trabalhista', {
        situacao: 'NEGATIVA',
        emissao: hojeIso,
        validade: validadeIso,
        downloadUrl: data.downloadUrl,
        nomeArquivo: data.nomeArquivo || `CNDT_${state.cnpjAtual}.pdf`
      });

      el.modalTstEmitir.classList.remove('active');
      mostrarAlerta('success', '✅ Certidão Trabalhista (CNDT) emitida com sucesso e baixada diretamente do TST!');

      if (typeof resolveCndtSequencial === 'function') {
        resolveCndtSequencial(true);
        resolveCndtSequencial = null;
      }
    } catch (err) {
      el.tstEmitirStatus.innerHTML = `<span style="color: var(--status-danger);">Erro: ${err.message}</span>`;
      await carregarCaptchaTst();
    } finally {
      el.btnConfirmarEmitirCndt.disabled = false;
    }
  });

  // =================== CNDT TST: VALIDAÇÃO VIA API ===================
  el.btnValidarCndt.addEventListener('click', () => {
    el.tstValidarNum.value = '';
    el.tstValidarAno.value = new Date().getFullYear();
    el.tstValidarStatus.innerHTML = '';
    el.modalTstValidar.classList.add('active');
    el.tstValidarNum.focus();
  });

  el.btnConfirmarValidarCndt.addEventListener('click', async () => {
    const num = el.tstValidarNum.value.trim();
    const ano = el.tstValidarAno.value.trim();

    if (!num || !ano) {
      el.tstValidarStatus.innerHTML = '<span style="color: var(--status-danger);">Informe o número e o ano da certidão.</span>';
      return;
    }

    el.tstValidarStatus.innerHTML = '<span style="color: var(--cmc-blue-primary); font-weight: 600;">Validando certidão diretamente no TST...</span>';
    el.btnConfirmarValidarCndt.disabled = true;

    try {
      const { res, data } = await fetchJson('/api/tst/validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cnpj: state.cnpjAtual,
          numCertidao: num,
          anoCertidao: ano
        })
      });

      if (!res.ok || !data.sucesso) {
        throw new Error(data.erro || 'Falha na validação');
      }

      if (data.valida) {
        if (data.downloadUrl) {
          dispararDownloadUrl(data.downloadUrl, data.nomeArquivo || `CNDT_VALIDADA_${num}.pdf`);
        } else if (data.pdfBase64) {
          downloadBase64Pdf(data.pdfBase64, data.nomeArquivo || `CNDT_VALIDADA_${num}.pdf`);
        }

        const row = document.getElementById('row-cndt_trabalhista');
        if (row) {
          row.querySelector('.input-situacao').value = 'NEGATIVA';
          row.querySelector('.input-numero').value = `${num}/${ano}`;
          const pdfContainer = row.querySelector('.pdf-container');
          if (pdfContainer) {
            pdfContainer.innerHTML = `
              <div style="display: flex; align-items: center; justify-content: space-between; background: var(--status-ok-bg); padding: 4px 8px; border-radius: 4px; border: 1px solid var(--status-ok-border); font-size: 0.78rem;">
                <span title="${data.nomeArquivo}" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 130px; font-weight: 600; color: var(--status-ok);">
                  📄 ${data.nomeArquivo}
                </span>
                <a href="${data.downloadUrl}" target="_blank" download class="btn btn-sm btn-primary" style="padding: 2px 6px; font-size: 0.72rem;">Baixar</a>
              </div>
            `;
            pdfContainer.setAttribute('data-download-url', data.downloadUrl);
            pdfContainer.setAttribute('data-file-name', data.nomeArquivo);
          }
        }

        el.modalTstValidar.classList.remove('active');
        mostrarAlerta('success', `Certidão nº ${num}/${ano} validada com sucesso pelo TST! O PDF oficial foi baixado.`);
      } else {
        el.tstValidarStatus.innerHTML = `<span style="color: var(--status-danger);">⚠️ ${data.erro || 'Certidão não localizada ou inválida.'}</span>`;
      }
    } catch (err) {
      el.tstValidarStatus.innerHTML = `<span style="color: var(--status-danger);">Erro: ${err.message}</span>`;
    } finally {
      el.btnConfirmarValidarCndt.disabled = false;
    }
  });

  // =================== UPLOAD DE PDF ===================
  function abrirModalUpload(certTipo, nomeCertidao) {
    state.uploadCertTipo = certTipo;
    state.selectedPdfBase64 = null;
    state.selectedPdfNome = null;
    el.uploadCertTipo.value = certTipo;
    el.modalUploadTitle.textContent = `Anexar PDF • ${nomeCertidao}`;
    el.uploadFileInfo.style.display = 'none';
    el.uploadFileInfo.textContent = '';
    el.btnConfirmarUpload.disabled = true;
    el.modalUploadPdf.classList.add('active');
  }

  el.dropArea.addEventListener('click', () => {
    el.fileInputPdf.click();
  });

  el.dropArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    el.dropArea.style.borderColor = 'var(--cmc-blue-primary)';
    el.dropArea.style.backgroundColor = '#edf5fa';
  });

  el.dropArea.addEventListener('dragleave', () => {
    el.dropArea.style.borderColor = 'var(--border-color)';
    el.dropArea.style.backgroundColor = '#fafbfc';
  });

  el.dropArea.addEventListener('drop', (e) => {
    e.preventDefault();
    el.dropArea.style.borderColor = 'var(--border-color)';
    el.dropArea.style.backgroundColor = '#fafbfc';
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processarArquivoPdf(e.dataTransfer.files[0]);
    }
  });

  el.fileInputPdf.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      processarArquivoPdf(e.target.files[0]);
    }
  });

  function processarArquivoPdf(file) {
    if (file.type !== 'application/pdf') {
      alert('Por favor, selecione exclusivamente arquivos com formato PDF.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      alert('O arquivo selecionado excede o limite máximo permitido de 20 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64String = reader.result.split(',')[1];
      state.selectedPdfBase64 = base64String;
      state.selectedPdfNome = file.name;
      el.uploadFileInfo.textContent = `Arquivo selecionado: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
      el.uploadFileInfo.style.display = 'block';
      el.btnConfirmarUpload.disabled = false;
    };
    reader.readAsDataURL(file);
  }

  el.btnConfirmarUpload.addEventListener('click', async () => {
    if (!state.selectedPdfBase64 || !state.uploadCertTipo) return;

    el.btnConfirmarUpload.disabled = true;
    el.btnConfirmarUpload.textContent = 'Enviando...';

    try {
      const { res, data } = await fetchJson('/api/dossie/upload-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cnpj: state.cnpjAtual,
          certTipo: state.uploadCertTipo,
          nomeArquivo: state.selectedPdfNome,
          base64: state.selectedPdfBase64
        })
      });

      if (!res.ok || !data.sucesso) {
        throw new Error(data.erro || 'Falha ao salvar o PDF no servidor');
      }

      // Atualizar interface completa da certidão (linha + gaveta)
      atualizarInterfaceCertidao(state.uploadCertTipo, {
        downloadUrl: data.downloadUrl,
        nomeArquivo: data.nomeArquivo
      });

      el.modalUploadPdf.classList.remove('active');
      mostrarAlerta('success', `PDF vinculado com sucesso à certidão!`);
    } catch (err) {
      alert(`Erro: ${err.message}`);
    } finally {
      el.btnConfirmarUpload.disabled = false;
      el.btnConfirmarUpload.textContent = 'Salvar no Dossiê';
    }
  });

  // =================== SALVAR DOSSIÊ DA CONTRATADA ===================
  el.btnSalvarDossie.addEventListener('click', async () => {
    if (!state.cnpjAtual) {
      mostrarAlerta('warning', 'Nenhum fornecedor consultado para salvar.');
      return;
    }

    const certidoesColetadas = {};
    CERTIDOES_PADRAO.forEach(item => {
      const drawer = document.getElementById(`drawer-${item.id}`) || document.getElementById(`row-${item.id}`);
      if (drawer) {
        const pdfContainer = drawer.querySelector('.pdf-container');
        certidoesColetadas[item.id] = {
          id: item.id,
          nome: item.nome,
          orgao: item.orgao,
          situacao: drawer.querySelector('.input-situacao')?.value || 'PENDENTE',
          numero: drawer.querySelector('.input-numero')?.value || '',
          codigoValidacao: drawer.querySelector('.input-codigo')?.value || '',
          emissao: drawer.querySelector('.input-emissao')?.value || '',
          validade: drawer.querySelector('.input-validade')?.value || '',
          downloadUrl: pdfContainer?.getAttribute('data-download-url') || null,
          pdfNome: pdfContainer?.getAttribute('data-file-name') || null
        };
      }
    });

    const dossiePayload = {
      cnpj: state.cnpjAtual,
      razaoSocial: el.infoRazaoSocial.textContent,
      nomeFantasia: el.infoNomeFantasia.textContent,
      municipio: el.infoMunicipio.textContent,
      situacaoRfb: el.badgeSituacaoRfb.textContent,
      sicafHabilitado: state.sicaf?.habilitadoLicitar,
      contratoNumero: el.contratoNumero.value.trim(),
      contratoObjeto: el.contratoObjeto.value.trim(),
      contratoFiscal: el.contratoFiscal.value.trim(),
      contratoVigencia: el.contratoVigencia.value,
      certidoes: certidoesColetadas
    };

    try {
      const { res, data } = await fetchJson('/api/dossie/salvar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dossiePayload)
      });

      if (!res.ok || !data.sucesso) {
        throw new Error(data.erro || 'Falha ao salvar dossiê');
      }

      mostrarAlerta('success', 'Dossiê da contratada e histórico de certidões salvos com sucesso!');
      atualizarContadorContratadas();
    } catch (err) {
      mostrarAlerta('danger', `Erro ao salvar: ${err.message}`);
    }
  });

  // =================== LISTA DE CONTRATADAS MONITORADAS ===================
  async function carregarListaContratadas() {
    try {
      const { res, data } = await fetchJson('/api/contratadas');
      if (!res.ok || !data.sucesso) return;

      el.countContratadas.textContent = data.total || 0;
      renderizarTabelaContratadas(data.contratadas || []);
    } catch (err) {
      console.error('Erro ao listar contratadas:', err);
    }
  }

  function renderizarTabelaContratadas(lista) {
    if (!lista || lista.length === 0) {
      el.tbodyContratadasLista.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">
            Nenhuma contratada cadastrada ainda. Faça uma busca por CNPJ na aba "Consulta & Dossiê" e clique em "Salvar Dossiê".
          </td>
        </tr>
      `;
      return;
    }

    const termo = el.filtroContratadas.value.toLowerCase().trim();
    const filtradas = lista.filter(c => {
      const cnpj = (c.cnpj || '').toLowerCase();
      const razao = (c.razaoSocial || '').toLowerCase();
      const contrato = (c.contratoNumero || '').toLowerCase();
      return cnpj.includes(termo) || razao.includes(termo) || contrato.includes(termo);
    });

    el.tbodyContratadasLista.innerHTML = '';
    filtradas.forEach(c => {
      // Calcular situação geral das certidões
      let temVencida = false;
      let temVencendo = false;
      let totalVencidas = 0;
      let totalVencendo = 0;

      Object.values(c.certidoes || {}).forEach(cert => {
        const dias = calcularDiasRestantes(cert.validade);
        if (dias !== null) {
          if (dias < 0) {
            temVencida = true;
            totalVencidas++;
          } else if (dias <= 30) {
            temVencendo = true;
            totalVencendo++;
          }
        }
      });

      let badgeStatus = '<span class="badge badge-ok">REGULAR</span>';
      if (temVencida) {
        badgeStatus = `<span class="badge badge-danger">${totalVencidas} VENCIDA(S)</span>`;
      } else if (temVencendo) {
        badgeStatus = `<span class="badge badge-warn">${totalVencendo} VENCENDO</span>`;
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-family: monospace; font-weight: 600;">${mascaraCnpj(c.cnpj)}</td>
        <td>
          <strong>${c.razaoSocial || '-'}</strong>
          ${c.nomeFantasia && c.nomeFantasia !== '(Não informado)' ? `<br><small style="color: var(--text-muted);">${c.nomeFantasia}</small>` : ''}
        </td>
        <td>${c.contratoNumero || '<span style="color: var(--text-muted);">-</span>'}</td>
        <td>${badgeStatus}</td>
        <td>${formatarData(c.atualizadoEm ? c.atualizadoEm.split('T')[0] : '')}</td>
        <td style="text-align: right;">
          <button class="btn btn-primary btn-sm btn-abrir-dossie" data-cnpj="${c.cnpj}" title="Abrir dossiê completo">
            Abrir Dossiê
          </button>
          <button class="btn btn-outline btn-sm btn-excluir-contratada" data-cnpj="${c.cnpj}" title="Remover monitoramento" style="color: var(--status-danger);">
            ✕
          </button>
        </td>
      `;
      el.tbodyContratadasLista.appendChild(tr);
    });

    // Eventos nos botões da lista
    document.querySelectorAll('.btn-abrir-dossie').forEach(btn => {
      btn.addEventListener('click', () => {
        const cnpj = btn.getAttribute('data-cnpj');
        // Alternar para aba 1 e consultar
        document.querySelector('[data-tab="tab-consulta"]').click();
        el.inputCnpj.value = mascaraCnpj(cnpj);
        realizarConsulta(cnpj);
      });
    });

    document.querySelectorAll('.btn-excluir-contratada').forEach(btn => {
      btn.addEventListener('click', async () => {
        const cnpj = btn.getAttribute('data-cnpj');
        if (confirm(`Deseja realmente remover a contratada CNPJ ${mascaraCnpj(cnpj)} do monitoramento?`)) {
          await fetch(`/api/contratadas/${cnpj}`, { method: 'DELETE' });
          carregarListaContratadas();
        }
      });
    });
  }

  el.filtroContratadas.addEventListener('input', () => {
    carregarListaContratadas();
  });

  async function atualizarContadorContratadas() {
    try {
      const { res, data } = await fetchJson('/api/contratadas');
      if (data.sucesso) {
        el.countContratadas.textContent = data.total || 0;
      }
    } catch (e) {}
  }

  // =================== CONFIGURAÇÕES (CHAVE CGU) ===================
  el.btnConfig.addEventListener('click', abrirModalConfig);

  async function abrirModalConfig() {
    try {
      const { res, data } = await fetchJson('/api/config');
      if (data.sucesso && data.temChaveCgu) {
        el.configCguKey.placeholder = `Chave atual: ${data.chaveMascarada}`;
      } else {
        el.configCguKey.placeholder = 'Cole aqui sua chave-api-dados da CGU';
      }
    } catch (e) {}
    el.modalConfig.classList.add('active');
  }

  el.btnSalvarConfig.addEventListener('click', async () => {
    const key = el.configCguKey.value.trim();
    try {
      const { res, data } = await fetchJson('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cguApiKey: key })
      });
      if (data.sucesso) {
        el.modalConfig.classList.remove('active');
        mostrarAlerta('success', 'Configurações de API salvas com sucesso!');
        if (state.cnpjAtual) {
          realizarConsulta(state.cnpjAtual);
        }
      }
    } catch (err) {
      alert(`Erro: ${err.message}`);
    }
  });

  // =================== IMPRESSÃO ===================
  el.btnImprimir.addEventListener('click', () => {
    if (el.printDate) {
      el.printDate.textContent = new Date().toLocaleDateString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    }
    window.print();
  });

  // Inicialização
  atualizarContadorContratadas();

})();
