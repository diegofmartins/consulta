FROM node:20-slim

# Instalar dependências necessárias para o Chromium / Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-freefont-ttf \
    fonts-ipafont-gothic \
    fonts-kacst \
    fonts-thai-tlwg \
    fonts-wqy-zenhei \
    libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Configurar variáveis de ambiente do Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

# Instalar dependências de produção
COPY package*.json ./
RUN npm install --omit=dev

# Copiar código-fonte da aplicação
COPY . .

# Criar pastas para armazenamento de dossiês e uploads
RUN mkdir -p uploads data

EXPOSE 3000

CMD ["node", "server.js"]
