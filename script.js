// ============================================================================
// BORDAVEIRO - JAVASCRIPT PRINCIPAL
// ============================================================================

// --- VARIÁVEIS GLOBAIS ---
// Em desenvolvimento (Live Server, 127.0.0.1, ficheiro aberto diretamente) a API corre à parte na porta 3000
const ehLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname) || window.location.protocol === 'file:';
const URL_API = ehLocal && window.location.port !== '3000' ? 'http://localhost:3000' : '';
// fetch com o token da sessão; se a sessão expirou, volta ao ecrã de login
async function api(url, opcoes = {}) {
    const token = localStorage.getItem('token_bordaveiro');
    const resposta = await fetch(url, {
        ...opcoes,
        headers: { ...(opcoes.headers || {}), Authorization: `Bearer ${token}` }
    });
    if (resposta.status === 401) {
        // Vários pedidos podem falhar ao mesmo tempo: avisa só uma vez
        if (!api.sessaoTerminada) {
            api.sessaoTerminada = true;
            localStorage.clear();
            alert('A sua sessão expirou. Inicie sessão novamente.');
            location.reload();
        }
        throw new Error('Sessão expirada');
    }
    return resposta;
}

// Estado dos pedidos enviados pelos clientes no portal, antes de a equipa os confirmar
const ESTADO_PORTAL = 'Pedido Cliente';
// Pedidos do portal cancelados pelo cliente (aparecem na aba Portal e não contam nas estatísticas)
const ESTADO_CANCELADO = 'Cancelado';

let abaAtual = 'pendentes';
let pedidosGlobais = [];
let estoqueGlobais = [];
let clientesGlobais = [];

window.onload = () => {
    adicionarItemPedido();
    if (localStorage.getItem('token_bordaveiro')) {
        mostrarDashboard();
    }
};

// Impede que texto introduzido pelos utilizadores seja interpretado como HTML
function escapar(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

// Telefone apenas com dígitos (para ligações WhatsApp)
function limparTelefone(tel) {
    return String(tel ?? '').replace(/\D/g, '');
}

function ligacaoWhatsApp(telefone, texto) {
    let tel = limparTelefone(telefone);
    if (tel.length === 9) tel = '351' + tel;
    return `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`;
}

// ============================================================================
// 1. AUTENTICAÇÃO E NAVEGAÇÃO
// ============================================================================

async function fazerLogin() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const msgErro = document.getElementById('msg-erro');

    msgErro.style.display = 'none';

    if (!email || !password) {
        msgErro.innerText = 'Introduza o email e a palavra-passe.';
        msgErro.style.display = 'block';
        return;
    }

    try {
        const resposta = await fetch(`${URL_API}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, senha: password })
        });

        const dados = await resposta.json();

        if (resposta.ok && dados.perfil === 'cliente') {
            msgErro.innerHTML = 'Esta conta é de cliente. Entre pelo <a href="portal.html">Portal do Cliente</a>.';
            msgErro.style.display = 'block';
        } else if (resposta.ok) {
            localStorage.setItem('token_bordaveiro', dados.token);
            localStorage.setItem('perfil_bordaveiro', dados.perfil);
            localStorage.setItem('nome_bordaveiro', dados.nome || '');
            mostrarDashboard();
        } else {
            msgErro.innerText = dados.erro || 'Não foi possível iniciar sessão.';
            msgErro.style.display = 'block';
        }
    } catch (e) {
        console.error('Erro no login:', e);
        msgErro.innerText = 'Não foi possível contactar o servidor. Tente novamente mais tarde.';
        msgErro.style.display = 'block';
    }
}

function mostrarDashboard() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('dashboard-screen').style.display = 'block';

    const perfil = localStorage.getItem('perfil_bordaveiro');
    const ehAdmin = perfil === 'admin';
    document.getElementById('nav-admin').style.display = ehAdmin ? 'inline-block' : 'none';
    document.getElementById('nav-estatisticas').style.display = ehAdmin ? 'inline-block' : 'none';
    // Mostra no menu se há clientes à espera de autorização para nova palavra-passe
    if (ehAdmin) carregarRecuperacoes();

    mudarPagina('pedidos');
    carregarClientes();
}

function terminarSessao() {
    localStorage.clear();
    location.reload();
}

function recuperarSenha() {
    const tel = "351915831169";
    const texto = "Olá. Preciso de recuperar o acesso ao sistema Bordaveiro. Podem ajudar-me?";
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(texto)}`, '_blank');
}

function mudarPagina(pagina) {
    ['pedidos', 'estoque', 'estatisticas', 'admin', 'feedback'].forEach(p => {
        document.getElementById(`pagina-${p}`).style.display = 'none';
        document.getElementById(`nav-${p}`).className = 'btn-nav btn-nav-inactive';
    });

    const ehAdmin = localStorage.getItem('perfil_bordaveiro') === 'admin';
    // Funcionários só veem o chat, que fica sozinho e centrado
    const soChat = pagina === 'feedback' && !ehAdmin;
    const displayMode = (pagina === 'estatisticas' || soChat) ? 'block' : 'grid';
    const elPagina = document.getElementById(`pagina-${pagina}`);
    elPagina.style.display = displayMode;
    elPagina.style.maxWidth = soChat ? '650px' : '';
    elPagina.style.margin = soChat ? '20px auto 0' : '';
    document.getElementById(`nav-${pagina}`).className = 'btn-nav btn-nav-active';

    if (pagina === 'pedidos') carregarPedidos();
    if (pagina === 'estoque') carregarEstoque();
    if (pagina === 'estatisticas') carregarPedidos().then(calcularEstatisticasGlobais);
    if (pagina === 'admin') { carregarUtilizadores(); carregarRecuperacoes(); }
    if (pagina === 'feedback') {
        document.getElementById('coluna-feedback-admin').style.display = ehAdmin ? 'block' : 'none';
        if (!document.getElementById('chat-mensagens').children.length) iniciarChat();
        if (ehAdmin) carregarFeedback();
    }
}

// ============================================================================
// 2. GESTÃO DE UTILIZADORES (ADMIN)
// ============================================================================

async function carregarUtilizadores() {
    // Lista de clientes para as contas do portal
    document.getElementById('novo-user-cliente').innerHTML = '<option value="">Escolha o cliente...</option>' +
        [...clientesGlobais].sort((a, b) => a.nome.localeCompare(b.nome))
            .map(c => `<option value="${c.id}">${escapar(c.nome)}</option>`).join('');
    try {
        const resposta = await api(`${URL_API}/utilizadores`);
        const users = await resposta.json();
        const div = document.getElementById('lista-utilizadores');
        div.innerHTML = '';

        if (users.length === 0) {
            div.innerHTML = '<p style="text-align: center; color: #888;">Nenhum utilizador encontrado.</p>';
            return;
        }

        users.forEach(u => {
            const cor = u.perfil === 'admin' ? '#3e1f16' : u.perfil === 'cliente' ? '#2980b9' : '#8C5E3C';
            div.innerHTML += `
        <div style="background: white; padding: 12px; border-left: 4px solid ${cor}; margin-bottom: 10px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <div>
            <strong style="color: #4A2511;">${escapar(u.nome)}</strong>
            <span style="font-size: 11px; background: #eee; padding: 2px 6px; border-radius: 4px; margin-left: 5px;">${escapar(u.perfil).toUpperCase()}</span>
            <br><small style="color: #666;">${escapar(u.email)}${u.perfil === 'cliente' && u.clientes ? ` · cliente: ${escapar(u.clientes.nome)}` : ''}</small>
          </div>
          <div style="display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end;">
            ${u.perfil === 'cliente' ? `<button onclick="alterarFeedbackCliente(${u.id}, ${u.feedback_ativo === false})" class="btn-small" style="background: ${u.feedback_ativo === false ? '#2980b9' : '#7f8c8d'};" title="Aba Sugestões no portal">${u.feedback_ativo === false ? 'Ativar sugestões' : 'Desativar sugestões'}</button>` : ''}
            ${u.email !== 'admin@bordaveiro.pt' ? `<button onclick="apagarUtilizador(${u.id})" class="btn-small" style="background: #e74c3c;">Eliminar</button>` : ''}
          </div>
        </div>`;
        });
    } catch (e) {
        console.error('Erro ao carregar utilizadores', e);
    }
}

async function criarUtilizador() {
    const nome = document.getElementById('novo-user-nome').value;
    const email = document.getElementById('novo-user-email').value;
    const senha = document.getElementById('novo-user-senha').value;
    const perfil = document.getElementById('novo-user-perfil').value;
    const cliente_id = perfil === 'cliente' ? document.getElementById('novo-user-cliente').value : null;
    const msg = document.getElementById('msg-novo-user');

    if (!nome || !email || !senha) {
        msg.style.color = 'red'; msg.innerText = 'Preencha todos os campos.'; return;
    }
    if (perfil === 'cliente' && !cliente_id) {
        msg.style.color = 'red'; msg.innerText = 'Escolha o cliente desta conta.'; return;
    }

    try {
        msg.style.color = '#8C5E3C'; msg.innerText = 'A criar conta...';
        const resposta = await api(`${URL_API}/utilizadores`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, email, senha, perfil, cliente_id })
        });

        if (!resposta.ok) {
            const erroServidor = await resposta.json();
            throw new Error(erroServidor.erro || 'Erro desconhecido.');
        }

        msg.style.color = 'green'; msg.innerText = 'Conta criada com sucesso.';
        document.getElementById('novo-user-nome').value = '';
        document.getElementById('novo-user-email').value = '';
        document.getElementById('novo-user-senha').value = '';
        carregarUtilizadores();
        setTimeout(() => msg.innerText = '', 4000);
    } catch (e) {
        msg.style.color = 'red'; msg.innerText = `Erro: ${e.message}`;
    }
}

// --- Pedidos de nova palavra-passe do portal (o admin autoriza ou recusa) ---
async function carregarRecuperacoes() {
    let pedidos = [];
    try {
        const res = await api(`${URL_API}/recuperacoes`);
        if (res.ok) pedidos = await res.json();
    } catch (e) {
        return;
    }

    const nav = document.getElementById('nav-admin');
    nav.innerText = pedidos.length ? `Administração (${pedidos.length})` : 'Administração';
    document.getElementById('card-recuperacoes').style.display = pedidos.length ? 'block' : 'none';
    document.getElementById('lista-recuperacoes').innerHTML = pedidos.map(r => {
        const u = r.utilizadores || {};
        const data = new Date(r.criado_em).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' });
        return `
      <div style="background: white; padding: 12px; border-left: 4px solid #E5A83B; margin-bottom: 10px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <div>
          <strong style="color: #4A2511;">${escapar(u.nome)}</strong>${u.clientes ? ` <small>(${escapar(u.clientes.nome)})</small>` : ''}
          <br><small style="color: #666;">${escapar(u.email)} · pedido a ${data}</small>
        </div>
        <div style="display: flex; gap: 6px;">
          <button class="btn-small" style="background: #27ae60;" onclick="decidirRecuperacao(${r.id}, 'autorizar')">Autorizar</button>
          <button class="btn-small" style="background: #e74c3c;" onclick="decidirRecuperacao(${r.id}, 'recusar')">Recusar</button>
        </div>
      </div>`;
    }).join('');
}

async function decidirRecuperacao(id, decisao) {
    const pergunta = decisao === 'autorizar'
        ? 'Autorizar este cliente a escolher uma nova palavra-passe? Confirme antes que foi ele que fez o pedido.'
        : 'Recusar este pedido de nova palavra-passe?';
    if (!confirm(pergunta)) return;
    const res = await api(`${URL_API}/recuperacoes/${id}/${decisao}`, { method: 'POST' });
    if (!res.ok) alert((await res.json()).erro || 'Não foi possível atualizar o pedido.');
    carregarRecuperacoes();
}

async function apagarUtilizador(id) {
    if (!confirm('Confirma a eliminação desta conta? Esta ação não pode ser revertida.')) return;
    await api(`${URL_API}/utilizadores/${id}`, { method: 'DELETE' });
    carregarUtilizadores();
}

// ============================================================================
// 3. CLIENTES E ANIVERSÁRIOS
// ============================================================================

async function carregarClientes() {
    const resposta = await api(`${URL_API}/clientes`);
    clientesGlobais = await resposta.json();
    verificarAniversarios();
}

