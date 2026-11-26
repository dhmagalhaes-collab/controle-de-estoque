/* ============================================================
   EstoquePro — camada de serviço e controle da interface
   Tema: Controle de Estoque | Sistemas Distribuídos (AV1)

   Duas camadas de persistência convivem no mesmo código:
   - LocalStore  : demonstração, grava no localStorage (abre e funciona)
   - Technoworks : Web Service real, REST/JSON com chave id
   Basta ligar o interruptor "Usar Web Service Technoworks".
   ============================================================ */
"use strict";

/* ------------------------------------------------------------
   1. CONFIGURAÇÃO
------------------------------------------------------------ */
const CONFIG = {
  baseUrl: "https://technoworks.com.br/apidoc",
  colecaoApi: "api",            // catálogo de itens (id, titulo, descricao, preco)
  colecaoMov: "movimentacoes",  // coleção livre dos movimentos
  usarWebService: false,
  storageKey: "estoque_pro_v1",
};

const CATEGORIAS = ["Fixação", "Elétrica", "Ferramentas", "EPI", "Escritório", "Manutenção"];
const DEPOSITOS = ["Almoxarifado Central", "Depósito Loja", "Retaguarda", "Obra / Campo"];
const PROTOCOLOS = { rest: "REST/JSON", easy: "Easy (GET)" };

/* ------------------------------------------------------------
   2. ESTADO
------------------------------------------------------------ */
const state = {
  itens: [],
  movimentacoes: [],
  filtroCategoria: "todas",
  filtroSituacao: "todas",
  busca: "",
  buscaPainel: "",
  ordem: "titulo",
  logs: [],
};

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* ------------------------------------------------------------
   3. UTILIDADES
------------------------------------------------------------ */
const esc = (t) => String(t == null ? "" : t)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const brl = (n) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (n) => (Number(n) || 0).toLocaleString("pt-BR");

function agora() {
  const d = new Date();
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric",
                                    hour: "2-digit", minute: "2-digit" });
}

function gerarId(prefixo = "est") {
  return `${prefixo}_${Date.now().toString().slice(-9)}${Math.floor(Math.random() * 90 + 10)}`;
}

/* ------------------------------------------------------------
   4. PERSISTÊNCIA — LocalStore (demonstração)
------------------------------------------------------------ */
const LocalStore = {
  ler() {
    try { return JSON.parse(localStorage.getItem(CONFIG.storageKey) || "null"); }
    catch { return null; }
  },
  gravar() {
    try {
      localStorage.setItem(CONFIG.storageKey, JSON.stringify({
        itens: state.itens, movimentacoes: state.movimentacoes,
      }));
    } catch { /* modo privado do navegador: segue só em memória */ }
  },
};

function dadosSemente() {
  const base = [
    ["Fixação", "Parafuso sextavado M8 x 40mm", "Aço inox, caixa com 100 peças", 24.9, 320, 80, 0],
    ["Fixação", "Bucha nylon S8", "Pacote com 50 unidades", 12.5, 64, 100, 0],
    ["Elétrica", "Cabo flexível 2,5mm² rolo 100m", "750V, isolação PVC", 289.0, 18, 20, 1],
    ["Elétrica", "Disjuntor monofásico 20A", "Curva C, DIN", 34.9, 145, 40, 0],
    ["Ferramentas", "Furadeira de impacto 850W", "Mandril 1/2, com maleta", 439.0, 7, 5, 0],
    ["EPI", "Luva de segurança nitrílica", "Par, tamanho M, CA aprovado", 18.75, 210, 60, 2],
    ["EPI", "Óculos de proteção translúcido", "Policarbonato antiembaçante", 21.4, 38, 50, 2],
    ["Escritório", "Resma papel A4 75g", "500 folhas", 27.9, 96, 30, 1],
    ["Escritório", "Toner impressora preto", "Compatível, 2.600 páginas", 189.9, 4, 6, 1],
    ["Manutenção", "Óleo lubrificante 1L", "ISO VG 68", 42.5, 52, 25, 2],
    ["Manutenção", "Fita veda-rosca", "Rolo 18mm x 50m", 8.9, 6, 40, 3],
    ["Fixação", "Chumbador parabolt 3/8", "Aço zincado, unidade", 6.3, 480, 150, 3],
  ];
  return base.map(([categoria, titulo, descricao, preco, quantidade, minimo, dep], i) => ({
    id: `est_1000${String(i + 1).padStart(3, "0")}`,
    codigo: `SKU-${String(1000 + i * 7)}`,
    titulo, descricao, categoria,
    preco, quantidade, estoque_minimo: minimo,
    deposito: DEPOSITOS[dep],
  }));
}

