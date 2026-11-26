# EstoquePro — Controle de Estoque Distribuído

**Projeto:** Sistemas Distribuídos — Atividade AV1 (Web Service)
**Integrante:** Diego Henrique Magalhães — RA 30242020130
**Professor:** Joao Vagner Pereira Da Silva

Aplicação distribuída cliente-servidor desacoplada para controle de estoque. O front-end
consome e manipula os recursos por requisições **REST com payload JSON**, com persistência
em **banco NoSQL orientado a documentos**, e o campo **`id`** é a chave primária
distribuída em todas as operações.

---

## 1. Como abrir

Não há build, não há dependências e não há instalação.

| Modo | Como | Resultado |
|---|---|---|
| Local | Abrir `index.html` no navegador | Funciona na hora, com dados de demonstração salvos no navegador |
| Servidor local | `python3 -m http.server 8000` na pasta | `http://localhost:8000` |
| Web Service real | Ligar o interruptor **“Usar Web Service Technoworks”** | As operações passam a chamar o endpoint REST configurado |

O site roda em Windows, Linux, macOS, Android e iOS — depende apenas de HTTP, HTML5 e
JavaScript ES6+, sem nada específico de plataforma.

---

## 2. Arquitetura

```
Cliente (navegador, qualquer SO)
        │  HTTP/HTTPS
        ▼
Front-End  ── HTML5 · CSS3 · JavaScript (ES6+) · Fetch API
        │  REST + JSON  (métodos GET, POST, PUT, DELETE)
        ▼
Web Service  ── Technoworks.com.br/apidoc
        │
        ▼
Banco NoSQL orientado a documentos  ── cada registro indexado pelo campo `id`
```

No código, essa separação aparece na seção `5. PERSISTÊNCIA` de `assets/app.js`: a camada
`Technoworks` isola todas as chamadas de rede e a camada `LocalStore` responde pela
demonstração. A interface nunca fala com banco de dados diretamente — só com a camada de
serviço.

---

## 3. Os três modos do ambiente padrão

| Modo | Métodos | Uso no sistema |
|---|---|---|
| `api` | GET, POST, PUT, DELETE | Coleção estruturada de itens: `id`, `titulo`, `descricao`, `preco` |
| `rest` | GET, POST, PUT, DELETE | Coleção livre `movimentacoes`, com atributos dinâmicos |
| `easy` | apenas GET | Operações via query string, usadas na baixa rápida de balcão |

### Estrutura do documento

```json
{
  "id": "est_9842a1f0",
  "titulo": "Parafuso Sextavado M8 x 40mm",
  "descricao": "Item de fixação controlado em estoque, unidade: caixa com 100 peças.",
  "preco": 24.90,
  "quantidade": 320,
  "estoque_minimo": 80,
  "deposito": "Almoxarifado Central"
}
```

### Chamadas REST reais

```js
const BASE_URL = "https://technoworks.com.br/apidoc";

// listar itens
const itens = await fetch(`${BASE_URL}/api`, {
  headers: { "Accept": "application/json" }
}).then(r => r.json());

// criar item (o id é obrigatório)
await fetch(`${BASE_URL}/api`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "Accept": "application/json" },
  body: JSON.stringify({ id, titulo, descricao, preco })
});

// atualizar / remover
await fetch(`${BASE_URL}/api/${encodeURIComponent(id)}`, { method: "PUT",  body: JSON.stringify({ id, ...dados }) });
await fetch(`${BASE_URL}/api/${encodeURIComponent(id)}`, { method: "DELETE" });

// movimentação na coleção livre
await fetch(`${BASE_URL}/rest/movimentacoes`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ id, item_id, tipo, quantidade, responsavel })
});

// modo easy: tudo por GET
await fetch(`${BASE_URL}/easy?action=insert&id=${id}&quantidade=${qtd}`);
```

---

## 4. Funcionalidades

- **Painel de saldos** — cartões por item, com barra de proporção saldo/mínimo e destaque
  automático dos itens críticos.
- **Itens (CRUD completo)** — cadastro, leitura, atualização e exclusão por `id`, com
  categoria, depósito, custo unitário, saldo e mínimo.
- **Movimentações** — entrada, saída e ajuste, sempre gravadas com `saldo_antes`,
  `saldo_apos`, responsável, protocolo e data/hora.
- **Alertas de reposição** — itens abaixo do mínimo, com a quantidade exata a repor, e
  exportação da coleção em CSV.
- **Log de requisições** — cada operação registra método, alvo e resultado, deixando
  visível o tráfego REST/JSON que o front-end gera.
- **Teste de conexão** — botão “Testar conexão” que verifica se o Web Service responde.

---

## 5. Integridade sob concorrência

O ponto de tensão do projeto é o saldo. Duas saídas simultâneas do mesmo `id` não podem
gerar saldo negativo nem leitura desatualizada, e o sistema trata isso em duas frentes:

1. **Validação antes da gravação.** A saída é recusada quando a quantidade é maior que o
   saldo disponível — `validarSaida()` em `assets/app.js` devolve o motivo e a operação não
   é gravada.
2. **Saldo recalculado a partir do histórico.** Cada movimentação guarda `saldo_antes` e
   `saldo_apos`, de modo que o saldo é reconstruível pelo histórico persistido, e não pela
   última leitura feita pelo cliente.

O **`id` único** é o que impede que duas entradas do mesmo material criem documentos
distintos e dividam o saldo real entre eles. Quando o usuário não informa um identificador,
o sistema gera um no padrão `est_<timestamp><sufixo aleatório>`.

---

## 6. Estrutura de arquivos

```
estoque-web/
├── index.html          interface (SPA, HTML5 + CSS3)
├── assets/
│   ├── style.css       identidade visual e responsividade
│   └── app.js          camada de serviço + controle da interface
└── README.md           este documento
```

---

## 7. Publicar com link público

O site é composto apenas de arquivos estáticos, então qualquer serviço de hospedagem
estática funciona. Três caminhos, do mais rápido ao mais completo:

**GitHub Pages (recomendado, gratuito e estável)**

1. Crie um repositório público e envie os três arquivos (`index.html`, `assets/style.css`, `assets/app.js`).
2. Em *Settings → Pages*, escolha a branch `main` e a pasta `/ (root)`.
3. Em um ou dois minutos o link fica disponível no formato
   `https://seu-usuario.github.io/nome-do-repositorio/`.

**Netlify Drop (sem conta, o mais rápido)**

1. Acesse `app.netlify.com/drop`.
2. Arraste a pasta `estoque-web` inteira para a página.
3. O link público é gerado na hora.

**Vercel**

1. Instale a CLI, rode `vercel` dentro da pasta e confirme as opções padrão.

Em qualquer um dos três, envie ao professor o link gerado.
