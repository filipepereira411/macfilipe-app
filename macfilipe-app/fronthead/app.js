const API_BASE = 'http://localhost:3000/api';
const WS_BASE = 'ws://localhost:3000';

let estado = {
    view: 'kiosk',
    categoriaAtiva: 'todos',
    produtos: [],
    pedidos: [],
    carrinho: {}, // id_produto: quantidade
    metodoPagamento: 'cartao',
    tema: localStorage.getItem('theme') || 'light'
};

let ws;

// --- INICIALIZAÇÃO E LIGAÇÃO REALTIME ---
async function inicializar() {
    aplicarTema(estado.tema);
    renderizarHeaderAcc();
    await carregarDadosIniciais();
    configurarWebsocket();
    go(estado.view);
}

async function carregarDadosIniciais() {
    try {
        const [resProd, resPed] = await Promise.all([
            fetch(`${API_BASE}/produtos`),
            fetch(`${API_BASE}/pedidos`)
        ]);
        estado.produtos = await resProd.json();
        estado.pedidos = await resPed.json();
    } catch (err) {
        console.error("Erro ao carregar dados do servidor:", err);
    }
}

function configurarWebsocket() {
    ws = new WebSocket(WS_BASE);
    ws.onmessage = (evento) => {
        const msg = JSON.parse(evento.data);
        if (msg.tipo === 'NOVO_PEDIDO') {
            estado.pedidos.push(msg.dados);
            mostrarToast(`Novo Pedido #${msg.dados.id} recebido!`);
        } else if (msg.tipo === 'PEDIDO_ATUALIZADO') {
            estado.pedidos = msg.dados;
        } else if (msg.tipo === 'STOCK_ALTERADO') {
            estado.produtos = msg.dados;
        }
        reRenderizarFicheiroAtual();
    };
    ws.onclose = () => setTimeout(configurarWebsocket, 3000); // Recomenda automático se cair
}

// --- ROTEAMENTO E NAVEGAÇÃO ---
function go(ecrã) {
    estado.view = ecrã;
    
    // Atualizar Barra de Navegação de forma acessível
    document.querySelectorAll('nav button').forEach(btn => {
        btn.setAttribute('aria-selected', btn.id === `t-${ecrã}` ? 'true' : 'false');
    });

    // Ocultar carrinho por padrão, só aparece no quiosque se houver itens
    atualizarCarrinhoDOM();

    const app = document.getElementById('app');
    if (ecrã === 'kiosk') renderizarQuiosque(app);
    else if (ecrã === 'cozinha') renderizarCozinha(app);
    else if (ecrã === 'balcao') renderizarBalcao(app);
    else if (ecrã === 'conta') renderizarConta(app);
    else if (ecrã === 'admin') renderizarAdmin(app);
}

function reRenderizarFicheiroAtual() {
    go(estado.view);
}

// --- COMPONENTE: QUIOSQUE ---
function renderizarQuiosque(container) {
    const categorias = ['todos', 'burgers', 'acompanhamentos', 'bebidas', 'sobremesas'];
    
    let htmlCats = `<div class="cats">`;
    categorias.forEach(cat => {
        const ativo = estado.categoriaAtiva === cat;
        htmlCats += `<button class="cat" aria-pressed="${ativo}" onclick="filtrarCategoria('${cat}')">${cat.toUpperCase()}</button>`;
    });
    htmlCats += `</div>`;

    let htmlGrid = `<div class="grid">`;
    const produtosFiltrados = estado.produtos.filter(p => estado.categoriaAtiva === 'todos' || p.categoria === estado.categoriaAtiva);
    
    if (produtosFiltrados.length === 0) {
        htmlGrid += `<div class="empty">Nenhum produto disponível nesta secção.</div>`;
    } else {
        produtosFiltrados.forEach(p => {
            const classOut = !p.emStock ? 'out' : '';
            htmlGrid += `
                <div class="item ${classOut}">
                    <div class="e">${p.emoji}</div>
                    <h3>${p.nome}</h3>
                    <p>${p.desc}</p>
                    <div class="pr">${p.preco.toFixed(2)}€</div>
                    <button class="btn" ${!p.emStock ? 'disabled' : ''} onclick="adicionarAoCarrinho('${p.id}')">
                        ${p.emStock ? 'Adicionar' : 'Esgotado'}
                    </button>
                </div>
            `;
        });
    }
    htmlGrid += `</div>`;
    container.innerHTML = htmlCats + htmlGrid;
}

function filtrarCategoria(cat) {
    estado.categoriaAtiva = cat;
    reRenderizarFicheiroAtual();
}

function adicionarAoCarrinho(id) {
    estado.carrinho[id] = (estado.carrinho[id] || 0) + 1;
    atualizarCarrinhoDOM();
}

function alterarQtdCarrinho(id, delta) {
    estado.carrinho[id] += delta;
    if (estado.carrinho[id] <= 0) delete estado.carrinho[id];
    atualizarCarrinhoDOM();
}

function calcularTotalCarrinho() {
    return Object.keys(estado.carrinho).reduce((acc, id) => {
        const p = estado.produtos.find(prod => prod.id === id);
        return acc + (p ? p.preco * estado.carrinho[id] : 0);
    }, 0);
}