/* ------------------------------------------------------------
   5. PERSISTÊNCIA — Web Service Technoworks (REST/JSON)
   Cada função abstrai um dos três modos documentados em /apidoc.
------------------------------------------------------------ */
const Technoworks = {
  url(path) { return `${CONFIG.baseUrl.replace(/\/+$/, "")}${path}`; },

  cabecalhos(extra = {}) {
    return { Accept: "application/json", ...extra };
  },

  // modo api — coleção estruturada (id, titulo, descricao, preco)
  async listarItens() {
    const r = await fetch(this.url(`/${CONFIG.colecaoApi}`), { method: "GET", headers: this.cabecalhos() });
    if (!r.ok) throw new Error(`Erro HTTP: ${r.status}`);
    return await r.json();
  },

  async criarItem(item) {
    if (!item.id) throw new Error("O campo ID é obrigatório para persistência.");
    const r = await fetch(this.url(`/${CONFIG.colecaoApi}`), {
      method: "POST",
      headers: this.cabecalhos({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        id: item.id, titulo: item.titulo, descricao: item.descricao, preco: Number(item.preco),
      }),
    });
    if (!r.ok) throw new Error(`Erro HTTP: ${r.status}`);
    return await r.json();
  },

  async atualizarItem(id, dados) {
    const r = await fetch(this.url(`/${CONFIG.colecaoApi}/${encodeURIComponent(id)}`), {
      method: "PUT",
      headers: this.cabecalhos({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id, ...dados }),
    });
    if (!r.ok) throw new Error(`Erro HTTP: ${r.status}`);
    return await r.json();
  },

  async removerItem(id) {
    const r = await fetch(this.url(`/${CONFIG.colecaoApi}/${encodeURIComponent(id)}`), {
      method: "DELETE", headers: this.cabecalhos(),
    });
    if (!r.ok) throw new Error(`Erro HTTP: ${r.status}`);
    return await r.json();
  },

  // modo rest — coleção livre, atributos dinâmicos
  async listarColecao(colecao) {
    const r = await fetch(this.url(`/rest/${colecao}`), { method: "GET", headers: this.cabecalhos() });
    if (!r.ok) throw new Error(`Erro HTTP: ${r.status}`);
    return await r.json();
  },

  async inserirDocumento(colecao, doc) {
    if (!doc.id) throw new Error("O campo ID é obrigatório para persistência.");
    const r = await fetch(this.url(`/rest/${colecao}`), {
      method: "POST",
      headers: this.cabecalhos({ "Content-Type": "application/json" }),
      body: JSON.stringify(doc),
    });
    if (!r.ok) throw new Error(`Erro HTTP: ${r.status}`);
    return await r.json();
  },

  // modo easy — REST modificado, exclusivamente GET via query string
  async easy(acao, dados = {}) {
    const params = new URLSearchParams({ action: acao });
    Object.entries(dados).forEach(([k, v]) => { if (v !== undefined && v !== null) params.set(k, v); });
    const r = await fetch(this.url(`/easy?${params.toString()}`), { method: "GET", headers: this.cabecalhos() });
    if (!r.ok) throw new Error(`Erro HTTP: ${r.status}`);
    return await r.json();
  },

  async testarConexao() {
    try {
      const r = await fetch(this.url(`/${CONFIG.colecaoApi}`), { method: "GET", headers: this.cabecalhos() });
      return { ok: r.ok, status: r.status };
    } catch (e) {
      return { ok: false, status: 0, erro: e.message };
    }
  },
};

/* ------------------------------------------------------------
   6. LOG DE REQUISIÇÕES
------------------------------------------------------------ */
function log(metodo, alvo, msg, tipo = "local") {
  state.logs.unshift({ t: new Date().toLocaleTimeString("pt-BR"), metodo, alvo, msg, tipo });
  state.logs = state.logs.slice(0, 60);
  renderLog();
}

function renderLog() {
  const box = $("#logApi");
  if (!box) return;
  if (!state.logs.length) {
    box.innerHTML = `<p class="empty">Nenhuma requisição registrada. Use o painel para gerar tráfego.</p>`;
    return;
  }
  box.innerHTML = state.logs.map(l => `
    <div class="log-line ${l.tipo}">
      <span class="log-time">${esc(l.t)}</span>
      <span class="m ${l.metodo === "GET" ? "get" : l.metodo === "POST" ? "post" : l.metodo === "PUT" ? "put" : "del"}">${esc(l.metodo)}</span>
      <span class="log-msg"><b>${esc(l.alvo)}</b> — ${esc(l.msg)}</span>
    </div>`).join("");
}

/* ------------------------------------------------------------
   7. REGRAS DE NEGÓCIO DO ESTOQUE
------------------------------------------------------------ */
const saldo = (item) => Number(item.quantidade) || 0;

function situacao(item) {
  const s = saldo(item), min = Number(item.estoque_minimo) || 0;
  if (s <= 0) return { chave: "zerado", rotulo: "Sem estoque", classe: "danger" };
  if (s < min) return { chave: "critico", rotulo: "Abaixo do mínimo", classe: "warn" };
  if (min > 0 && s < min * 1.25) return { chave: "atencao", rotulo: "Atenção", classe: "warn" };
  return { chave: "ok", rotulo: "Normal", classe: "ok" };
}

function buscarItem(id) { return state.itens.find(i => i.id === id); }

