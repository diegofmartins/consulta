# SICC-CMC • Sistema Integrado de Consulta e Dossiê de Certidões
### Câmara Municipal de Curitiba (CMC) • Diretoria de Contratações

O **SICC-CMC** é uma aplicação completa e moderna desenvolvida para apoiar a **Diretoria de Contratações da Câmara Municipal de Curitiba** na fiscalização periódica e contínua da conformidade fiscal, trabalhista e correcional de fornecedores e empresas contratadas, atendendo aos requisitos da **Lei Federal nº 14.133/2021** (Nova Lei de Licitações e Contratos Administrativos).

---

## 1. Destaques e Funcionalidades

- **⚡ Verificação Automatizada Contínua (Esteira de 1-Clique):** Consulta e emite certidões em sequência automática (TCU ➔ FGTS ➔ SEFA-PR ➔ Curitiba ➔ CNDT ➔ Receita Federal).
- **📋 Painel Cadastral Aglutinado:** Dados da Receita Federal, CNAE Principal, Porte, Natureza Jurídica, Habilitação SICAF (Nível III) e Sanções CGU (CEIS/CNEP) integrados em um card condensado e minimalista.
- **📂 Linhas Expansíveis (Accordion):** Cada certidão possui linha principal com resumo visual (órgão, situação, dias para expiração e link rápido de download) e gaveta expansível com campos de número, código de autenticação, datas e upload manual de PDF.
- **🤖 Robôs Headless com Evasão de Detecção (Puppeteer Stealth):**
  - **TCU / APF:** Certidão Consolidada da APF (TCU, CNJ, CEIS e CNEP) via API REST e download de PDF oficial.
  - **FGTS / Caixa:** Emissão 100% headless do Certificado de Regularidade do FGTS (CRF) em PDF A4.
  - **SEFA-PR:** Emissão automatizada da Certidão Negativa Estadual com evasão de detecção e validação de UF de origem.
  - **Prefeitura de Curitiba (PMC):** Consulta na listagem oficial e emissão em PDF de alta resolução da CND Municipal (com guarda de município).
  - **CNDT (TST):** Integração direta com o webservice do Tribunal Superior do Trabalho, com captcha ampliado e nítido.
  - **Receita Federal (RFB/PGFN):** Modo assistido com abertura de janela limpa e detecção automática do PDF emitido.
- **📄 Download e Gestão de PDFs:** Repositório local por CNPJ com download direto e exportação para impressão formatada para o SEI / Processo de Pagamento.

---

## 2. Tecnologias Utilizadas

- **Backend:** Node.js (v20+), HTTP nativo, Puppeteer Core + Puppeteer Extra Stealth.
- **Frontend:** HTML5 semântico, CSS3 moderno com variáveis institucionais da CMC, JavaScript ES6+ (vanilla, sem dependências pesadas).
- **Containerização:** Docker e Docker Compose prontos para produção.
- **Integração Contínua:** GitHub Actions para validação de sintaxe e testes de integridade.

---

## 3. Como Rodar Localmente

### Pré-requisitos
- Node.js 20+ instalado
- Google Chrome ou Chromium instalado na máquina

### Instalação
```bash
# 1. Clonar o repositório
git clone https://github.com/SEU-USUARIO/sicc-cmc.git
cd sicc-cmc

# 2. Instalar dependências
npm install

# 3. Iniciar o servidor
npm start
```

Acesse no navegador: **`http://localhost:3000`**

---

## 4. Deploy com Docker

O projeto já inclui um `Dockerfile` otimizado com Chromium e fontes pré-instaladas.

```bash
# Construir a imagem Docker
docker build -t sicc-cmc .

# Executar o contêiner
docker run -d -p 3000:3000 --name sicc-cmc-app sicc-cmc
```

Também é possível fazer deploy em plataformas como **Render**, **Railway**, **Fly.io** ou qualquer VPS utilizando a imagem Docker gerada automaticamente.

---

## 5. Como Fazer Deploy / Push para o GitHub

Para publicar as alterações no seu repositório no GitHub:

```bash
# 1. Inicializar o repositório Git (se ainda não estiver inicializado)
git init

# 2. Adicionar o repositório remoto
git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git

# 3. Adicionar os arquivos e commitar
git add .
git commit -m "feat: Interface minimalista, esteira sequencial e automação de certidões"

# 4. Enviar para o GitHub
git branch -M main
git push -u origin main
```

---

## 6. Estrutura do Projeto

```
.
├── server.js                 # Servidor backend HTTP e rotas de automação
├── curitiba_automation.js    # Robô de emissão da Prefeitura de Curitiba (PMC)
├── fgts_automation.js        # Robô de emissão do CRF FGTS (Caixa Econômica)
├── sefa_automation.js        # Robô de emissão da SEFA-PR com Puppeteer Stealth
├── tcu_automation.js         # Robô de emissão da Certidão Consolidada APF (TCU)
├── receita_automation.js     # Automação assistida da Receita Federal
├── package.json              # Configurações e dependências do projeto
├── Dockerfile                # Configuração de build e containerização
├── .gitignore                # Regras de exclusão de arquivos temporários e PDFs
├── .github/
│   └── workflows/
│       └── ci.yml            # Pipeline de integração contínua (GitHub Actions)
├── public/
│   ├── index.html            # Interface de usuário moderna e responsiva
│   ├── css/style.css         # Estilização minimalista e regras de impressão SEI
│   └── js/app.js             # Lógica reativa, esteira sequencial e modais
├── data/                     # Armazenamento de configurações e dossiês salvos
└── uploads/                  # Repositório de arquivos PDFs organizados por CNPJ
```

---

## 7. Diretrizes Legais Observadas
- **Lei Federal nº 14.133/2021 (Art. 92, inciso XVI):** Obrigação da contratada de manter todas as condições de habilitação e qualificação durante a execução contratual.
- **Lei Federal nº 12.440/2011:** Obrigatoriedade da CNDT para contratos públicos.
- **Instrução Normativa SEGES/ME nº 03/2018:** Disposições sobre o SICAF e níveis de regularidade federal.