function verificarAniversarios() {
    const painel = document.getElementById('painel-aniversarios');
    const botoes = document.getElementById('botoes-aniversarios');
    botoes.innerHTML = '';
    painel.style.display = 'none';

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    let total = 0;

    clientesGlobais.forEach(cliente => {
        if (!cliente.aniversario) return;

        const partes = cliente.aniversario.split('-');
        const dataAniversario = new Date(hoje.getFullYear(), partes[1] - 1, partes[2]);
        const diferencaDias = Math.round((dataAniversario - hoje) / (1000 * 60 * 60 * 24));

        if (diferencaDias >= 0 && diferencaDias <= 2) {
            total++;
            painel.style.display = 'flex';
            const primeiroNome = cliente.nome.split(' ')[0];
            const texto = `Olá, ${primeiroNome}. A equipa da Bordaveiro deseja-lhe um feliz aniversário e agradece a sua confiança.`;
            const botao = document.createElement('button');
            botao.className = 'btn-small';
            botao.style.cssText = 'background:#25D366;';
            botao.innerText = primeiroNome;
            botao.onclick = () => window.open(ligacaoWhatsApp(cliente.telefone, texto), '_blank');
            botoes.appendChild(botao);
        }
    });

    if (total > 0) {
        document.getElementById('texto-aniversarios').innerText =
            `${total} cliente(s) com aniversário nos próximos dias. Envie uma mensagem de parabéns.`;
    }
}

function mostrarDropdownClientes() {
    renderizarDropdownClientes(clientesGlobais);
    document.getElementById('dropdown-clientes-lista').style.display = 'block';
}

function filtrarDropdownClientes() {
    const termo = document.getElementById('pesquisa-cliente-input').value.toLowerCase();
    const filtrados = clientesGlobais.filter(c =>
        c.nome.toLowerCase().includes(termo) ||
        (c.telefone && c.telefone.includes(termo)) ||
        (c.nif && c.nif.includes(termo))
    );
    renderizarDropdownClientes(filtrados);
    document.getElementById('dropdown-clientes-lista').style.display = 'block';
}

function renderizarDropdownClientes(lista) {
    const dropdown = document.getElementById('dropdown-clientes-lista');
    dropdown.innerHTML = '';
    if (lista.length === 0) {
        dropdown.innerHTML = '<div class="dropdown-item"><span class="dropdown-item-info">Nenhum cliente encontrado.</span></div>';
        return;
    }
    lista.forEach(c => {
        dropdown.innerHTML += `<div class="dropdown-item" onclick="selecionarClienteDropdown(${c.id})"><span class="dropdown-item-nome">${escapar(c.nome)}</span><span class="dropdown-item-info">${escapar(c.telefone || 'Sem telefone')}</span></div>`;
    });
}

function selecionarClienteDropdown(id) {
    const cliente = clientesGlobais.find(c => c.id === id);
    if (!cliente) return;
    document.getElementById('novo-cliente-id').value = cliente.id;
    document.getElementById('pesquisa-cliente-input').value = cliente.nome;
    document.getElementById('dropdown-clientes-lista').style.display = 'none';
}

// Fecha a lista de clientes ao clicar fora
document.addEventListener('click', e => {
    const caixa = document.querySelector('.dropdown-pesquisa');
    if (caixa && !caixa.contains(e.target)) {
        document.getElementById('dropdown-clientes-lista').style.display = 'none';
    }
});

function abrirModalCliente() { document.getElementById('modal-cliente').style.display = 'flex'; }
function fecharModalCliente() { document.getElementById('modal-cliente').style.display = 'none'; }