/** Detecta saída que zeraria negativamente o saldo — a validação de integridade. */
function validarSaida(item, quantidade) {
  if (!item) return "Item não encontrado na coleção.";
  if (quantidade <= 0) return "A quantidade precisa ser maior que zero.";
  if (quantidade > saldo(item)) {
    return `Saldo insuficiente: disponível ${num(saldo(item))}, solicitado ${num(quantidade)}.`;
  }
  return null;
}

function aplicarMovimentacao(item, tipo, quantidade, responsavel) {
  const antes = saldo(item);
  if (tipo === "entrada") item.quantidade = antes + quantidade;
  else if (tipo === "saida") item.quantidade = antes - quantidade;
  else item.quantidade = quantidade; // ajuste define o saldo
  return antes;
}

function registrarMovimentacao({ item, tipo, quantidade, responsavel, protocolo }) {
  const antes = aplicarMovimentacao(item, tipo, quantidade, responsavel);
  const mov = {
    id: gerarId("mov"),
    item_id: item.id,
    titulo: item.titulo,
    tipo,
    quantidade,
    saldo_antes: antes,
    saldo_apos: saldo(item),
    responsavel,
    protocolo,
    data: agora(),
    ts: Date.now(),
  };
  state.movimentacoes.unshift(mov);
  return mov;
}

/* ------------------------------------------------------------
   8. AÇÕES (serviço de comunicação)
------------------------------------------------------------ */
async function salvarItem(form) {
  const id = $("#f-id").value || gerarId("est");
  const modo = $("#f-modo").value;
  const dados = {
    id,
    codigo: $("#f-codigo").value.trim(),
    titulo: $("#f-titulo").value.trim(),
    descricao: $("#f-descricao").value.trim(),
    categoria: $("#f-categoria").value,
    deposito: $("#f-deposito").value,
    preco: Number($("#f-preco").value) || 0,
    estoque_minimo: Number($("#f-minimo").value) || 0,
  };
  const qtdInformada = Number($("#f-quantidade").value) || 0;
  const existente = buscarItem(id);
  const quantidade = existente ? saldo(existente) : qtdInformada;

  if (!dados.titulo) { toast("err", "Título obrigatório", "Informe o título do item."); return; }

  if (CONFIG.usarWebService) {
    try {
      if (modo === "easy") {
        await Technoworks.easy(existente ? "update" : "insert", {
          id, titulo: dados.titulo, descricao: dados.descricao, preco: dados.preco, quantidade,
        });
        log("GET", `/easy?action=${existente ? "update" : "insert"}`, `modo easy · item ${id}`, "ok");
      } else if (existente) {
        await Technoworks.atualizarItem(id, dados);
        log("PUT", `/api/${id}`, "item atualizado no banco NoSQL", "ok");
      } else {
        await Technoworks.criarItem(dados);
        log("POST", "/api", `documento ${id} persistido`, "ok");
      }
    } catch (e) {
      log(modo === "easy" ? "GET" : "POST", "/api", `falha: ${e.message}`, "err");
      toast("err", "Falha no Web Service", `${e.message} — o item foi gravado apenas localmente.`);
    }
  } else {
    log(modo === "easy" ? "GET" : existente ? "PUT" : "POST",
        modo === "easy" ? "/easy?action=..." : existente ? `/api/${id}` : "/api",
        "gravação local (dados de demonstração)", "local");
  }

  const item = { ...dados, quantidade };
  const antigo = Number($("#f-quantidade").value) || 0;
  if (existente) Object.assign(existente, item);
  else {
    state.itens.push(item);
    if (antigo > 0) {
      // saldo inicial entra como movimentação de entrada, para o histórico ficar coerente
      state.movimentacoes.unshift({
        id: gerarId("mov"), item_id: item.id, titulo: item.titulo, tipo: "entrada",
        quantidade: antigo, saldo_antes: 0, saldo_apos: antigo,
        responsavel: "Cadastro inicial do item", protocolo: PROTOCOLOS[modo],
        data: agora(), ts: Date.now(),
      });
    }
  }

  LocalStore.gravar();
  limparForm();
  renderTudo();
  toast("ok", existente ? "Item atualizado" : "Item cadastrado",
        `${dados.titulo} — id ${id} · ${PROTOCOLOS[modo]}`);
}

async function excluirItem(id) {
  const item = buscarItem(id);
  if (!item) return;
  abrirModal(`
    <h3>Excluir “${esc(item.titulo)}”?</h3>
    <p class="sub">O documento <code>${esc(id)}</code> será removido da coleção. A operação é idempotente: repetir a chamada com o mesmo id não altera mais nada.</p>
    <div class="modal-json">${esc(JSON.stringify({ id: item.id, titulo: item.titulo, descricao: item.descricao, preco: item.preco }, null, 2))}</div>
    <div class="row">
      <button class="btn btn-ghost" data-action="fechar-modal">Cancelar</button>
      <button class="btn btn-primary" data-action="confirmar-exclusao" data-id="${esc(id)}">Confirmar exclusão</button>
    </div>`);
}