function atualizarCarrinhoDOM() {
    const elCarrinho = document.getElementById('cart');
    const totalItens = Object.values(estado.carrinho).reduce((a, b) => a + b, 0);

    if (estado.view !== 'kiosk' || totalItens === 0) {
        elCarrinho.style.display = 'none';
        return;
    }

    let chipsHtml = '';
    Object.keys(estado.carrinho).forEach(id => {
        const p = estado.produtos.find(prod => prod.id === id);
        chipsHtml += `
            <div class="chip">
                ${p.emoji} x${estado.carrinho[id]}
                <button onclick="alterarQtdCarrinho('${id}', -1)">-</button>
            </div>
        `;
    });

    elCarrinho.style.display = 'block';
    elCarrinho.innerHTML = `
        <div class="cart-in">
            <div class="lines">${chipsHtml}</div>
            <div class="tot">Total: ${calcularTotalCarrinho().toFixed(2)}€</div>
            <button class="btn ok" onclick="abrirModalPagamento()">Finalizar</button>
        </div>
    `;
}

// --- MODAL DE PAGAMENTO ---
function abrirModalPagamento() {
    const modal = document.getElementById('pay');
    modal.classList.add('on');
    renderizarConteudoModal();
}

function fecharModal() {
    document.getElementById('pay').classList.remove('on');
}

function alterarMetodoPagamento(metodo) {
    estado.metodoPagamento = metodo;
    renderizarConteudoModal();
}

function renderizarConteudoModal() {
    const modal = document.getElementById('pay');
    const isDinheiro = estado.metodoPagamento === 'dinheiro';
    
    modal.innerHTML = `
        <div class="modal" role="dialog" aria-label="Pagamento">
            <h2>Pagamento</h2>
            <p>Selecione o método para o total de <b>${calcularTotalCarrinho().toFixed(2)}€</b></p>
            <div class="pays">
                <button class="pay" aria-pressed="${estado.metodoPagamento === 'cartao'}" onclick="alterarMetodoPagamento('cartao')"><span>💳</span>Cartão</button>
                <button class="pay" aria-pressed="${estado.metodoPagamento === 'dinheiro'}" onclick="alterarMetodoPagamento('dinheiro')"><span>💵</span>Dinheiro</button>
            </div>
            <div class="flow ${isDinheiro ? 'on' : ''}">
                <input type="number" id="quantiaDinheiro" placeholder="Quantia entregue (€)" oninput="calcularTroco()">
                <div class="stat" id="resultadoTroco">Insira o valor para calcular o troco.</div>
            </div>
            <div style="display:flex; gap:10px; margin-top:15px;">
                <button class="btn ghost" style="flex:1" onclick="fecharModal()">Cancelar</button>
                <button class="btn ok" style="flex:1" onclick="submeterPedido()">Confirmar</button>
            </div>
        </div>
    `;
}

function calcularTroco() {
    const total = calcularTotalCarrinho();
    const entregue = parseFloat(document.getElementById('quantiaDinheiro').value) || 0;
    const div = document.getElementById('resultadoTroco');
    if (entregue < total) {
        div.style.color = 'var(--red)';
        div.textContent = `Faltam ${(total - entregue).toFixed(2)}€`;
    } else {
        div.style.color = 'var(--ok)';
        div.textContent = `Troco a devolver: ${(entregue - total).toFixed(2)}€`;
    }
}

async function submeterPedido() {
    const itensPedido = Object.keys(estado.carrinho).map(id => {
        const prod = estado.produtos.find(p => p.id === id);
        return { nome: prod.nome, qtd: estado.carrinho[id] };
    });

    try {
        const res = await fetch(`${API_BASE}/pedidos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                itens: itensPedido,
                total: calcularTotalCarrinho(),
                pagamento: estado.metodoPagamento
            })
        });

        if (res.ok) {
            const pedidoCriado = await res.json();
            estado.carrinho = {};
            fecharModal();
            atualizarCarrinhoDOM();
            mostrarToast(`Pedido #${pedidoCriado.id} enviado à Cozinha!`);
            go('kiosk');
        }
    } catch (err) {
        alert("Erro de rede ao enviar pedido.");
    }
}

// --- COMPONENTE: COZINHA ---
function renderizarCozinha(container) {
    const emPreparacao = estado.pedidos.filter(p => p.estado === 'preparacao');
    
    let html = `<h2>Pedidos em Preparação 🍳</h2>`;
    if (emPreparacao.length === 0) {
        html += `<div class="empty">Sem pedidos pendentes de confeção de momento.</div>`;
        container.innerHTML = html;
        return;
    }

    html += `<div class="kgrid">`;
    emPreparacao.forEach(p => {
        const tempoMinutos = Math.floor((Date.now() - p.criadoEm) / 60000);
        const classAtraso = tempoMinutos >= 10 ? 'late' : '';
        
        let listaItens = '';
        p.itens.forEach(i => {
            listaItens += `<li><b>${i.qtd}x</b> ${i.nome}</li>`;
        });

        html += `
            <div class="tk ${classAtraso}">
                <div class="tk-h">
                    <b>#${p.id}</b>
                    <span>${p.hora} (${tempoMinutos}m atrás)</span>
                </div>
                <ul>${listaItens}</ul>
                <button class="btn ok" onclick="avancarPedido(${p.id})">Concluído</button>
            </div>
        `;
    });
    html += `</div>`;
    container.innerHTML = html;
}

async function avancarPedido(id) {
    try {
        const res = await fetch(`${API_BASE}/pedidos/avancar`, {
            method: 'POST',