async function criarCliente() {
    const nome = document.getElementById('novo-nome-cliente').value;
    const email = document.getElementById('novo-email-cliente').value;
    const telefone = document.getElementById('novo-telefone-cliente').value;
    const nif = document.getElementById('novo-nif-cliente').value;
    const aniversario = document.getElementById('novo-aniversario-cliente').value || null;
    const msg = document.getElementById('msg-novo-cliente');

    if (!nome) { msg.style.color = 'red'; msg.innerText = 'O nome é obrigatório.'; return; }

    try {
        const res = await api(`${URL_API}/clientes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, email, telefone, nif, aniversario })
        });
        if (!res.ok) throw new Error('Falha ao guardar.');

        await carregarClientes();
        const criado = clientesGlobais.filter(c => c.nome === nome).pop();
        if (criado) selecionarClienteDropdown(criado.id);

        ['novo-nome-cliente', 'novo-email-cliente', 'novo-telefone-cliente', 'novo-nif-cliente', 'novo-aniversario-cliente']
            .forEach(id => document.getElementById(id).value = '');
        msg.innerText = '';
        fecharModalCliente();
    } catch (e) {
        msg.style.color = 'red'; msg.innerText = 'Não foi possível guardar o cliente. Tente novamente.';
    }
}

// ============================================================================
// 4. PEDIDOS
// ============================================================================

function verificarOrigemArtigo() {
    const origem = document.getElementById('nova-origem').value;
    document.getElementById('grupo-bordaveiro').style.display = origem === 'Bordaveiro' ? 'block' : 'none';
}

function verificarTipoArtigo() {
    const tipo = document.getElementById('novo-tipo-artigo').value;
    document.getElementById('grupo-bebe').style.display = tipo === 'Bebé' ? 'block' : 'none';
}

function verificarPagamento() {
    const pag = document.getElementById('novo-pagamento').value;
    document.getElementById('grupo-valor-pago').style.display = pag === 'Parcial' ? 'block' : 'none';
}

function mudarAba(aba) {
    abaAtual = aba;
    ['pendentes', 'concluidos', 'orcamentos', 'portal'].forEach(a => {
        document.getElementById(`tab-${a}`).className = a === aba ? 'tab-btn tab-active' : 'tab-btn tab-inactive';
    });
    renderizarPedidos();
}

async function carregarPedidos() {
    const resposta = await api(`${URL_API}/pedidos`);
    pedidosGlobais = await resposta.json();
    renderizarPedidos();
}

function renderizarPedidos() {
    const painel = document.getElementById('lista-pedidos');
    painel.innerHTML = '';

    const totalOrcamentos = pedidosGlobais.filter(p => p.status === 'Orçamento').length;
    document.getElementById('tab-orcamentos').innerText = totalOrcamentos > 0 ? `Orçamentos (${totalOrcamentos})` : 'Orçamentos';
    const totalPortal = pedidosGlobais.filter(p => [ESTADO_PORTAL, ESTADO_CANCELADO].includes(p.status)).length;
    document.getElementById('tab-portal').innerText = totalPortal > 0 ? `Portal (${totalPortal})` : 'Portal';

    const textoPesquisa = document.getElementById('pesquisa-pedidos').value.toLowerCase();
    const dataDe = document.getElementById('filtro-data-de').value;
    const dataAte = document.getElementById('filtro-data-ate').value;

    const filtrados = pedidosGlobais.filter(p => {
        let naAba;
        if (abaAtual === 'orcamentos') naAba = p.status === 'Orçamento';
        else if (abaAtual === 'portal') naAba = [ESTADO_PORTAL, ESTADO_CANCELADO].includes(p.status);
        else if (abaAtual === 'concluidos') naAba = p.status === 'Concluído';
        else naAba = !['Concluído', 'Orçamento', ESTADO_PORTAL, ESTADO_CANCELADO].includes(p.status);
        const desc = p.descricao ? p.descricao.toLowerCase() : '';
        const nomeCli = p.clientes && p.clientes.nome ? p.clientes.nome.toLowerCase() : '';
        const bateTexto = desc.includes(textoPesquisa) || nomeCli.includes(textoPesquisa);

        let bateData = true;
        if (dataDe || dataAte) {
            if (!p.data_entrega) {
                bateData = false;
            } else {
                if (dataDe && p.data_entrega < dataDe) bateData = false;
                if (dataAte && p.data_entrega > dataAte) bateData = false;
            }
        }
        return naAba && bateTexto && bateData;
    });

    if (filtrados.length === 0) {
        painel.innerHTML = '<p style="text-align: center; color: #888;">Nenhum pedido encontrado.</p>';
        return;
    }

    filtrados.forEach(p => {
        const ehOrcamento = p.status === 'Orçamento';
        const doPortal = p.status === ESTADO_PORTAL;
        const cancelado = p.status === ESTADO_CANCELADO;
        const corBorda = p.status === 'Concluído' ? '#27ae60' : ehOrcamento ? '#E5A83B' : doPortal ? '#2980b9' : cancelado ? '#c0392b' : '#8C5E3C';

        const btnConcluir = cancelado
            ? ''
            : doPortal
            ? `<button class="btn-small" style="background:#2980b9;" onclick="abrirConfirmarPortal(${p.id})">Confirmar pedido</button>`
            : ehOrcamento
            ? `<button class="btn-small" style="background:#27ae60;" onclick="aprovarOrcamento(${p.id})">Aprovar e criar pedido</button>`
            : p.status !== 'Concluído'
            ? `<button class="btn-small" style="background:#27ae60;" onclick="mudarStatus(${p.id}, 'Concluído')">Concluir</button>`
            : `<button class="btn-small" style="background:#B08D6A;" onclick="mudarStatus(${p.id}, 'Pendente')">Reabrir</button>`;

        let btnWhatsApp = '';
        if (p.status === 'Concluído' && p.clientes && p.clientes.telefone) {
            const primeiroNome = p.clientes.nome.split(' ')[0];
            const texto = `Olá, ${primeiroNome}. Informamos que o seu pedido na Bordaveiro "${p.descricao}" está pronto, podendo ser levantado de segunda à sexta feira das 10:00 às 13:00 e das 14:00 às 17:45, exceto finais de semana e feriados. Obrigado pela preferência.`;
            const link = ligacaoWhatsApp(p.clientes.telefone, texto);
            btnWhatsApp = `<button class="btn-small" style="background:#25D366;" onclick="window.open(this.dataset.link, '_blank')" data-link="${escapar(link)}">Notificar cliente</button>`;
        }

        const btnEditar = `<button class="btn-small" style="background:#f39c12;" onclick="abrirEditarPedido(${p.id})">Editar</button>`;

        const [urlPdf] = lerUrls(p.arquivo_pdf);
        const urlsDst = lerUrls(p.arquivo_dst);
        const botaoDst = botoesFicheiros(urlsDst);

        const urlsImagem = lerUrls(p.arquivo_imagem);
        const miniatura = urlsImagem.length
            ? `<div class="thumbs-pedido">${urlsImagem.map((url, i) =>
                `<a href="${escapar(url)}" target="_blank" title="Abrir imagem completa">
                   <img class="thumb-pedido" src="${escapar(url)}" alt="Imagem ${i + 1} do pedido ${p.id}" loading="lazy">
                 </a>`).join('')}</div>`
            : '';

        let dataFormatada = 'Sem data';
        if (p.data_entrega) {
            const d = p.data_entrega.split('-');
            dataFormatada = `${d[2]}/${d[1]}/${d[0]}`;
        }

        painel.innerHTML += `
      <div class="cartao-pedido${pedidosAbertos.has(p.id) ? ' aberto' : ''}" onclick="alternarDetalhesPedido(event, ${p.id})" style="border-left: 5px solid ${corBorda}; background: white; padding: 15px; margin-bottom: 12px; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
        <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom: 8px; gap: 10px; flex-wrap: wrap;">
          <strong style="font-size: 15px; color: #4A2511;">#${p.id} - ${escapar(p.descricao)}${ehOrcamento ? ' <span style="font-size:11px; background:#E5A83B; color:white; padding:2px 6px; border-radius:4px; margin-left:4px;">ORÇAMENTO</span>' : ''}${doPortal ? ' <span class="badge-portal">PORTAL</span>' : ''}${cancelado ? ' <span class="badge-cancelado">CANCELADO PELO CLIENTE</span>' : ''}</strong>
          <div style="display:flex; gap:6px; flex-wrap: wrap;">${botaoDst}${urlPdf ? `<a href="${escapar(urlPdf)}" target="_blank" class="btn-small" style="background:#c0392b;">PDF guardado</a>` : ''}<button class="btn-small" style="background:#A67B5B;" onclick="gerarPDF(${p.id})">Gerar PDF</button></div>
        </div>
        <div class="pedido-corpo${urlsImagem.length > 1 ? ' varias-imagens' : ''}">
          ${miniatura}
          <p style="margin:2px 0; font-size:13px; color:#555;">
            <strong>Cliente:</strong> ${p.clientes ? escapar(p.clientes.nome) : 'Desconhecido'}<br>
            ${doPortal
                ? `<strong>Data pretendida:</strong> ${p.data_pretendida ? formatarData(p.data_pretendida) : 'não indicada'}`
                : `<strong>Valor:</strong> ${!(parseFloat(p.valor) > 0) && ehPedidoDP(p) ? 'acerto no fim do mês' : `€ ${escapar(p.valor)}`} | <strong>Entrega:</strong> ${dataFormatada}`}
            ${p.cor_linha ? `<br><strong>Cor da linha:</strong> ${escapar(p.cor_linha)}` : ''}
            ${p.codigos_linhas ? `<br><strong>Linhas:</strong> ${escapar(p.codigos_linhas)}` : ''}
            ${(Array.isArray(p.itens) ? p.itens : []).filter(letraLocal).map(i =>
                `<br><strong>${escapar(i.nome)}:</strong> ${escapar(letraLocal(i))}`).join('')}
          </p>
        </div>
        <div class="pedido-ver-detalhes"></div>
        ${detalhesPedido(p)}
        <div style="display:flex; gap:10px; margin-top:12px; flex-wrap: wrap;">
          ${btnConcluir} ${btnWhatsApp} ${btnEditar}
          <button class="btn-small" style="background:#e74c3c;" onclick="apagarPedido(${p.id})">Eliminar</button>
        </div>
      </div>`;
    });
}

// Encomendas com os detalhes abertos (mantêm-se abertas quando a lista é redesenhada)
const pedidosAbertos = new Set();

function alternarDetalhesPedido(evento, id) {
    // Botões e links mantêm a sua função; selecionar texto também não abre nem fecha
    if (evento.target.closest('button, a') || String(window.getSelection())) return;
    if (pedidosAbertos.has(id)) pedidosAbertos.delete(id); else pedidosAbertos.add(id);
    evento.currentTarget.classList.toggle('aberto');
}

function detalhesPedido(p) {
    const euro = n => `€ ${parseFloat(n).toFixed(2)}`;
    const itens = Array.isArray(p.itens) ? p.itens : [];
    const produtos = itens.map(i => `
      <div class="detalhe-produto">
        <div class="detalhe-produto-linha">
          <strong>${escapar(i.quantidade || 1)} × ${escapar(i.nome)}</strong>
          ${i.com_iva > 0 ? `<strong>${euro(i.com_iva)}</strong>` : ''}
        </div>
        ${i.preco > 0 ? `<small>${euro(i.preco)} / unid.${i.iva > 0 ? ' s/ IVA' : ''}</small>` : ''}
        ${i.descricao ? `<small>${escapar(i.descricao)}</small>` : ''}
        ${i.codigos ? `<small>Linhas: ${escapar(i.codigos)}</small>` : ''}
        ${corTamanhos(i) ? `<small>${escapar(corTamanhos(i))}</small>` : ''}
        ${letraLocal(i) ? `<small>${escapar(letraLocal(i))}</small>` : ''}
      </div>`).join('');

    const campos = [
        ['Data do pedido', p.data_pedido && formatarData(p.data_pedido.slice(0, 10))],
        ['Data de produção', formatarData(p.data_producao)],
        ['Origem do artigo', p.origem_artigo],
        ['Artigo', p.tipo_artigo],
        ['Quantidade do artigo', p.quantidade_artigo],
        ['Tamanhos', p.tamanhos_artigo],
        ['Marca', p.marca_artigo],
        ['Opção bebé', p.detalhe_bebe],
        ['Pagamento', p.tipo_pagamento],
        ['Método de pagamento', p.metodo_pagamento],
        ['Valor pago', parseFloat(p.valor_pago) > 0 && euro(p.valor_pago)]
    ].filter(([, valor]) => valor);

    return `
      <div class="pedido-detalhes">
        <p><strong>Descrição:</strong> ${escapar(p.descricao)}</p>
        ${produtos}
        ${campos.map(([rotulo, valor]) => `<p><strong>${rotulo}:</strong> ${escapar(valor)}</p>`).join('')}
      </div>`;
}

function limparFiltroCalendarioPedidos() {
    document.getElementById('filtro-data-de').value = '';
    document.getElementById('filtro-data-ate').value = '';
    renderizarPedidos();
}

// --- Produtos do pedido com IVA ---
const TAXA_IVA = 0.23;
const arred = n => Math.round(n * 100) / 100;
// "Letra: X · Local: Y" de um produto (vazio se não tiver nenhum dos dois)
const letraLocal = i => [i.letra && `Letra: ${i.letra}`, i.local && `Local: ${i.local}`].filter(Boolean).join(' · ');
// "Cor: X · Masculino · Tamanhos: Y" de um produto (vazio se não tiver nenhum)
const corTamanhos = i => [i.cor && `Cor: ${i.cor}`, i.genero, i.tamanhos && `Tamanhos: ${i.tamanhos}`].filter(Boolean).join(' · ');

// --- Tamanhos do produto: uma quantidade por tamanho, guardadas como "3 S, 3 M, 1 XL" ---
const TAMANHOS = ['Infantil', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'];

const camposTamanhos = () => `
      <small>Tamanhos (quantidade de cada)</small>
      <div class="item-tamanhos">${TAMANHOS.map(t => `
        <label><span>${t}</span><input type="number" min="0" step="1" placeholder="0" data-tamanho="${t}" oninput="somarTamanhos(this)"></label>`).join('')}
      </div>`;

const lerTamanhos = div => [...div.querySelectorAll('[data-tamanho]')]
    .filter(input => parseInt(input.value) > 0)
    .map(input => `${parseInt(input.value)} ${input.dataset.tamanho}`)
    .join(', ');

function preencherTamanhos(div, texto) {
    (texto || '').split(', ').forEach(parte => {
        const [quantidade, tamanho] = parte.split(' ');
        const input = div.querySelector(`[data-tamanho="${tamanho}"]`);
        if (input) input.value = quantidade;
    });
}

// A quantidade do produto passa a ser a soma dos tamanhos
function somarTamanhos(input) {
    const div = input.closest('.item-pedido');
    const total = [...div.querySelectorAll('[data-tamanho]')].reduce((s, i) => s + Math.max(parseInt(i.value) || 0, 0), 0);
    if (!total) return;
    const qtd = div.querySelector('.item-qtd');
    qtd.value = total;
    qtd.dispatchEvent(new Event('input'));
}
// Códigos de linhas de todos os produtos, para o campo codigos_linhas do pedido
const juntarCodigos = itens => [...new Set(itens.map(i => i.codigos).filter(Boolean))].join(', ');

function adicionarItemPedido(item = {}) {
    const div = document.createElement('div');
    div.className = 'item-pedido';
    div.innerHTML = `
      <div class="item-linha">
        <div><small>Nome do produto</small><input type="text" class="item-nome" placeholder="Ex: Toalha bordada"></div>
        <button type="button" class="btn-small item-remover" title="Remover" onclick="this.closest('.item-pedido').remove(); atualizarTotaisIva();">✕</button>
      </div>
      <small>Descrição</small><input type="text" class="item-descricao" placeholder="Ex: Bordado com nome e anjo">
      <small>Códigos das linhas</small><input type="text" class="item-codigos" placeholder="Ex: 1143, 1000">
      <div class="item-linha">
        <div><small>Cor do artigo</small><input type="text" class="item-cor" placeholder="Ex: Preto"></div>
        <div><small>Género</small><select class="item-genero"><option value="">—</option><option>Masculino</option><option>Feminino</option></select></div>
      </div>
      ${camposTamanhos()}
      <div class="item-linha">
        <div><small>Qtd.</small><input type="number" class="item-qtd" min="1" step="1" value="1" oninput="atualizarTotaisIva()"></div>
        <div><small>Preço unit. s/ IVA (€)</small><input type="number" class="item-preco" min="0" step="0.01" placeholder="0.00" oninput="atualizarTotaisIva()"></div>
      </div>
      <div class="item-calculo">
        <span>Sem IVA: <strong class="item-sem-iva">€ 0.00</strong></span>
        <span>IVA 23%: <strong class="item-iva">€ 0.00</strong></span>
        <span>Com IVA: <strong class="item-com-iva">€ 0.00</strong></span>
      </div>`;
    div.querySelector('.item-nome').value = item.nome || '';
    div.querySelector('.item-descricao').value = item.descricao || '';
    div.querySelector('.item-codigos').value = item.codigos || '';
    div.querySelector('.item-cor').value = item.cor || '';
    div.querySelector('.item-genero').value = item.genero || '';
    preencherTamanhos(div, item.tamanhos);
    if (item.quantidade) div.querySelector('.item-qtd').value = item.quantidade;
    if (item.preco) div.querySelector('.item-preco').value = item.preco;
    document.getElementById('lista-itens-pedido').appendChild(div);
    atualizarTotaisIva();
}

// Lê as linhas preenchidas e devolve-as com os valores calculados
function lerItensPedido() {
    return [...document.querySelectorAll('#lista-itens-pedido .item-pedido')].map(div => {
        const quantidade = parseInt(div.querySelector('.item-qtd').value) || 1;
        const preco = parseFloat(div.querySelector('.item-preco').value) || 0;
        const semIva = arred(quantidade * preco);
        const iva = arred(semIva * TAXA_IVA);
        return {
            nome: div.querySelector('.item-nome').value.trim(),
            descricao: div.querySelector('.item-descricao').value.trim(),
            codigos: div.querySelector('.item-codigos').value.trim(),
            cor: div.querySelector('.item-cor').value.trim(),
            genero: div.querySelector('.item-genero').value,
            tamanhos: lerTamanhos(div),
            quantidade, preco, sem_iva: semIva, iva, com_iva: arred(semIva + iva), _div: div
        };
    });
}

function totaisItens(itens) {
    const semIva = arred(itens.reduce((s, i) => s + i.sem_iva, 0));
    const iva = arred(itens.reduce((s, i) => s + i.iva, 0));
    return { semIva, iva, comIva: arred(semIva + iva) };
}

function atualizarTotaisIva() {
    const euro = n => `€ ${n.toFixed(2)}`;
    const itens = lerItensPedido();
    itens.forEach(i => {
        i._div.querySelector('.item-sem-iva').innerText = euro(i.sem_iva);
        i._div.querySelector('.item-iva').innerText = euro(i.iva);
        i._div.querySelector('.item-com-iva').innerText = euro(i.com_iva);
    });
    const t = totaisItens(itens);
    document.getElementById('total-sem-iva').innerText = euro(t.semIva);
    document.getElementById('total-iva').innerText = euro(t.iva);
    document.getElementById('total-com-iva').innerText = euro(t.comIva);
    // O valor total do pedido passa a ser o total com IVA dos produtos
    if (itens.some(i => i.sem_iva > 0)) document.getElementById('novo-valor').value = t.comIva.toFixed(2);
}

function itensValidos() {
    return lerItensPedido()
        .filter(i => i.nome || i.sem_iva > 0)
        .map(({ _div, ...i }) => i);
}

function limparFormularioPedido() {
    ['pesquisa-cliente-input', 'novo-cliente-id', 'novo-valor',
     'novo-valor-pago', 'nova-imagem', 'novo-dst', 'nova-data-producao', 'nova-data-entrega']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    document.getElementById('lista-itens-pedido').innerHTML = '';
    adicionarItemPedido();
}

function cancelarEdicao() {
    limparFormularioPedido();
    document.getElementById('btn-cancelar-edicao').style.display = 'none';
}

function construirFormDataPedido(clienteId, status) {
    const formData = new FormData();
    formData.append('cliente_id', clienteId);
    formData.append('status', status);
    const itens = itensValidos();
    // A descrição do pedido são os nomes dos produtos
    formData.append('descricao', itens.map(i => i.nome).filter(Boolean).join(', '));
    formData.append('itens', JSON.stringify(itens));
    formData.append('origem_artigo', document.getElementById('nova-origem').value);
    formData.append('codigos_linhas', juntarCodigos(lerItensPedido()));
    formData.append('valor', document.getElementById('novo-valor').value || 0);
    formData.append('data_producao', document.getElementById('nova-data-producao').value || '');
    formData.append('data_entrega', document.getElementById('nova-data-entrega').value || '');
    formData.append('tipo_pagamento', document.getElementById('novo-pagamento').value);
    formData.append('metodo_pagamento', document.getElementById('novo-metodo-pagamento').value);

    if (document.getElementById('nova-origem').value === 'Bordaveiro') {
        formData.append('tipo_artigo', document.getElementById('novo-tipo-artigo').value);
        formData.append('quantidade_artigo', document.getElementById('novo-qtd-artigo').value);
        formData.append('tamanhos_artigo', document.getElementById('novo-tamanhos-artigo').value);
        formData.append('marca_artigo', document.getElementById('novo-marca-artigo').value);
        if (document.getElementById('novo-tipo-artigo').value === 'Bebé') {
            formData.append('detalhe_bebe', document.getElementById('novo-detalhe-bebe').value);
        }
    }

    if (document.getElementById('novo-pagamento').value === 'Parcial') {
        formData.append('valor_pago', document.getElementById('novo-valor-pago').value);
    }

    [...document.getElementById('novo-dst').files].forEach(f => formData.append('dst', f));
    [...document.getElementById('nova-imagem').files].forEach(f => formData.append('imagem', f));

    return formData;
}

// --- Ficheiros PNG / DST (até 6 de cada por pedido) ---
const MAX_FICHEIROS = 6;

// arquivo_imagem / arquivo_dst guardam uma lista JSON de links; pedidos antigos têm um único link
function lerUrls(valor) {
    if (!valor) return [];
    if (Array.isArray(valor)) return valor;
    if (valor.startsWith('[')) {
        try { return JSON.parse(valor); } catch (e) { return []; }
    }
    return [valor];
}

// Tipo do ficheiro pela extensão (DST, EMB, PDF...); os pedidos do portal podem trazer vários tipos
const tipoFicheiro = url => (decodeURIComponent(url.split('?')[0]).split('.').pop() || '').toUpperCase();

// Botões de download: "Descarregar DST" se houver um só ficheiro; senão "DST 1", "DST 2", "PDF"...
function botoesFicheiros(urls) {
    const porTipo = {};
    urls.forEach(url => { const t = tipoFicheiro(url); porTipo[t] = (porTipo[t] || 0) + 1; });
    const vistos = {};
    return urls.map(url => {
        const tipo = tipoFicheiro(url);
        vistos[tipo] = (vistos[tipo] || 0) + 1;
        const texto = urls.length === 1 ? `Descarregar ${tipo}` : porTipo[tipo] > 1 ? `${tipo} ${vistos[tipo]}` : tipo;
        return `<a href="${escapar(url)}" target="_blank" class="btn-small" style="background:${tipo === 'PDF' ? '#c0392b' : '#3498db'};">${escapar(texto)}</a>`;
    }).join('');
}

// jaExistentes: ficheiros que o pedido já tem (na edição)
function validarLimiteFicheiros(input, jaExistentes = 0) {
    if (input.files.length + jaExistentes <= MAX_FICHEIROS) return true;
    alert(`Só pode ter até ${MAX_FICHEIROS} ficheiros de cada tipo por pedido.` +
        (jaExistentes ? ` Este pedido já tem ${jaExistentes}.` : ''));
    input.value = '';
    return false;
}

// Guarda um pedido (status 'Pendente') ou um orçamento (status 'Orçamento')
async function guardarPedido(status = 'Pendente') {
    const ehOrcamento = status === 'Orçamento';
    const clienteId = document.getElementById('novo-cliente-id').value;
    const msg = document.getElementById('msg-novo-pedido');

    if (!clienteId) { msg.style.color = 'red'; msg.innerText = 'Selecione um cliente.'; return; }
    if (!itensValidos().some(i => i.nome)) { msg.style.color = 'red'; msg.innerText = 'Indique o nome de pelo menos um produto.'; return; }
    if (ehOrcamento && !(parseFloat(document.getElementById('novo-valor').value) > 0)) {
        msg.style.color = 'red'; msg.innerText = 'Para gerar o orçamento, preencha o valor.'; return;
    }

    try {
        msg.style.color = '#8C5E3C';
        msg.innerText = ehOrcamento ? 'A gerar orçamento...' : 'A guardar pedido...';
        const res = await api(`${URL_API}/pedidos`, { method: 'POST', body: construirFormDataPedido(clienteId, status) });
        if (!res.ok) throw new Error('Falha ao guardar.');
        const criado = await res.json();

        limparFormularioPedido();
        await carregarPedidos();

        if (ehOrcamento) {
            mudarAba('orcamentos');
            gerarPDF(criado.id);
            msg.style.color = 'green';
            msg.innerText = 'Orçamento guardado e PDF gerado. Quando o cliente aprovar, use "Aprovar e criar pedido".';
            setTimeout(() => msg.innerText = '', 8000);
        } else {
            mudarAba('pendentes');
            msg.style.color = 'green';
            msg.innerText = 'Pedido registado com sucesso.';
            setTimeout(() => msg.innerText = '', 3000);
        }
    } catch (e) {
        msg.style.color = 'red';
        msg.innerText = ehOrcamento ? 'Não foi possível gerar o orçamento. Tente novamente.' : 'Não foi possível guardar o pedido. Tente novamente.';
    }
}

function guardarOrcamento() { return guardarPedido('Orçamento'); }

// Aprovação do cliente: o orçamento passa a pedido pendente
async function aprovarOrcamento(id) {
    if (!confirm('Confirma que o cliente aprovou este orçamento? Será convertido em pedido.')) return;
    try {
        const res = await api(`${URL_API}/pedidos/${id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'Pendente' })
        });
        if (!res.ok) throw new Error();
        await carregarPedidos();
        mudarAba('pendentes');
    } catch (e) {
        alert('Não foi possível converter o orçamento em pedido. Tente novamente.');
    }
}