async function confirmarExclusao(id) {
  if (CONFIG.usarWebService) {
    try {
      await Technoworks.removerItem(id);
      log("DELETE", `/api/${id}`, "documento removido", "ok");
    } catch (e) {
      log("DELETE", `/api/${id}`, `falha: ${e.message}`, "err");
      toast("err", "Falha no Web Service", e.message);
    }
  } else {
    log("DELETE", `/api/${id}`, "remoção local (demonstração)", "local");
  }
  state.itens = state.itens.filter(i => i.id !== id);
  LocalStore.gravar();
  fecharModal();
  renderTudo();
  toast("ok", "Item excluído", `Documento ${id} removido da coleção.`);
}

async function registrarMov(form) {
  const itemId = $("#m-item").value;
  const tipo = $("#m-tipo").value;
  const quantidade = Number($("#m-qtd").value) || 0;
  const responsavel = $("#m-resp").value.trim() || "Não informado";
  const modo = $("#m-modo").value;
  const item = buscarItem(itemId);

  if (!item) { toast("err", "Item inválido", "Selecione um item cadastrado."); return; }
  if (tipo === "saida") {
    const erro = validarSaida(item, quantidade);
    if (erro) {
      log(modo === "easy" ? "GET" : "POST", `/rest/${CONFIG.colecaoMov}`, `saída bloqueada: ${erro}`, "err");
      toast("err", "Saída bloqueada", erro);
      return;
    }
  }

  const mov = registrarMovimentacao({ item, tipo, quantidade, responsavel, protocolo: PROTOCOLOS[modo] });

  if (CONFIG.usarWebService) {
    try {
      if (modo === "easy") {
        await Technoworks.easy("insert", {
          id: mov.id, item_id: mov.item_id, tipo, quantidade, responsavel,
        });
        log("GET", `/easy?action=insert&id=${mov.id}`, "movimentação via modo easy", "ok");
      } else {
        await Technoworks.inserirDocumento(CONFIG.colecaoMov, {
          id: mov.id, item_id: mov.item_id, tipo, quantidade,
          saldo_apos: mov.saldo_apos, responsavel, data: mov.data,
        });
        log("POST", `/rest/${CONFIG.colecaoMov}`, `documento ${mov.id} persistido`, "ok");
      }
      await Technoworks.atualizarItem(item.id, {
        titulo: item.titulo, descricao: item.descricao, preco: item.preco, quantidade: saldo(item),
      });
      log("PUT", `/api/${item.id}`, `saldo sincronizado em ${num(saldo(item))}`, "ok");
    } catch (e) {
      log("POST", `/rest/${CONFIG.colecaoMov}`, `falha: ${e.message}`, "err");
      toast("err", "Falha no Web Service", `${e.message} — movimentação mantida apenas localmente.`);
    }
  } else {
    log(modo === "easy" ? "GET" : "POST",
        modo === "easy" ? "/easy?action=insert" : `/rest/${CONFIG.colecaoMov}`,
        "movimentação gravada localmente", "local");
  }

  LocalStore.gravar();
  form.reset();
  form.hidden = true;
  renderTudo();
  toast("ok", "Movimentação registrada",
        `${tipo === "entrada" ? "Entrada" : tipo === "saida" ? "Saída" : "Ajuste"} de ${num(quantidade)} — saldo agora ${num(saldo(item))}.`);
}

/* ------------------------------------------------------------
   9. EXPORTAÇÃO
------------------------------------------------------------ */
function exportarCSV() {
  const linhas = [["id", "codigo", "titulo", "categoria", "deposito", "preco", "quantidade", "estoque_minimo", "situacao"]];
  filtrados().forEach(i => linhas.push([
    i.id, i.codigo, i.titulo, i.categoria, i.deposito,
    String(i.preco).replace(".", ","), i.quantidade, i.estoque_minimo, situacao(i).rotulo,
  ]));
  const csv = linhas.map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "estoque-itens.csv";
  a.click();
  URL.revokeObjectURL(a.href);
  toast("ok", "CSV exportado", "A coleção atual foi salva no formato JSON-compatível.");
}

/* ------------------------------------------------------------
   10. RENDERIZAÇÃO
------------------------------------------------------------ */
function filtrados() {
  const termo = state.busca.toLowerCase();
  return state.itens
    .filter(i => state.filtroCategoria === "todas" || i.categoria === state.filtroCategoria)
    .filter(i => state.filtroSituacao === "todas" || situacao(i).chave === state.filtroSituacao)
    .filter(i => !termo || [i.titulo, i.id, i.codigo, i.deposito, i.categoria]
      .some(v => String(v).toLowerCase().includes(termo)))
    .sort((a, b) => {
      if (state.ordem === "saldo-asc") return saldo(a) - saldo(b);
      if (state.ordem === "saldo-desc") return saldo(b) - saldo(a);
      if (state.ordem === "valor-desc") return saldo(b) * b.preco - saldo(a) * a.preco;
      return a.titulo.localeCompare(b.titulo, "pt-BR");
    });
}

function renderKPIs() {
  const total = state.itens.length;
  const unidades = state.itens.reduce((s, i) => s + saldo(i), 0);
  const alertas = state.itens.filter(i => ["critico", "zerado"].includes(situacao(i).chave)).length;
  const valor = state.itens.reduce((s, i) => s + saldo(i) * (Number(i.preco) || 0), 0);
  $("#heroTotal").textContent = num(total);
  $("#heroSaldo").textContent = num(unidades);
  $("#heroAlertas").textContent = num(alertas);
  $("#heroValor").textContent = brl(valor);
}

