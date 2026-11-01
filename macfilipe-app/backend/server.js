import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Base de dados em memória inicial (Sincronizada em tempo real)
let produtos = [
  { id: 'b1', nome: 'MacClássico', desc: 'Hambúrguer de vaca gorda, queijo, molho da casa', preco: 6.90, categoria: 'burgers', emoji: '🍔', emStock: true },
  { id: 'b2', nome: 'Filipe Duplo', desc: 'Dois hambúrgueres, bacon crocante, queijo cheddar', preco: 8.50, categoria: 'burgers', emoji: '👑', emStock: true },
  { id: 'p1', nome: 'Batata Frita', desc: 'Batatas rústicas cortadas à mão com sal marinho', preco: 2.50, categoria: 'acompanhamentos', emoji: '🍟', emStock: true },
  { id: 'p2', nome: 'Nuggets x6', desc: 'Pedacinhos de frango estaladiços com molho BBQ', preco: 3.80, categoria: 'acompanhamentos', emoji: '🍗', emStock: true },
  { id: 'd1', nome: 'Cola Zero 33cl', desc: 'Bebida refrescante sem açúcar', preco: 1.80, categoria: 'bebidas', emoji: '🥤', emStock: true },
  { id: 'd2', nome: 'Cerveja Artesanal', desc: 'Produção local, sabor encorpado e fresco', preco: 2.80, categoria: 'bebidas', emoji: '🍺', emStock: true },
  { id: 's1', nome: 'Sundae Caramelo', desc: 'Gelado cremoso com calda quente de caramelo', preco: 3.00, categoria: 'sobremesas', emoji: '🍦', emStock: true }
];

let pedidos = [];
let contadorPedidos = 100;

// Envia atualizações a todos os clientes ligados via WebSocket
function transmitirAtualizacao(tipo, dados) {
  const mensagem = JSON.stringify({ tipo, dados });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(mensagem);
    }
  });
}

// --- ENDPOINTS REST ---
app.get('/api/produtos', (req, res) => res.json(produtos));
app.get('/api/pedidos', (req, res) => res.json(pedidos));

app.post('/api/produtos/toggle-stock', (req, res) => {
  const { id } = req.body;
  const produto = produtos.find(p => p.id === id);
  if (produto) {
    produto.emStock = !produto.emStock;
    transmitirAtualizacao('STOCK_ALTERADO', produtos);
    return res.json({ sucesso: true, produtos });
  }
  res.status(404).json({ erro: 'Produto não encontrado' });
});

app.post('/api/pedidos', (req, res) => {
  const { itens, total, pagamento } = req.body;
  if (!itens || itens.length === 0) return res.status(400).json({ erro: 'Pedido vazio' });

  contadorPedidos++;
  const novoPedido = {
    id: contadorPedidos,
    itens,
    total,
    pagamento,
    estado: 'preparacao', // preparacao | pronto | entregue
    hora: new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
    criadoEm: Date.now()
  };

  pedidos.push(novoPedido);
  transmitirAtualizacao('NOVO_PEDIDO', novoPedido);
  res.status(201).json(novoPedido);
});

app.post('/api/pedidos/avancar', (req, res) => {
  const { id } = req.body;
  const pedido = pedidos.find(p => p.id === parseInt(id));
  if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });

  if (pedido.estado === 'preparacao') {
    pedido.estado = 'pronto';
  } else if (pedido.estado === 'pronto') {
    pedido.estado = 'entregue';
  }

  transmitirAtualizacao('PEDIDO_ATUALIZADO', pedidos);
  res.json({ sucesso: true, pedidos });
});

// Inicialização
server.listen(PORT, () => {
  console.log(`🚀 MacFilipe Backend a correr em http://localhost:${PORT}`);
});