async function mudarStatus(id, novoStatus) {
    await api(`${URL_API}/pedidos/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: novoStatus })
    });
    carregarPedidos();
}

async function apagarPedido(id) {
    if (!confirm('Confirma a eliminação deste pedido? Esta ação não pode ser revertida.')) return;
    await api(`${URL_API}/pedidos/${id}`, { method: 'DELETE' });
    carregarPedidos();
}

// --- Pedido rápido DP ---
function abrirModalDP() {
    if (!document.querySelector('#lista-itens-dp .item-pedido')) adicionarItemDP();
    document.getElementById('modal-dp').style.display = 'flex';
}
function fecharModalDP() { document.getElementById('modal-dp').style.display = 'none'; }

// Produtos do pedido DP: quantidade × preço, sem IVA
function adicionarItemDP() {
    const div = document.createElement('div');
    div.className = 'item-pedido';
    div.innerHTML = `
      <div class="item-linha">
        <div><small>Nome do produto</small><input type="text" class="item-nome" placeholder="Ex: Toalha bordada"></div>
        <button type="button" class="btn-small item-remover" title="Remover" onclick="this.closest('.item-pedido').remove(); atualizarTotalDP();">✕</button>
      </div>
      <small>Descrição</small><input type="text" class="item-descricao" placeholder="Ex: Bordado com nome e anjo">
      <small>Códigos das linhas</small><input type="text" class="item-codigos" placeholder="Ex: 1143, 1000">
      <div class="item-linha">
        <div><small>Cor do artigo</small><input type="text" class="item-cor" placeholder="Ex: Preto"></div>
        <div><small>Género</small><select class="item-genero"><option value="">—</option><option>Masculino</option><option>Feminino</option></select></div>
      </div>
      ${camposTamanhos()}
      <div class="item-linha">
        <div><small>Letra</small><input type="text" class="item-letra" placeholder="Ex: Cursiva, Arial"></div>
        <div><small>Local do bordado</small><input type="text" class="item-local" placeholder="Ex: Peito esquerdo, costas"></div>
      </div>
      <div class="item-linha">
        <div><small>Qtd.</small><input type="number" class="item-qtd" min="1" step="1" value="1" oninput="atualizarTotalDP()"></div>
        <div><small>Preço unit. (€)</small><input type="number" class="item-preco" min="0" step="0.01" placeholder="0.00" oninput="atualizarTotalDP()"></div>
      </div>
      <div class="item-calculo">
        <span>Subtotal: <strong class="item-subtotal">€ 0.00</strong></span>
      </div>`;
    document.getElementById('lista-itens-dp').appendChild(div);
    atualizarTotalDP();
}

// Os itens DP ficam com iva 0 para as estatísticas não lhes somarem IVA
function lerItensDP() {
    return [...document.querySelectorAll('#lista-itens-dp .item-pedido')].map(div => {
        const quantidade = parseInt(div.querySelector('.item-qtd').value) || 1;
        const preco = parseFloat(div.querySelector('.item-preco').value) || 0;
        const subtotal = arred(quantidade * preco);
        return {
            nome: div.querySelector('.item-nome').value.trim(),
            descricao: div.querySelector('.item-descricao').value.trim(),
            codigos: div.querySelector('.item-codigos').value.trim(),
            cor: div.querySelector('.item-cor').value.trim(),
            genero: div.querySelector('.item-genero').value,
            tamanhos: lerTamanhos(div),
            letra: div.querySelector('.item-letra').value.trim(),
            local: div.querySelector('.item-local').value.trim(),
            quantidade, preco, sem_iva: subtotal, iva: 0, com_iva: subtotal, _div: div
        };
    });
}

function atualizarTotalDP() {
    const itens = lerItensDP();
    itens.forEach(i => i._div.querySelector('.item-subtotal').innerText = `€ ${i.sem_iva.toFixed(2)}`);
    document.getElementById('total-dp').innerText = `€ ${arred(itens.reduce((s, i) => s + i.sem_iva, 0)).toFixed(2)}`;
}

async function criarPedidoDP() {
    const msg = document.getElementById('msg-dp-pedido');
    const itens = lerItensDP().filter(i => i.nome || i.sem_iva > 0).map(({ _div, ...i }) => i);
    const descricao = itens.map(i => i.nome).filter(Boolean).join(', ');
    const valor = arred(itens.reduce((s, i) => s + i.sem_iva, 0));
    const dataEntrega = document.getElementById('dp-data-entrega').value;

    const dp = clientesGlobais.find(c => c.nome.trim().toUpperCase() === 'DP');
    if (!dp) {
        msg.style.color = 'red';
        msg.innerText = 'Não existe um cliente com o nome "DP". Crie-o primeiro em "Novo Cliente".';
        return;
    }
    if (!descricao) {
        msg.style.color = 'red'; msg.innerText = 'Indique o nome de pelo menos um produto.'; return;
    }

    const formData = new FormData();
    formData.append('cliente_id', dp.id);
    formData.append('descricao', descricao);
    formData.append('itens', JSON.stringify(itens));
    formData.append('origem_artigo', 'Cliente');
    formData.append('codigos_linhas', juntarCodigos(lerItensDP()));
    formData.append('valor', valor);
    formData.append('data_entrega', dataEntrega || '');
    formData.append('tipo_pagamento', 'Na Entrega');
    formData.append('metodo_pagamento', 'Numerário');
    [...document.getElementById('dp-dst').files].forEach(f => formData.append('dst', f));
    [...document.getElementById('dp-imagem').files].forEach(f => formData.append('imagem', f));

    try {
        msg.style.color = '#8C5E3C'; msg.innerText = 'A guardar...';
        const res = await api(`${URL_API}/pedidos`, { method: 'POST', body: formData });
        if (!res.ok) throw new Error('Falha ao guardar.');

        ['dp-data-entrega', 'dp-imagem', 'dp-dst'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('lista-itens-dp').innerHTML = '';
        msg.innerText = '';
        fecharModalDP();
        carregarPedidos();
    } catch (e) {
        msg.style.color = 'red'; msg.innerText = 'Não foi possível guardar o pedido. Tente novamente.';
    }
}

// ============================================================================
// RECLAMAÇÕES E SUGESTÕES (chat guiado)
// ============================================================================

// O chat em si está em chat.js (partilhado com o Portal do Cliente)
configurarChat({
    assuntos: ['Pedidos', 'Estoque', 'Sistema / App', 'Atendimento', 'Outro'],
    saudacao: () => {
        const nome = (localStorage.getItem('nome_bordaveiro') || '').split(' ')[0];
        return `Olá${nome ? ', ' + nome : ''}! Sou o assistente da Bordaveiro.\nO que gostaria de nos enviar?`;
    },
    enviar: async conversa => {
        const res = await api(`${URL_API}/feedback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(conversa)
        });
        if (!res.ok) throw new Error();
        return res.json();
    },
    aposEnviar: () => { if (localStorage.getItem('perfil_bordaveiro') === 'admin') carregarFeedback(); }
});