function renderCards() {
  const termo = state.buscaPainel.toLowerCase();
  const lista = state.itens
    .filter(i => !termo || [i.titulo, i.id, i.deposito, i.categoria].some(v => String(v).toLowerCase().includes(termo)))
    .sort((a, b) => saldo(a) / (a.estoque_minimo || 1) - saldo(b) / (b.estoque_minimo || 1));

  const box = $("#cardsPainel");
  if (!lista.length) {
    box.innerHTML = `<p class="empty">Nenhum item corresponde ao filtro.</p>`;
    return;
  }
  box.innerHTML = lista.map(i => {
    const s = situacao(i);
    const min = Number(i.estoque_minimo) || 0;
    const pct = min > 0 ? Math.min(100, Math.round((saldo(i) / (min * 2)) * 100)) : 100;
    return `
      <article class="card ${["critico", "zerado"].includes(s.chave) ? "alert" : ""}">
        <div class="card-top">
          <div>
            <div class="card-title">${esc(i.titulo)}</div>
            <div class="card-id">${esc(i.id)} · ${esc(i.deposito)}</div>
          </div>
          <span class="card-cat">${esc(i.categoria)}</span>
        </div>
        <div class="card-mid">
          <div class="card-saldo">${num(saldo(i))} <small>/ mín ${num(min)}</small></div>
          <span class="badge ${s.classe}">${s.rotulo}</span>
        </div>
        <div class="bar"><i style="width:${pct}%"></i></div>
        <div class="card-foot">
          <span>Custo ${brl(i.preco)}</span>
          <span>Total ${brl(saldo(i) * (Number(i.preco) || 0))}</span>
        </div>
        <div class="card-actions">
          <button class="btn-icon" data-action="entrada-rapida" data-id="${esc(i.id)}">+ Entrada</button>
          <button class="btn-icon danger" data-action="saida-rapida" data-id="${esc(i.id)}">− Saída</button>
        </div>
      </article>`;
  }).join("");
}

function renderChips() {
  const cats = ["todas", ...CATEGORIAS];
  $("#chipsCategoria").innerHTML = cats.map(c => `
    <button class="chip ${state.filtroCategoria === c ? "active" : ""}" data-action="filtro-categoria" data-valor="${esc(c)}">
      ${c === "todas" ? "Todas as categorias" : esc(c)}
    </button>`).join("");

  const sits = [["todas", "Todas as situações"], ["ok", "Normal"], ["atencao", "Atenção"],
                ["critico", "Abaixo do mínimo"], ["zerado", "Sem estoque"]];
  $("#chipsSituacao").innerHTML = sits.map(([v, l]) => `
    <button class="chip ${state.filtroSituacao === v ? "active" : ""}" data-action="filtro-situacao" data-valor="${v}">
      ${esc(l)}
    </button>`).join("");
}

function renderTabelaItens() {
  const lista = filtrados();
  const corpo = $("#lista-corpo");
  $("#itensVazio").hidden = lista.length > 0;

  corpo.innerHTML = lista.map(i => {
    const s = situacao(i);
    return `
      <tr class="${["critico", "zerado"].includes(s.chave) ? "row-alert" : ""}">
        <td class="t-id">${esc(i.id)}</td>
        <td class="t-strong">${esc(i.titulo)}<span class="t-sub">${esc(i.codigo)} · ${esc(i.descricao)}</span></td>
        <td>${esc(i.categoria)}</td>
        <td>${esc(i.deposito)}</td>
        <td class="t-right">${brl(i.preco)}</td>
        <td class="t-right t-strong">${num(saldo(i))}</td>
        <td class="t-right">${num(i.estoque_minimo)}</td>
        <td><span class="badge ${s.classe}">${s.rotulo}</span></td>
        <td class="t-right">
          <div class="actions">
            <button class="btn-icon" data-action="ver-item" data-id="${esc(i.id)}">Ver</button>
            <button class="btn-icon" data-action="editar-item" data-id="${esc(i.id)}">Editar</button>
            <button class="btn-icon danger" data-action="excluir-item" data-id="${esc(i.id)}">Excluir</button>
          </div>
        </td>
      </tr>`;
  }).join("");
}

function renderMovimentacoes() {
  const corpo = $("#lista-mov");
  const lista = state.movimentacoes.slice(0, 40);
  $("#movVazio").hidden = lista.length > 0;
  corpo.innerHTML = lista.map(m => `
    <tr>
      <td>${esc(m.data)}</td>
      <td class="t-id">${esc(m.item_id)}</td>
      <td class="t-strong">${esc(m.titulo)}</td>
      <td><span class="badge ${m.tipo === "entrada" ? "input-t" : m.tipo === "saida" ? "output-t" : "ajuste-t"}">
        ${m.tipo === "entrada" ? "Entrada" : m.tipo === "saida" ? "Saída" : "Ajuste"}</span></td>
      <td class="t-right">${num(m.quantidade)}</td>
      <td class="t-right">${num(m.saldo_apos)}</td>
      <td>${esc(m.responsavel)}<span class="t-sub">${esc(m.protocolo)}</span></td>
      <td class="t-right">
        <div class="actions">
          <button class="btn-icon" data-action="ver-mov" data-id="${esc(m.id)}">Ver</button>
          <button class="btn-icon danger" data-action="estornar-mov" data-id="${esc(m.id)}">Estornar</button>
        </div>
      </td>
    </tr>`).join("");
}

function renderAlertas() {
  const lista = state.itens
    .filter(i => ["critico", "zerado"].includes(situacao(i).chave))
    .sort((a, b) => saldo(a) - saldo(b));
  const box = $("#listaAlertas");
  if (!lista.length) {
    box.innerHTML = `<p class="empty empty-grid">Nenhum item abaixo do mínimo. Todos os saldos estão consistentes.</p>`;
    return;
  }
  box.innerHTML = lista.map(i => {
    const falta = Math.max(0, (Number(i.estoque_minimo) || 0) - saldo(i));
    return `
      <article class="alert-item">
        <div class="alert-icon">!</div>
        <div class="alert-body">
          <h4>${esc(i.titulo)}</h4>
          <p>id ${esc(i.id)} · ${esc(i.deposito)} · saldo ${num(saldo(i))} de mínimo ${num(i.estoque_minimo)}</p>
        </div>
        <div class="alert-falta"><b>${num(falta)}</b>repor</div>
      </article>`;
  }).join("");
}

function renderSelects() {
  const selCat = $("#f-categoria");
  if (selCat.options.length !== CATEGORIAS.length) {
    selCat.innerHTML = CATEGORIAS.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
    $("#f-deposito").innerHTML = DEPOSITOS.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join("");
  }
  $("#m-item").innerHTML = state.itens
    .slice().sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"))
    .map(i => `<option value="${esc(i.id)}">${esc(i.titulo)} — saldo ${num(saldo(i))}</option>`).join("");
}

function renderRodapeModo() {
  const local = !CONFIG.usarWebService;
  $("#connDot").className = "dot" + (local ? "" : " off");
  $("#connText").textContent = local
    ? "Modo local — dados de demonstração no navegador"
    : "Modo Web Service — tentando falar com " + CONFIG.baseUrl;
  $("#footerMode").textContent = local ? "Modo: local (dados de demonstração)" : "Modo: Web Service REST/JSON";
}

function renderTudo() {
  renderKPIs();
  renderCards();
  renderChips();
  renderTabelaItens();
  renderMovimentacoes();
  renderAlertas();
  renderSelects();
  renderRodapeModo();
}

/* ------------------------------------------------------------
   11. INTERFACE: toasts, modal, formulários
------------------------------------------------------------ */
function toast(tipo, titulo, texto = "") {
  const box = $("#toasts");
  const el = document.createElement("div");
  el.className = `toast ${tipo}`;
  el.innerHTML = `<div><b>${esc(titulo)}</b>${texto ? `<p>${esc(texto)}</p>` : ""}</div>`;
  box.appendChild(el);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 240); }, 4600);
}

function abrirModal(html) { $("#modalBox").innerHTML = html; $("#modal").hidden = false; }
function fecharModal() { $("#modal").hidden = true; $("#modalBox").innerHTML = ""; }

function limparForm() {
  $("#form-item").reset();
  $("#f-id").value = "";
  $("#f-quantidade").value = "";
  $("#f-codigo").value = "";
  $("#btnSalvar").textContent = "Salvar item";
}

function preencherForm(id) {
  const i = buscarItem(id);
  if (!i) return;
  $("#f-id").value = i.id;
  $("#f-codigo").value = i.codigo;
  $("#f-titulo").value = i.titulo;
  $("#f-descricao").value = i.descricao;
  $("#f-categoria").value = i.categoria;
  $("#f-deposito").value = i.deposito;
  $("#f-preco").value = i.preco;
  $("#f-minimo").value = i.estoque_minimo;
  $("#f-quantidade").value = saldo(i);
  $("#btnSalvar").textContent = "Atualizar item";
  $("#itens").scrollIntoView({ behavior: "smooth", block: "start" });
  toast("info", "Edição carregada", `Documento ${id} pronto para alteração via PUT.`);
}