// --- Lista de mensagens recebidas (admin) ---
let feedbackGlobais = [];
let filtroFeedback = 'Novo';

async function carregarFeedback() {
    try {
        const res = await api(`${URL_API}/feedback`);
        const dados = await res.json();
        feedbackGlobais = Array.isArray(dados) ? dados : [];
    } catch (e) {
        feedbackGlobais = [];
    }
    renderizarFeedback();
}

function filtrarFeedback(estado) {
    filtroFeedback = estado;
    ['Novo', 'Resolvido'].forEach(e =>
        document.getElementById(`tab-feedback-${e}`).className = `tab-btn ${e === estado ? 'tab-active' : 'tab-inactive'}`);
    renderizarFeedback();
}

function renderizarFeedback() {
    const lista = feedbackGlobais.filter(f => (f.estado || 'Novo') === filtroFeedback);
    const div = document.getElementById('lista-feedback');
    if (!lista.length) {
        div.innerHTML = `<p style="text-align: center; color: #888; margin-top: 20px;">${filtroFeedback === 'Novo' ? 'Não há mensagens por tratar.' : 'Ainda não há mensagens resolvidas.'}</p>`;
        return;
    }
    div.innerHTML = lista.map(f => {
        const data = f.created_at ? new Date(f.created_at).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }) : '';
        const novoEstado = filtroFeedback === 'Novo' ? 'Resolvido' : 'Novo';
        // Mensagens de clientes (portal): o admin pode desligar a opção a quem a use para outros assuntos
        const doCliente = f.origem === 'Portal' && f.utilizador_id;
        const ativo = f.utilizadores?.feedback_ativo !== false;
        const btnCliente = doCliente
            ? `<button class="btn-small" style="background:${ativo ? '#7f8c8d' : '#2980b9'};" onclick="alterarFeedbackCliente(${f.utilizador_id}, ${!ativo})">${ativo ? 'Desativar sugestões deste cliente' : 'Reativar sugestões deste cliente'}</button>`
            : '';
        return `
      <div class="feedback-item ${f.tipo === 'Reclamação' ? 'reclamacao' : ''}">
        <span class="badge-feedback">${escapar(f.tipo)}</span>${f.origem === 'Portal' ? '<span class="badge-portal" style="margin: 0 6px 0 0;">CLIENTE</span>' : ''}<strong>#${f.id} · ${escapar(f.assunto || '')}</strong>
        <p>${escapar(f.mensagem)}</p>
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
          <small>${escapar(f.autor || 'Desconhecido')} · ${data}${doCliente && !ativo ? ' · <strong style="color:#c0392b;">sugestões desativadas</strong>' : ''}</small>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            ${btnCliente}
            <button class="btn-small" style="background:${novoEstado === 'Resolvido' ? '#27ae60' : '#B08D6A'};" onclick="mudarEstadoFeedback(${f.id}, '${novoEstado}')">${novoEstado === 'Resolvido' ? 'Marcar como resolvida' : 'Reabrir'}</button>
          </div>
        </div>
      </div>`;
    }).join('');
}

// Liga/desliga a aba "Sugestões" do portal para uma conta de cliente
async function alterarFeedbackCliente(utilizadorId, ativo) {
    const pergunta = ativo
        ? 'Reativar as sugestões e reclamações para este cliente?'
        : 'Desativar as sugestões e reclamações para este cliente? A aba deixa de aparecer no portal dele.';
    if (!confirm(pergunta)) return;
    const res = await api(`${URL_API}/utilizadores/${utilizadorId}/feedback`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo })
    });
    if (!res.ok) alert((await res.json()).erro || 'Não foi possível alterar a conta.');
    carregarFeedback();
    if (document.getElementById('pagina-admin').style.display !== 'none') carregarUtilizadores();
}

async function mudarEstadoFeedback(id, estado) {
    await api(`${URL_API}/feedback/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado })
    });
    carregarFeedback();
}

// --- Confirmação de pedidos do portal ---
// A equipa indica o valor do pedido (obrigatório; o cliente não o vê) e confirma a data
// pedida pelo cliente (OK) ou indica uma previsão
function abrirConfirmarPortal(id) {
    const p = pedidosGlobais.find(item => item.id === id);
    if (!p) return;

    let modal = document.getElementById('modal-confirmar-portal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-confirmar-portal';
        modal.className = 'modal-overlay';
        document.body.appendChild(modal);
    }

    const itens = Array.isArray(p.itens) ? p.itens : [];
    const imagens = lerUrls(p.arquivo_imagem);
    const hoje = new Date().toISOString().slice(0, 10);

    modal.innerHTML = `
      <div class="modal-content">
        <button class="btn-fechar-modal" onclick="document.getElementById('modal-confirmar-portal').style.display='none'">X</button>
        <h3>Confirmar Pedido #${p.id}</h3>
        <p style="margin-top: -8px; color: #666; font-size: 13px;">Cliente: <strong>${p.clientes ? escapar(p.clientes.nome) : 'Desconhecido'}</strong> · enviado pelo portal</p>

        <div class="caixa-produtos">
          <label style="display: block; font-weight: bold; margin-bottom: 10px; color: #4A2511;">Produtos pedidos</label>
          ${itens.map(i => `
            <div class="item-pedido">
              <strong>${escapar(i.quantidade)} × ${escapar(i.nome)}</strong>
              ${i.descricao ? `<br><small>${escapar(i.descricao)}</small>` : ''}
              ${i.codigos ? `<br><small>Cor / código da linha: ${escapar(i.codigos)}</small>` : ''}
              ${corTamanhos(i) ? `<br><small>${escapar(corTamanhos(i))}</small>` : ''}
              ${letraLocal(i) ? `<br><small>${escapar(letraLocal(i))}</small>` : ''}
            </div>`).join('') || `<p>${escapar(p.descricao)}</p>`}
        </div>

        ${p.cor_linha ? `<p><strong>Cor da linha:</strong> ${escapar(p.cor_linha)}</p>` : ''}
        ${imagens.length ? `<div class="thumbs-pedido" style="margin-bottom: 15px;">${imagens.map(url =>
            `<a href="${escapar(url)}" target="_blank"><img class="thumb-pedido" src="${escapar(url)}" alt=""></a>`).join('')}</div>` : ''}
        ${lerUrls(p.arquivo_dst).length ? `<div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 15px;">${botoesFicheiros(lerUrls(p.arquivo_dst))}</div>` : ''}

        <div class="caixa-produtos">
          <div class="input-group" style="margin-bottom: 0;">
            <label>Valor do pedido sem IVA (€) <span style="color: #c0392b;">*</span></label>
            <input type="number" id="confirmar-valor" min="0" step="0.01" placeholder="0.00" oninput="atualizarIvaConfirmacao()">
          </div>
          <div class="totais-iva">
            <div><span>IVA (23%)</span><strong id="confirmar-iva">€ 0.00</strong></div>
            <div class="total-final"><span>Total com IVA</span><strong id="confirmar-total">€ 0.00</strong></div>
          </div>
        </div>

        <div class="caixa-ficheiros" style="border-style: solid;">
          ${p.data_pretendida ? `
            <p style="margin-top: 0;">O cliente pretende o pedido para <strong>${formatarData(p.data_pretendida)}</strong>.</p>
            <button class="btn" style="background: #27ae60;" onclick="confirmarPedidoPortal(${p.id}, '${p.data_pretendida}')">OK — data possível</button>
            <p style="text-align: center; color: #888; margin: 12px 0 8px;">— ou, se não for possível —</p>`
          : '<p style="margin-top: 0;">O cliente não indicou data pretendida.</p>'}
          <div class="input-group" style="margin-bottom: 10px;">
            <label>Previsão de entrega</label>
            <input type="date" id="confirmar-previsao" min="${hoje}">
          </div>
          <button class="btn" style="background: #8C5E3C;" onclick="confirmarPedidoPortal(${p.id}, document.getElementById('confirmar-previsao').value)">Confirmar com esta previsão</button>
        </div>
        <p id="msg-confirmar-portal" style="font-size:13px; text-align:center; margin-top:10px; font-weight: bold;"></p>
      </div>`;

    modal.style.display = 'flex';
}

// O valor é obrigatório e introduzido sem IVA; o pedido guarda o total com IVA
function valoresConfirmacao() {
    const semIva = arred(parseFloat(document.getElementById('confirmar-valor').value) || 0);
    const iva = arred(semIva * TAXA_IVA);
    return { semIva, iva, comIva: arred(semIva + iva) };
}

function atualizarIvaConfirmacao() {
    const v = valoresConfirmacao();
    document.getElementById('confirmar-iva').innerText = `€ ${v.iva.toFixed(2)}`;
    document.getElementById('confirmar-total').innerText = `€ ${v.comIva.toFixed(2)}`;
}

async function confirmarPedidoPortal(id, dataEntrega) {
    const msg = document.getElementById('msg-confirmar-portal');
    const valor = valoresConfirmacao();
    if (!(valor.semIva > 0)) {
        msg.style.color = 'red'; msg.innerText = 'Indique o valor do pedido.';
        document.getElementById('confirmar-valor').focus();
        return;
    }
    if (!dataEntrega) { msg.style.color = 'red'; msg.innerText = 'Indique a previsão de entrega.'; return; }

    try {
        msg.style.color = '#8C5E3C'; msg.innerText = 'A confirmar...';
        const res = await api(`${URL_API}/pedidos/${id}/confirmar`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data_entrega: dataEntrega, valor: valor.comIva })
        });
        const dados = await res.json();
        if (!res.ok) throw new Error(dados.erro);

        document.getElementById('modal-confirmar-portal').style.display = 'none';
        await carregarPedidos();
        mudarAba('pendentes');
    } catch (e) {
        msg.style.color = 'red'; msg.innerText = e.message || 'Não foi possível confirmar o pedido.';
    }
}

// --- Edição de pedidos ---
function abrirEditarPedido(id) {
    const p = pedidosGlobais.find(item => item.id === id);
    if (!p) return;

    let modal = document.getElementById('modal-editar-pedido');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-editar-pedido';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
      <div class="modal-content">
        <h3>Editar Pedido #<span id="edit-id-titulo"></span></h3>
        <input type="hidden" id="edit-id">

        <div class="input-group">
          <label>Descrição</label>
          <input type="text" id="edit-descricao">
        </div>
        <div class="caixa-produtos">
          <label style="display: block; font-weight: bold; margin-bottom: 10px; color: #4A2511;">Produtos / Serviços</label>
          <div id="edit-lista-itens"></div>
          <button type="button" class="btn-small" style="background: #A67B5B;" onclick="adicionarItemEdicao()">+ Adicionar produto</button>
          <div class="totais-iva">
            <div class="edit-so-iva"><span>Total sem IVA</span><strong id="edit-total-sem-iva">€ 0.00</strong></div>
            <div class="edit-so-iva"><span>IVA (23%)</span><strong id="edit-total-iva">€ 0.00</strong></div>
            <div class="total-final"><span id="edit-total-rotulo">Total com IVA</span><strong id="edit-total-com-iva">€ 0.00</strong></div>
          </div>
        </div>
        <div class="input-group">
          <label>Valor (€)</label>
          <input type="number" step="0.01" id="edit-valor">
          <small style="color: #666;">Ao alterar os produtos com preço, o valor passa a ser o total acima.</small>
        </div>
        <div class="input-group">
          <label>Data de entrega / previsão</label>
          <input type="date" id="edit-data-entrega">
          <small id="edit-data-pretendida" style="color: #2980b9;"></small>
        </div>
        <div class="input-group">
          <label>Imagens PNG (até 6)</label>
          <div id="edit-lista-imagem" class="ficheiros-atuais"></div>
          <input type="file" id="edit-imagem" accept="image/png" multiple onchange="validarLimiteFicheiros(this, ficheirosEdicao.imagem.length)">
        </div>
        <div class="input-group">
          <label>Ficheiros DST / PDF / EMB (até 6)</label>
          <div id="edit-lista-dst" class="ficheiros-atuais"></div>
          <input type="file" id="edit-dst" accept=".dst" multiple onchange="validarLimiteFicheiros(this, ficheirosEdicao.dst.length)">
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px;">
          <button class="btn-small" style="background:#888;" onclick="document.getElementById('modal-editar-pedido').style.display='none'">Cancelar</button>
          <button class="btn-small" style="background:#27ae60;" onclick="guardarEdicaoPedido()">Guardar Alterações</button>
        </div>
        <p id="msg-editar-pedido" style="font-size:13px; text-align:center; margin-top:10px;"></p>
      </div>`;
        document.body.appendChild(modal);
    }

    document.getElementById('edit-id-titulo').innerText = p.id;
    document.getElementById('edit-id').value = p.id;
    document.getElementById('edit-descricao').value = p.descricao || '';
    document.getElementById('edit-valor').value = p.valor || '';
    edicaoSemIva = ehPedidoDP(p);
    document.querySelectorAll('.edit-so-iva').forEach(el => el.style.display = edicaoSemIva ? 'none' : '');
    document.getElementById('edit-total-rotulo').innerText = edicaoSemIva ? 'Total' : 'Total com IVA';
    document.getElementById('edit-lista-itens').innerHTML = '';
    const itensAtuais = Array.isArray(p.itens) ? p.itens : [];
    // Pedidos anteriores aos códigos por produto: os códigos gerais ficam no primeiro produto
    const codigosGerais = itensAtuais.some(i => i.codigos) ? '' : p.codigos_linhas;
    (itensAtuais.length ? itensAtuais : [{}]).forEach((item, n) =>
        adicionarItemEdicao(n === 0 && codigosGerais ? { ...item, codigos: codigosGerais } : item, false));
    document.getElementById('edit-data-entrega').value = p.data_entrega || '';
    // Pedidos do portal: o cliente vê a nova data como previsão de entrega
    document.getElementById('edit-data-pretendida').innerText = p.data_pretendida
        ? `Data pretendida pelo cliente: ${formatarData(p.data_pretendida)}. Se alterar, o cliente vê a nova data no portal.`
        : '';
    ficheirosEdicao = { imagem: lerUrls(p.arquivo_imagem), dst: lerUrls(p.arquivo_dst) };
    renderizarFicheirosEdicao();
    document.getElementById('msg-editar-pedido').innerText = '';
    document.getElementById('edit-dst').value = '';
    document.getElementById('edit-imagem').value = '';
    modal.style.display = 'flex';
}

// Os pedidos DP não levam IVA, tal como no registo rápido
let edicaoSemIva = false;

// Ao abrir o modal (recalcularValor = false) o valor guardado não é tocado
function adicionarItemEdicao(item = {}, recalcularValor = true) {
    const div = document.createElement('div');
    div.className = 'item-pedido';
    div.itemOriginal = item;
    const comLetraLocal = edicaoSemIva || item.letra || item.local;
    div.innerHTML = `
      <div class="item-linha">
        <div><small>Nome do produto</small><input type="text" class="item-nome" placeholder="Ex: Toalha bordada"></div>
        <button type="button" class="btn-small item-remover" title="Remover" onclick="this.closest('.item-pedido').remove(); atualizarTotaisEdicao();">✕</button>
      </div>
      <small>Descrição</small><input type="text" class="item-descricao" placeholder="Ex: Bordado com nome e anjo">
      <small>Códigos das linhas</small><input type="text" class="item-codigos" placeholder="Ex: 1143, 1000">
      <div class="item-linha">
        <div><small>Cor do artigo</small><input type="text" class="item-cor" placeholder="Ex: Preto"></div>
        <div><small>Género</small><select class="item-genero"><option value="">—</option><option>Masculino</option><option>Feminino</option></select></div>
      </div>
      ${camposTamanhos()}
      ${comLetraLocal ? `
      <div class="item-linha">
        <div><small>Letra</small><input type="text" class="item-letra" placeholder="Ex: Cursiva, Arial"></div>
        <div><small>Local do bordado</small><input type="text" class="item-local" placeholder="Ex: Peito esquerdo, costas"></div>
      </div>` : ''}
      <div class="item-linha">
        <div><small>Qtd.</small><input type="number" class="item-qtd" min="1" step="1" value="1" oninput="atualizarTotaisEdicao()"></div>
        <div><small>Preço unit.${edicaoSemIva ? '' : ' s/ IVA'} (€)</small><input type="number" class="item-preco" min="0" step="0.01" placeholder="0.00" oninput="atualizarTotaisEdicao()"></div>
      </div>
      <div class="item-calculo">
        <span>${edicaoSemIva ? 'Subtotal' : 'Sem IVA'}: <strong class="item-sem-iva">€ 0.00</strong></span>
        ${edicaoSemIva ? '' : `
        <span>IVA 23%: <strong class="item-iva">€ 0.00</strong></span>
        <span>Com IVA: <strong class="item-com-iva">€ 0.00</strong></span>`}
      </div>`;
    div.querySelector('.item-nome').value = item.nome || '';
    div.querySelector('.item-descricao').value = item.descricao || '';
    div.querySelector('.item-codigos').value = item.codigos || '';
    div.querySelector('.item-cor').value = item.cor || '';
    div.querySelector('.item-genero').value = item.genero || '';
    preencherTamanhos(div, item.tamanhos);
    if (comLetraLocal) {
        div.querySelector('.item-letra').value = item.letra || '';
        div.querySelector('.item-local').value = item.local || '';
    }
    if (item.quantidade) div.querySelector('.item-qtd').value = item.quantidade;
    if (item.preco) div.querySelector('.item-preco').value = item.preco;
    document.getElementById('edit-lista-itens').appendChild(div);
    atualizarTotaisEdicao(recalcularValor);
}

function lerItensEdicao() {
    return [...document.querySelectorAll('#edit-lista-itens .item-pedido')].map(div => {
        const quantidade = Math.max(parseInt(div.querySelector('.item-qtd').value) || 1, 1);
        const preco = parseFloat(div.querySelector('.item-preco').value) || 0;
        const semIva = arred(quantidade * preco);
        const iva = edicaoSemIva ? 0 : arred(semIva * TAXA_IVA);
        const letra = div.querySelector('.item-letra');
        const local = div.querySelector('.item-local');
        return {
            ...div.itemOriginal,
            nome: div.querySelector('.item-nome').value.trim(),
            descricao: div.querySelector('.item-descricao').value.trim(),
            codigos: div.querySelector('.item-codigos').value.trim(),
            cor: div.querySelector('.item-cor').value.trim(),
            genero: div.querySelector('.item-genero').value,
            tamanhos: lerTamanhos(div),
            ...(letra && { letra: letra.value.trim(), local: local.value.trim() }),
            quantidade, preco, sem_iva: semIva, iva, com_iva: arred(semIva + iva), _div: div
        };
    });
}

function atualizarTotaisEdicao(recalcularValor = true) {
    const euro = n => `€ ${n.toFixed(2)}`;
    const itens = lerItensEdicao();
    itens.forEach(i => {
        i._div.querySelector('.item-sem-iva').innerText = euro(i.sem_iva);
        if (edicaoSemIva) return;
        i._div.querySelector('.item-iva').innerText = euro(i.iva);
        i._div.querySelector('.item-com-iva').innerText = euro(i.com_iva);
    });
    const t = totaisItens(itens);
    document.getElementById('edit-total-sem-iva').innerText = euro(t.semIva);
    document.getElementById('edit-total-iva').innerText = euro(t.iva);
    document.getElementById('edit-total-com-iva').innerText = euro(t.comIva);
    if (recalcularValor && itens.some(i => i.sem_iva > 0)) document.getElementById('edit-valor').value = t.comIva.toFixed(2);
}

// Links dos ficheiros que o pedido em edição mantém
let ficheirosEdicao = { imagem: [], dst: [] };

function renderizarFicheirosEdicao() {
    ['imagem', 'dst'].forEach(tipo => {
        document.getElementById(`edit-lista-${tipo}`).innerHTML = ficheirosEdicao[tipo].map((url, i) => `
          <div class="ficheiro-atual">
            ${tipo === 'imagem' ? `<img src="${escapar(url)}" alt="">` : ''}
            <a href="${escapar(url)}" target="_blank">${escapar(decodeURIComponent(url.split('?')[0].split('/').pop()))}</a>
            <button type="button" class="btn-small" title="Remover" onclick="removerFicheiroEdicao('${tipo}', ${i})">✕</button>
          </div>`).join('');
    });
}

function removerFicheiroEdicao(tipo, indice) {
    ficheirosEdicao[tipo].splice(indice, 1);
    renderizarFicheirosEdicao();
}

async function guardarEdicaoPedido() {
    const id = document.getElementById('edit-id').value;
    const msg = document.getElementById('msg-editar-pedido');
    const pAntigo = pedidosGlobais.find(item => item.id == id);

    const itens = lerItensEdicao().filter(i => i.nome || i.sem_iva > 0).map(({ _div, ...i }) => i);
    const nomes = lista => lista.map(i => i.nome).filter(Boolean).join(', ');
    // A descrição gerada a partir dos produtos acompanha-os; uma escrita à mão mantém-se
    const descricaoAtual = document.getElementById('edit-descricao').value.trim();
    const descricaoAutomatica = !descricaoAtual || descricaoAtual === nomes(pAntigo.itens || []);

    const formData = new FormData();
    formData.append('descricao', (descricaoAutomatica && nomes(itens)) || descricaoAtual);
    formData.append('itens', JSON.stringify(itens));
    formData.append('codigos_linhas', juntarCodigos(lerItensEdicao()));
    formData.append('valor', document.getElementById('edit-valor').value || 0);
    formData.append('data_entrega', document.getElementById('edit-data-entrega').value || '');
    formData.append('arquivo_dst', JSON.stringify(ficheirosEdicao.dst));
    formData.append('arquivo_imagem', JSON.stringify(ficheirosEdicao.imagem));

    // Reenvia os restantes campos para não serem perdidos
    for (const key in pAntigo) {
        if (!['descricao', 'codigos_linhas', 'valor', 'data_entrega', 'arquivo_dst', 'arquivo_imagem', 'clientes', 'itens'].includes(key)) {
            formData.append(key, pAntigo[key] !== null ? pAntigo[key] : '');
        }
    }

    const inputDst = document.getElementById('edit-dst');
    const inputImagem = document.getElementById('edit-imagem');
    if (!validarLimiteFicheiros(inputDst, ficheirosEdicao.dst.length) ||
        !validarLimiteFicheiros(inputImagem, ficheirosEdicao.imagem.length)) return;
    [...inputDst.files].forEach(f => formData.append('dst', f));
    [...inputImagem.files].forEach(f => formData.append('imagem', f));

    try {
        msg.style.color = '#8C5E3C'; msg.innerText = 'A atualizar pedido...';
        const res = await api(`${URL_API}/pedidos/${id}`, { method: 'PUT', body: formData });
        if (!res.ok) throw new Error('Erro ao atualizar.');

        msg.style.color = 'green'; msg.innerText = 'Pedido atualizado com sucesso.';
        setTimeout(() => {
            document.getElementById('modal-editar-pedido').style.display = 'none';
            carregarPedidos();
        }, 1000);
    } catch (e) {
        msg.style.color = 'red'; msg.innerText = 'Não foi possível guardar as alterações.';
    }
}

// ============================================================================
// 5. ESTOQUE E ESTATÍSTICAS
// ============================================================================

function mudarFormularioEstoque() {
    const cat = document.getElementById('estoque-categoria').value;
    document.getElementById('grupo-fardas-bebe-estoque').style.display = cat === 'Linha' ? 'none' : 'block';
    document.getElementById('grupo-linhas-estoque').style.display = cat === 'Linha' ? 'block' : 'none';
}

async function carregarEstoque() {
    const resposta = await api(`${URL_API}/estoque`);
    estoqueGlobais = await resposta.json();
    renderizarEstoque();
}

function renderizarEstoque() {
    const painel = document.getElementById('lista-estoque');
    painel.innerHTML = '';
    if (estoqueGlobais.length === 0) {
        painel.innerHTML = '<p style="text-align: center; color: #888;">Estoque vazio.</p>';
        return;
    }
    estoqueGlobais.forEach(item => {
        const badgeClass = item.categoria === 'Farda' ? 'bg-farda' : item.categoria === 'Linha' ? 'bg-linha' : 'bg-bebe';
        const detalhe = item.categoria === 'Linha'
            ? `Cor: ${escapar(item.codigo_linha)}`
            : `Tamanho: ${escapar(item.tamanho)} | Marca: ${escapar(item.marca)}`;
        painel.innerHTML += `
      <div style="background:white; padding:15px; margin-bottom:10px; border-radius:6px; display:flex; justify-content:space-between; align-items:center;">
        <div><span class="badge-estoque ${badgeClass}">${escapar(item.categoria)}</span><br><strong>${escapar(item.descricao)}</strong><br><small>${detalhe}</small></div>
        <div style="text-align: right;"><div style="font-weight:bold; margin-bottom:6px;">Qtd: ${escapar(item.quantidade)}</div><button class="btn-small" style="background:#e74c3c;" onclick="apagarEstoque(${item.id})">Eliminar</button></div>
      </div>`;
    });
}