function verItem(id) {
  const i = buscarItem(id);
  if (!i) return;
  const payload = {
    id: i.id, titulo: i.titulo, descricao: i.descricao, preco: i.preco,
    quantidade: saldo(i), estoque_minimo: i.estoque_minimo, deposito: i.deposito,
  };
  const historico = state.movimentacoes.filter(m => m.item_id === id).slice(0, 5);
  abrirModal(`
    <h3>${esc(i.titulo)}</h3>
    <p class="sub">Documento persistido na coleção <code>${esc(CONFIG.colecaoApi)}</code>, indexado pelo campo id.</p>
    <div class="modal-json">${esc(JSON.stringify(payload, null, 2))}</div>
    <dl>
      <dt>Situação</dt><dd><span class="badge ${situacao(i).classe}">${situacao(i).rotulo}</span></dd>
      <dt>Categoria</dt><dd>${esc(i.categoria)}</dd>
      <dt>Depósito</dt><dd>${esc(i.deposito)}</dd>
      <dt>Valor imobilizado</dt><dd>${brl(saldo(i) * (Number(i.preco) || 0))}</dd>
      <dt>Movimentações</dt><dd>${num(state.movimentacoes.filter(m => m.item_id === id).length)} registradas</dd>
    </dl>
    ${historico.length ? `<p class="sub">Últimos lançamentos:</p>
      <div class="modal-json">${esc(historico.map(h => `${h.data} · ${h.tipo} · ${h.quantidade} · saldo ${h.saldo_apos}`).join("\n"))}</div>` : ""}
    <div class="row">
      <button class="btn btn-ghost" data-action="fechar-modal">Fechar</button>
      <button class="btn btn-primary" data-action="editar-item" data-id="${esc(id)}">Editar</button>
    </div>`);
}

function verMov(id) {
  const m = state.movimentacoes.find(x => x.id === id);
  if (!m) return;
  abrirModal(`
    <h3>Movimentação ${esc(m.tipo)}</h3>
    <p class="sub">Lançamento gravado na coleção livre <code>${esc(CONFIG.colecaoMov)}</code>, referenciando <code>${esc(m.item_id)}</code>.</p>
    <div class="modal-json">${esc(JSON.stringify({
      id: m.id, item_id: m.item_id, tipo: m.tipo, quantidade: m.quantidade,
      saldo_antes: m.saldo_antes, saldo_apos: m.saldo_apos,
      responsavel: m.responsavel, data: m.data,
    }, null, 2))}</div>
    <div class="row"><button class="btn btn-ghost" data-action="fechar-modal">Fechar</button></div>`);
}

async function estornarMov(id) {
  const m = state.movimentacoes.find(x => x.id === id);
  if (!m) return;
  const item = buscarItem(m.item_id);
  if (!item) { toast("err", "Item ausente", "O item desta movimentação não está mais na coleção."); return; }
  const inverso = m.tipo === "entrada" ? "saida" : "entrada";
  if (inverso === "saida") {
    const erro = validarSaida(item, m.quantidade);
    if (erro) { toast("err", "Estorno bloqueado", erro); return; }
  }
  registrarMovimentacao({
    item, tipo: inverso, quantidade: m.quantidade,
    responsavel: `Estorno de ${m.id}`, protocolo: m.protocolo,
  });
  LocalStore.gravar();
  renderTudo();
  toast("ok", "Movimentação estornada", `Lançamento inverso registrado para manter o histórico rastreável.`);
}

function rapida(id, tipo) {
  const item = buscarItem(id);
  if (!item) return;
  const texto = prompt(`${tipo === "entrada" ? "Entrada" : "Saída"} de quantas unidades para “${item.titulo}”? (saldo atual: ${saldo(item)})`, "1");
  if (texto === null) return;
  const quantidade = Number(texto);
  if (!quantidade || quantidade <= 0) { toast("err", "Quantidade inválida", "Informe um número inteiro maior que zero."); return; }
  if (tipo === "saida") {
    const erro = validarSaida(item, quantidade);
    if (erro) {
      log("POST", `/rest/${CONFIG.colecaoMov}`, `saída bloqueada: ${erro}`, "err");
      toast("err", "Saída bloqueada", erro);
      return;
    }
  }
  registrarMovimentacao({
    item, tipo, quantidade, responsavel: "Baixa rápida de balcão", protocolo: PROTOCOLOS.rest,
  });
  if (CONFIG.usarWebService) {
    Technoworks.inserirDocumento(CONFIG.colecaoMov, {
      id: gerarId("mov"), item_id: item.id, tipo, quantidade, saldo_apos: saldo(item),
    }).then(() => log("POST", `/rest/${CONFIG.colecaoMov}`, "movimentação persistida", "ok"))
      .catch(e => log("POST", `/rest/${CONFIG.colecaoMov}`, `falha: ${e.message}`, "err"));
  } else {
    log("POST", `/rest/${CONFIG.colecaoMov}`, "movimentação local persistida", "local");
  }
  LocalStore.gravar();
  renderTudo();
  toast("ok", "Movimentação registrada", `${tipo === "entrada" ? "Entrada" : "Saída"} de ${num(quantidade)} — saldo agora ${num(saldo(item))}.`);
}

async function testarConexao() {
  if (!CONFIG.usarWebService) {
    toast("info", "Modo local ativo", "Ligue o interruptor “Usar Web Service Technoworks” para chamar o endpoint real.");
    log("GET", `/${CONFIG.colecaoApi}`, "requisição simulada (modo local)", "local");
    return;
  }
  toast("info", "Testando conexão…", CONFIG.baseUrl);
  const r = await Technoworks.testarConexao();
  if (r.ok) {
    log("GET", `/${CONFIG.colecaoApi}`, `HTTP ${r.status} — Web Service respondeu`, "ok");
    toast("ok", "Conexão estabelecida", `HTTP ${r.status} em ${CONFIG.baseUrl}`);
  } else {
    log("GET", `/${CONFIG.colecaoApi}`, r.status ? `HTTP ${r.status}` : `sem resposta (${r.erro || "rede/CORS"})`, "err");
    toast("err", "Web Service indisponível",
      r.status ? `O endpoint respondeu HTTP ${r.status}.` : "Sem resposta — verifique o endereço, a rede ou a política de CORS do provedor.");
  }
}