async function guardarEstoque() {
    const categoria = document.getElementById('estoque-categoria').value;
    const descricao = document.getElementById('estoque-descricao').value;
    const quantidade = document.getElementById('estoque-quantidade').value;
    const tamanho = document.getElementById('estoque-tamanho').value;
    const marca = document.getElementById('estoque-marca').value;
    const codigo_linha = document.getElementById('estoque-codigo').value;
    const msg = document.getElementById('msg-estoque');

    if (!descricao) { msg.style.color = 'red'; msg.innerText = 'Preencha a descrição.'; return; }

    try {
        const res = await api(`${URL_API}/estoque`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ categoria, descricao, quantidade, tamanho, marca, codigo_linha })
        });
        if (!res.ok) throw new Error();
        msg.style.color = 'green'; msg.innerText = 'Artigo adicionado ao estoque.';
        ['estoque-descricao', 'estoque-tamanho', 'estoque-marca', 'estoque-codigo']
            .forEach(id => document.getElementById(id).value = '');
        document.getElementById('estoque-quantidade').value = 1;
        setTimeout(() => msg.innerText = '', 3000);
        carregarEstoque();
    } catch (e) {
        msg.style.color = 'red'; msg.innerText = 'Não foi possível guardar o artigo.';
    }
}

async function apagarEstoque(id) {
    if (!confirm('Confirma a remoção deste artigo do estoque?')) return;
    await api(`${URL_API}/estoque/${id}`, { method: 'DELETE' });
    carregarEstoque();
}

// Pedidos dentro do período escolhido (filtra pela data de entrega)
function pedidosDoPeriodo() {
    const inicio = document.getElementById('stat-data-inicio').value;
    const fim = document.getElementById('stat-data-fim').value;
    return pedidosGlobais.filter(p => {
        if (['Orçamento', ESTADO_PORTAL, ESTADO_CANCELADO].includes(p.status)) return false;
        if (!inicio && !fim) return true;
        if (!p.data_entrega) return false;
        if (inicio && p.data_entrega < inicio) return false;
        if (fim && p.data_entrega > fim) return false;
        return true;
    });
}

function ehPedidoDP(p) {
    return !!(p.clientes && p.clientes.nome && p.clientes.nome.trim().toUpperCase() === 'DP');
}

// Quanto falta receber de um pedido ainda não concluído
function valorPorReceber(p) {
    const valor = parseFloat(p.valor || 0);
    if (p.tipo_pagamento === 'Completo') return 0;
    if (p.tipo_pagamento === 'Parcial') return Math.max(valor - parseFloat(p.valor_pago || 0), 0);
    return valor;
}

// Divide o valor de um pedido em base sem IVA e IVA.
// Só os pedidos com produtos (campo itens) têm IVA discriminado; nos antigos o valor
// conta todo como base sem IVA e o pedido é assinalado (semDiscriminacao)
function decomporIva(p) {
    const valor = parseFloat(p.valor || 0);
    if (Array.isArray(p.itens) && p.itens.length) {
        const t = totaisItens(p.itens.map(i => ({ sem_iva: i.sem_iva || 0, iva: i.iva || 0 })));
        if (t.semIva > 0) return { semIva: t.semIva, iva: t.iva, total: t.comIva, semDiscriminacao: false };
        // Pedidos do portal: produtos sem preço por linha; o valor guardado na confirmação inclui IVA
        const semIva = arred(valor / (1 + TAXA_IVA));
        return { semIva, iva: arred(valor - semIva), total: valor, semDiscriminacao: false };
    }
    return { semIva: valor, iva: 0, total: valor, semDiscriminacao: true };
}

function calcularEstatisticasGlobais() {
    const soma = () => ({ semIva: 0, iva: 0, total: 0 });
    const geral = soma(), dp = soma();
    let totalPendente = 0, antigos = 0, valorAntigos = 0;
    // Pedidos DP (incluindo os do portal, que não têm valor: o acerto é no fim do mês)
    let dpConcluidos = 0, dpEmCurso = 0;
    const lista = pedidosDoPeriodo();

    lista.forEach(p => {
        if (ehPedidoDP(p)) p.status === 'Concluído' ? dpConcluidos++ : dpEmCurso++;
        if (p.status === 'Concluído') {
            const v = decomporIva(p);
            [geral, ...(ehPedidoDP(p) ? [dp] : [])].forEach(s => {
                s.semIva += v.semIva; s.iva += v.iva; s.total += v.total;
            });
            if (v.semDiscriminacao) { antigos++; valorAntigos += v.total; }
        } else {
            totalPendente += valorPorReceber(p);
        }
    });

    const euro = n => `€ ${n.toFixed(2)}`;
    const detalhe = s => s.total ? `Sem IVA: ${euro(s.semIva)}\nIVA: ${euro(s.iva)}` : '';
    document.getElementById('stat-faturado').innerText = euro(geral.total);
    document.getElementById('stat-faturado-detalhe').innerText = detalhe(geral);
    document.getElementById('stat-iva').innerText = euro(geral.iva);
    document.getElementById('stat-faturado-dp').innerText = euro(dp.total);
    // Os pedidos DP não levam IVA; o IVA mostrado é só de controlo (23% sobre o valor sem IVA)
    // e não entra no IVA a entregar nem no relatório em Excel
    document.getElementById('stat-faturado-dp-detalhe').innerText =
        `${dpConcluidos} concluído(s) · ${dpEmCurso} em curso` +
        (dp.total ? `\nSem IVA: ${euro(dp.semIva)}\nIVA 23% (controlo): ${euro(arred(dp.semIva * TAXA_IVA))}` : '');
    document.getElementById('stat-pendente').innerText = euro(totalPendente);
    document.getElementById('stat-qtd').innerText = lista.length;

    const aviso = document.getElementById('stat-aviso-iva');
    aviso.style.display = antigos ? 'block' : 'none';
    aviso.innerText = antigos
        ? `${antigos} pedido(s) concluído(s) neste período (${euro(valorAntigos)}) foram registados antes da lista de produtos e não têm IVA discriminado. ` +
          'O valor deles está contado como "sem IVA" e não entra no IVA a entregar.'
        : '';
}

// ---- Relatórios em Excel (um por cartão de estatística) ----
function formatarData(iso) {
    if (!iso) return '';
    const d = iso.split('-');
    return `${d[2]}/${d[1]}/${d[0]}`;
}

function exportarRelatorio(tipo) {
    if (typeof XLSX === 'undefined') {
        alert('Não foi possível carregar a biblioteca de Excel. Verifique a ligação à internet.');
        return;
    }

    const lista = pedidosDoPeriodo();
    const inicio = document.getElementById('stat-data-inicio').value;
    const fim = document.getElementById('stat-data-fim').value;
    let titulo, cabecalho, linhas, totais;

    const base = p => [p.id, p.clientes ? p.clientes.nome : 'Desconhecido', p.descricao || '', formatarData(p.data_entrega)];

    if (tipo === 'dp') {
        // Sem colunas de IVA: o IVA da DP é só de controlo no cartão
        titulo = 'Faturação DP';
        cabecalho = ['Pedido', 'Cliente', 'Descrição', 'Data de Entrega', 'Método de Pagamento', 'Valor (€)'];
        linhas = lista.filter(p => p.status === 'Concluído' && ehPedidoDP(p))
            .map(p => [...base(p), p.metodo_pagamento || '', decomporIva(p).total]);
        totais = ['', '', '', '', 'TOTAL', linhas.reduce((t, l) => t + l[5], 0)];
    } else if (tipo === 'faturacao') {
        const concluidos = lista.filter(p => p.status === 'Concluído');
        titulo = 'Faturação Geral';
        cabecalho = ['Pedido', 'Cliente', 'Descrição', 'Data de Entrega', 'Método de Pagamento', 'Sem IVA (€)', 'IVA 23% (€)', 'Total (€)', 'Observação'];
        linhas = concluidos.map(p => {
            const v = decomporIva(p);
            return [...base(p), p.metodo_pagamento || '', v.semIva, v.iva, v.total, v.semDiscriminacao ? 'Pedido antigo, IVA não discriminado' : ''];
        });
        totais = ['', '', '', '', 'TOTAL',
            linhas.reduce((t, l) => t + l[5], 0),
            linhas.reduce((t, l) => t + l[6], 0),
            linhas.reduce((t, l) => t + l[7], 0), ''];
    } else if (tipo === 'pendente') {
        const abertos = lista.filter(p => p.status !== 'Concluído');
        titulo = 'Por Receber';
        cabecalho = ['Pedido', 'Cliente', 'Descrição', 'Data de Entrega', 'Estado do Pagamento', 'Valor Total (€)', 'Valor Pago (€)', 'Por Receber (€)'];
        linhas = abertos.map(p => {
            const valor = parseFloat(p.valor || 0);
            const aReceber = valorPorReceber(p);
            return [...base(p), p.tipo_pagamento || '', valor, valor - aReceber, aReceber];
        });
        totais = ['', '', '', '', 'TOTAL',
            linhas.reduce((t, l) => t + l[5], 0),
            linhas.reduce((t, l) => t + l[6], 0),
            linhas.reduce((t, l) => t + l[7], 0)];
    } else {
        titulo = 'Pedidos';
        cabecalho = ['Pedido', 'Cliente', 'Descrição', 'Data de Entrega', 'Estado', 'Valor (€)'];
        linhas = lista.map(p => [...base(p), p.status || '', parseFloat(p.valor || 0)]);
        totais = ['', '', '', '', 'TOTAL', linhas.reduce((t, l) => t + l[5], 0)];
    }

    if (linhas.length === 0) {
        alert('Não existem dados para este relatório no período selecionado.');
        return;
    }

    const periodo = (inicio || fim)
        ? `Período: ${inicio ? formatarData(inicio) : 'início'} a ${fim ? formatarData(fim) : 'hoje'}`
        : 'Período: todos os pedidos';

    const folha = XLSX.utils.aoa_to_sheet([
        ['BORDAVEIRO - ' + titulo],
        [periodo],
        [`Gerado em ${new Date().toLocaleDateString('pt-PT')}`],
        [],
        cabecalho,
        ...linhas,
        totais
    ]);

    folha['!cols'] = cabecalho.map((_, i) => ({ wch: i === 2 ? 38 : i === 1 ? 26 : 18 }));

    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, folha, titulo.substring(0, 31));
    const hoje = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(livro, `Bordaveiro_${titulo.replace(/\s+/g, '_')}_${hoje}.xlsx`);
}

function limparFiltroEstatisticas() {
    document.getElementById('stat-data-inicio').value = '';
    document.getElementById('stat-data-fim').value = '';
    calcularEstatisticasGlobais();
}

// ============================================================================
// 6. GERADOR DE PDF (jsPDF)
// ============================================================================

// Logo para o PDF, recortado das margens brancas (carregado uma vez)
let logoPDF;
function carregarLogoPDF() {
    if (!logoPDF) logoPDF = new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
            try {
                const c = document.createElement('canvas');
                c.width = img.naturalWidth; c.height = img.naturalHeight;
                const ctx = c.getContext('2d');
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, c.width, c.height);
                ctx.drawImage(img, 0, 0);
                const px = ctx.getImageData(0, 0, c.width, c.height).data;
                let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
                for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
                    const i = (y * c.width + x) * 4;
                    if (px[i] < 235 || px[i + 1] < 235 || px[i + 2] < 235) {
                        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
                    }
                }
                if (x1 < 0) return resolve(null);
                const r = document.createElement('canvas');
                r.width = x1 - x0 + 1; r.height = y1 - y0 + 1;
                r.getContext('2d').drawImage(c, x0, y0, r.width, r.height, 0, 0, r.width, r.height);
                resolve({ dados: r.toDataURL('image/png'), proporcao: r.width / r.height });
            } catch (e) { resolve(null); }
        };
        img.onerror = () => resolve(null);
        img.src = 'logo.png';
    });
    return logoPDF;
}