/* ------------------------------------------------------------
   12. EVENTOS
------------------------------------------------------------ */
function ligarEventos() {
  // navbar
  window.addEventListener("scroll", () => $("#navbar").classList.toggle("scrolled", window.scrollY > 12));
  $("#burger").addEventListener("click", () => $("#navMobile").classList.toggle("open"));
  $$("#navMobile a").forEach(a => a.addEventListener("click", () => $("#navMobile").classList.remove("open")));

  // formulários
  $("#form-item").addEventListener("submit", (e) => { e.preventDefault(); salvarItem(e.target); });
  $("#form-mov").addEventListener("submit", (e) => { e.preventDefault(); registrarMov(e.target); });

  // filtros
  $("#buscaItens").addEventListener("input", (e) => { state.busca = e.target.value; renderTabelaItens(); });
  $("#buscaPainel").addEventListener("input", (e) => { state.buscaPainel = e.target.value; renderCards(); });
  $("#ordemItens").addEventListener("change", (e) => { state.ordem = e.target.value; renderTabelaItens(); });

  // conexão
  $("#modeToggle").addEventListener("change", (e) => {
    CONFIG.usarWebService = e.target.checked;
    renderRodapeModo();
    log("GET", `/${CONFIG.colecaoApi}`, CONFIG.usarWebService
      ? "camada de serviço apontada para o Web Service real"
      : "camada de serviço de volta ao modo local", "local");
    toast("info", CONFIG.usarWebService ? "Web Service ativado" : "Modo local ativado",
      CONFIG.usarWebService ? "As próximas operações tentam o endpoint REST real." : "As operações voltam a usar os dados de demonstração.");
  });
  $("#baseUrl").addEventListener("change", (e) => { CONFIG.baseUrl = e.target.value.trim() || CONFIG.baseUrl; });

  // abas da API
  $$("#tabsApi .tab").forEach(t => t.addEventListener("click", () => {
    $$("#tabsApi .tab").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    $$(".pane").forEach(p => p.classList.toggle("active", p.dataset.pane === t.dataset.tab));
  }));

  // modal
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") fecharModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharModal(); });

  // delegação de ações
  document.addEventListener("click", (e) => {
    const alvo = e.target.closest("[data-action]");
    if (!alvo) return;
    const acao = alvo.dataset.action, id = alvo.dataset.id, valor = alvo.dataset.valor;
    const mapa = {
      "ping": testarConexao,
      "novo-item": () => { limparForm(); $("#itens").scrollIntoView({ behavior: "smooth" }); },
      "limpar-form": limparForm,
      "toggle-mov": () => { const f = $("#form-mov"); f.hidden = !f.hidden; if (!f.hidden) f.scrollIntoView({ behavior: "smooth", block: "center" }); },
      "export-csv": exportarCSV,
      "limpar-log": () => { state.logs = []; renderLog(); },
      "fechar-modal": fecharModal,
      "confirmar-exclusao": () => confirmarExclusao(id),
      "editar-item": () => { fecharModal(); preencherForm(id); },
      "ver-item": () => verItem(id),
      "ver-mov": () => verMov(id),
      "estornar-mov": () => estornarMov(id),
      "excluir-item": () => excluirItem(id),
      "entrada-rapida": () => rapida(id, "entrada"),
      "saida-rapida": () => rapida(id, "saida"),
      "copiar-codigo": () => {
        navigator.clipboard.writeText($("#codeBox").innerText)
          .then(() => toast("ok", "Código copiado", "O trecho REST/JSON está na área de transferência."))
          .catch(() => toast("err", "Não foi possível copiar", "Selecione o texto manualmente."));
      },
    };
    if (acao === "filtro-categoria") { state.filtroCategoria = valor; renderChips(); renderTabelaItens(); return; }
    if (acao === "filtro-situacao")  { state.filtroSituacao = valor; renderChips(); renderTabelaItens(); return; }
    if (mapa[acao]) mapa[acao]();
  });
}

/* ------------------------------------------------------------
   13. INICIALIZAÇÃO
------------------------------------------------------------ */
function iniciar() {
  const salvo = LocalStore.ler();
  if (salvo && Array.isArray(salvo.itens) && salvo.itens.length) {
    state.itens = salvo.itens;
    state.movimentacoes = salvo.movimentacoes || [];
  } else {
    state.itens = dadosSemente();
    state.movimentacoes = [];
    LocalStore.gravar();
  }
  $("#baseUrl").value = CONFIG.baseUrl;
  ligarEventos();
  renderTudo();
  renderLog();
  log("GET", `/${CONFIG.colecaoApi}`, `camada de serviço pronta · ${state.itens.length} documentos carregados`, "local");
}

document.addEventListener("DOMContentLoaded", iniciar);