const MAX_LADO_IMAGEM_PDF = 900; // píxeis

// Imagem do desenho (PNG) para o PDF; devolve null se não carregar
async function carregarImagemPDF(url) {
    try {
        const blob = await (await fetch(url)).blob();
        const bitmap = await createImageBitmap(blob);
        // Reduz e comprime: as imagens ocupam até 32 mm de altura e são o que mais pesa no PDF
        const escala = Math.min(MAX_LADO_IMAGEM_PDF / Math.max(bitmap.width, bitmap.height), 1);
        const c = document.createElement('canvas');
        c.width = Math.round(bitmap.width * escala); c.height = Math.round(bitmap.height * escala);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(bitmap, 0, 0, c.width, c.height);
        return { dados: c.toDataURL('image/jpeg', 0.85), proporcao: c.width / c.height };
    } catch (e) {
        return null;
    }
}

// Pensado para impressora laser a preto e branco: sem fundos cheios, só o logo e linhas finas
async function gerarPDF(id) {
    const { jsPDF } = window.jspdf;
    const p = pedidosGlobais.find(item => item.id === id);
    if (!p) return;
    const [logo, ...imagens] = await Promise.all([carregarLogoPDF(), ...lerUrls(p.arquivo_imagem).map(carregarImagemPDF)]);
    const desenhos = imagens.filter(Boolean);

    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const CASTANHO = [140, 94, 60];
    const CINZA = [85, 85, 85];
    const VERMELHO = [192, 38, 38];
    const MARGEM = 14, DIREITA = 196;
    const euro = n => `€ ${(parseFloat(n) || 0).toFixed(2)}`;

    // ---------- Dados do pedido ----------
    const nomeCliente = p.clientes ? p.clientes.nome : 'Desconhecido';
    const telefone = p.clientes && p.clientes.telefone ? p.clientes.telefone : '-';
    const dataDoc = p.data_pedido ? formatarData(p.data_pedido.slice(0, 10)) : new Date().toLocaleDateString('pt-PT');
    const dataEntrega = p.data_entrega ? formatarData(p.data_entrega) : 'a combinar';
    const qtd = parseInt(p.quantidade_artigo) || 1;
    const valorTotal = parseFloat(p.valor) || 0;
    const origem = p.origem_artigo === 'Bordaveiro'
        ? `(Artigo Bordaveiro${p.marca_artigo ? ' - ' + p.marca_artigo : ''})`
        : '(Artigo do Cliente)';
    const tamanhos = p.tamanhos_artigo ? p.tamanhos_artigo : '-';

    // ---------- PÁGINA 1: cabeçalho ----------
    if (logo) {
        const altura = 24, largura = Math.min(altura * logo.proporcao, 90);
        doc.addImage(logo.dados, 'PNG', 105 - largura / 2, 6, largura, largura / logo.proporcao);
    } else {
        doc.setTextColor(...CASTANHO);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(26);
        doc.text('BORDAVEIRO', 105, 19, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.text('Personalização e Bordados', 105, 26.5, { align: 'center' });
    }
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(MARGEM, 33, DIREITA, 33);

    // ---------- Título e número ----------
    doc.setTextColor(...CASTANHO);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(p.status === 'Orçamento' ? 'ORÇAMENTO' : 'ORÇAMENTO / PEDIDO', MARGEM, 44);

    doc.setTextColor(60, 60, 60);
    doc.setFontSize(12);
    doc.text(`Nº ${p.id}`, DIREITA, 43, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(110, 110, 110);
    doc.text(`Data: ${dataDoc}`, DIREITA, 48, { align: 'right' });

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(MARGEM, 53, DIREITA, 53);

    // ---------- Cliente ----------
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('A Sra. / Sr.:', MARGEM, 60);
    doc.text('Telemóvel:', MARGEM, 66);
    doc.setFont('helvetica', 'normal');
    doc.text(nomeCliente, 43, 60);
    doc.text(String(telefone), 39, 66);

    // ---------- Imagens do desenho (à direita do cliente) ----------
    let inicioTabela = 79;
    if (desenhos.length) {
        const X0 = 100, TOPO = 57, ALTURA = 32, ESPACO = 3;
        const largCaixa = (DIREITA - X0 - ESPACO * (desenhos.length - 1)) / desenhos.length;
        desenhos.forEach((img, i) => {
            // Encaixa a imagem na caixa mantendo a proporção, encostada à direita
            let w = largCaixa, h = w / img.proporcao;
            if (h > ALTURA) { h = ALTURA; w = h * img.proporcao; }
            const x = X0 + i * (largCaixa + ESPACO) + (largCaixa - w);
            doc.addImage(img.dados, 'JPEG', x, TOPO + (ALTURA - h) / 2, w, h);
        });
        inicioTabela = TOPO + ALTURA + 7;
    }

    // ---------- Tabela ----------
    const itens = Array.isArray(p.itens) ? p.itens : [];
    const estiloTabela = {
        startY: inicioTabela,
        margin: { left: MARGEM, right: 14 },
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 10, textColor: CINZA, lineColor: [200, 200, 200], lineWidth: 0.2, cellPadding: { top: 6, bottom: 6, left: 5, right: 4 } },
        headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 9.5, lineColor: [120, 120, 120], lineWidth: { bottom: 0.5 }, cellPadding: { top: 5, bottom: 5, left: 5, right: 4 } }
    };

    if (itens.length) {
        doc.autoTable({
            ...estiloTabela,
            head: [['PRODUTO / DESCRIÇÃO', 'QTD.', 'PREÇO S/ IVA', 'IVA 23%', 'TOTAL']],
            body: itens.map(i => [
                [i.nome, i.descricao, corTamanhos(i), letraLocal(i)].filter(Boolean).join('\n'),
                String(i.quantidade),
                euro(i.preco),
                euro(i.iva),
                euro(i.com_iva)
            ]),
            columnStyles: {
                0: { cellWidth: 72 },
                1: { cellWidth: 20, halign: 'center' },
                2: { cellWidth: 32, halign: 'right' },
                3: { cellWidth: 28, halign: 'right' },
                4: { cellWidth: 30, halign: 'right' }
            }
        });
    } else {
        doc.autoTable({
            ...estiloTabela,
            head: [['NOME DO PRODUTO / SERVIÇO', 'TAMANHO / QTD', 'PREÇO', 'SUB-TOTAL']],
            body: [[
                `${p.descricao || ''}\n${origem}`,
                `${tamanhos} / ${qtd} un.`,
                euro(valorTotal / qtd),
                euro(valorTotal)
            ]],
            columnStyles: {
                0: { cellWidth: 90 },
                1: { cellWidth: 38.5 },
                2: { cellWidth: 25.5 },
                3: { cellWidth: 28 }
            }
        });
    }

    // ---------- Total ----------
    let y = doc.lastAutoTable.finalY + 9;
    if (itens.length) {
        const t = totaisItens(itens);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(...CINZA);
        doc.text('Total sem IVA:', 160, y, { align: 'right' });
        doc.text(euro(t.semIva), DIREITA, y, { align: 'right' });
        y += 6;
        doc.text('IVA (23%):', 160, y, { align: 'right' });
        doc.text(euro(t.iva), DIREITA, y, { align: 'right' });
        y += 8;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text('TOTAL A PAGAR:', 160, y, { align: 'right' });
    doc.setFontSize(14);
    doc.setTextColor(...CASTANHO);
    doc.text(euro(itens.length ? totaisItens(itens).comIva : valorTotal), DIREITA, y, { align: 'right' });

    // ---------- Dados de pagamento ----------
    y += 17;
    doc.setDrawColor(200, 200, 200);
    doc.line(MARGEM, y, DIREITA, y);
    y += 7;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text('DADOS PARA PAGAMENTO:', MARGEM, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    ['Nome: MARIA CECÍLIA S. SOUZA',
     'Conta: 0286012420730',
     'IBAN: PT50 0035 0286 0001 2420 7307 6',
     'MBWay: 915 831 169'].forEach(linha => { y += 5.2; doc.text(linha, MARGEM, y); });

    // ---------- PÁGINA 2: termos e condições ----------
    doc.addPage();
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('TERMOS DE SERVIÇO E CONDIÇÕES DO ORÇAMENTO', 105, 11, { align: 'center' });
    doc.setDrawColor(120, 120, 120);
    doc.setLineWidth(0.4);
    doc.line(MARGEM, 14, DIREITA, 14);

    // estilo: 'n' normal, 'v' vermelho normal, 'vb' vermelho negrito
    const secoes = [
        ['1. Prazos e Validade', [
            ['n', `Prazo de Execução e Entrega estimado: ${dataEntrega} (Até 10 dias úteis).`],
            ['vb', 'ORÇAMENTO VÁLIDO POR 15 DIAS.'],
            ['n', 'Para outras quantidades ou execução parcial, favor solicitar novo orçamento.']
        ]],
        ['2. Condições Técnicas e Materiais', [
            ['n', 'Trabalhamos com linhas Madeira 100% Polyester.'],
            ['n', 'O bordado é feito com linhas, portanto tentamos aproximar ao máximo da realidade da cor e desenho.\n  O cliente tem conhecimento que pode ocorrer uma pequena diferença entre o apresentado e a realidade.'],
            ['n', 'O cliente fica responsável por definir as cores e confirmá-las.'],
            ['n', 'Na hipótese de o cliente fornecer o material a ser bordado, deverá sempre atentar às nossas orientações.'],
            ['n', 'Para que o bordado tenha um bom resultado, é imprescindível que o material (tecido) tenha boa\n  qualidade/gramagem.']
        ]],
        ['3. Responsabilidades e Riscos', [
            ['vb', 'Como o bordado é eletrónico, não nos responsabilizamos caso ocorram acidentes na execução\n  do trabalho que acabem por danificar o têxtil. O Cliente é responsável por repor a peça.'],
            ['vb', 'É da responsabilidade do Cliente os custos com transportes.'],
            ['vb', 'Não nos responsabilizamos por atrasos, danos ou extravios no transporte.']
        ]],
        ['4. Valores e Pagamentos', [
            ['n', 'Os valores apresentados podem sofrer alterações sem aviso prévio.'],
            itens.length
                ? ['v', 'Os valores apresentados incluem IVA à taxa de 23%.']
                : ['v', 'Aos valores apresentados acresce o IVA à taxa em vigor.'],
            ['n', 'Condição de Pagamento: O prazo de execução começará a contar a partir da conclusão e\n  pagamento do processo.']
        ]]
    ];

    y = 23;
    secoes.forEach(([titulo, itens]) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        doc.text(titulo, MARGEM, y);
        y += 6;

        itens.forEach(([estilo, texto]) => {
            doc.setFontSize(9);
            if (estilo === 'n') { doc.setFont('helvetica', 'normal'); doc.setTextColor(...CINZA); }
            if (estilo === 'v') { doc.setFont('helvetica', 'normal'); doc.setTextColor(...VERMELHO); }
            if (estilo === 'vb') { doc.setFont('helvetica', 'bold'); doc.setTextColor(...VERMELHO); }
            texto.split('\n').forEach((linha, i) => {
                doc.text(i === 0 ? `• ${linha}` : linha, MARGEM, y);
                y += 5;
            });
        });
        y += 6;
    });

    // ---------- Rodapé ----------
    doc.setDrawColor(160, 160, 160);
    doc.setLineWidth(0.3);
    doc.line(MARGEM, 274.5, DIREITA, 274.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(140, 140, 140);
    doc.text('Bordaveiro - Documento gerado eletronicamente', 105, 281, { align: 'center' });

    doc.save(`Bordaveiro_Pedido_${p.id}.pdf`);
    await guardarPDFNaNuvem(p.id, doc.output('blob'));
}

// Substitui o PDF guardado do pedido; o ficheiro descarregado não depende disto
async function guardarPDFNaNuvem(id, pdf) {
    const formData = new FormData();
    formData.append('pdf', pdf, `Bordaveiro_Pedido_${id}.pdf`);
    try {
        const res = await api(`${URL_API}/pedidos/${id}/pdf`, { method: 'POST', body: formData });
        if (!res.ok) throw new Error('Falha ao guardar.');
        await carregarPedidos();
    } catch (e) {
        alert('O PDF foi descarregado, mas não foi possível guardá-lo na nuvem.');
    }
}