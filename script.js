// ============================================================================
// BORDAVEIRO - JAVASCRIPT PRINCIPAL
// ============================================================================

// --- VARIÁVEIS GLOBAIS ---
const URL_API = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';
let abaAtual = 'pendentes';
let pedidosGlobais = [];
let estoqueGlobais = [];
let clientesGlobais = [];

window.onload = () => {
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
        const resposta = await fetch('/auth/login', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        email: emailDigitado,   // Certifica-te de que a chave é 'email'
        senha: senhaDigitada    // Certifica-te de que a chave é 'senha'
    })
});

        const dados = await resposta.json();

        if (resposta.ok) {
            localStorage.setItem('token_bordaveiro', dados.token);
            localStorage.setItem('perfil_bordaveiro', dados.perfil);
            mostrarDashboard();
        } else {
            msgErro.innerText = dados.erro || 'Não foi possível iniciar sessão.';
            msgErro.style.display = 'block';
        }
    } catch (e) {
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
    ['pedidos', 'estoque', 'estatisticas', 'admin'].forEach(p => {
        document.getElementById(`pagina-${p}`).style.display = 'none';
        document.getElementById(`nav-${p}`).className = 'btn-nav btn-nav-inactive';
    });

    const displayMode = (pagina === 'estatisticas') ? 'block' : 'grid';
    document.getElementById(`pagina-${pagina}`).style.display = displayMode;
    document.getElementById(`nav-${pagina}`).className = 'btn-nav btn-nav-active';

    if (pagina === 'pedidos') carregarPedidos();
    if (pagina === 'estoque') carregarEstoque();
    if (pagina === 'estatisticas') carregarPedidos().then(calcularEstatisticasGlobais);
    if (pagina === 'admin') carregarUtilizadores();
}

// ============================================================================
// 2. GESTÃO DE UTILIZADORES (ADMIN)
// ============================================================================

async function carregarUtilizadores() {
    try {
        const resposta = await fetch(`${URL_API}/utilizadores`);
        const users = await resposta.json();
        const div = document.getElementById('lista-utilizadores');
        div.innerHTML = '';

        if (users.length === 0) {
            div.innerHTML = '<p style="text-align: center; color: #888;">Nenhum utilizador encontrado.</p>';
            return;
        }

        users.forEach(u => {
            const cor = u.perfil === 'admin' ? '#3e1f16' : '#8C5E3C';
            div.innerHTML += `
        <div style="background: white; padding: 12px; border-left: 4px solid ${cor}; margin-bottom: 10px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <div>
            <strong style="color: #4A2511;">${escapar(u.nome)}</strong>
            <span style="font-size: 11px; background: #eee; padding: 2px 6px; border-radius: 4px; margin-left: 5px;">${escapar(u.perfil).toUpperCase()}</span>
            <br><small style="color: #666;">${escapar(u.email)}</small>
          </div>
          ${u.email !== 'admin@bordaveiro.pt' ? `<button onclick="apagarUtilizador(${u.id})" class="btn-small" style="background: #e74c3c;">Eliminar</button>` : ''}
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
    const msg = document.getElementById('msg-novo-user');

    if (!nome || !email || !senha) {
        msg.style.color = 'red'; msg.innerText = 'Preencha todos os campos.'; return;
    }

    try {
        msg.style.color = '#8C5E3C'; msg.innerText = 'A criar conta...';
        const resposta = await fetch(`${URL_API}/utilizadores`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, email, senha, perfil })
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

async function apagarUtilizador(id) {
    if (!confirm('Confirma a eliminação desta conta? Esta ação não pode ser revertida.')) return;
    await fetch(`${URL_API}/utilizadores/${id}`, { method: 'DELETE' });
    carregarUtilizadores();
}

// ============================================================================
// 3. CLIENTES E ANIVERSÁRIOS
// ============================================================================

async function carregarClientes() {
    const resposta = await fetch(`${URL_API}/clientes`);
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
        const res = await fetch(`${URL_API}/clientes`, {
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
    ['pendentes', 'concluidos', 'orcamentos'].forEach(a => {
        document.getElementById(`tab-${a}`).className = a === aba ? 'tab-btn tab-active' : 'tab-btn tab-inactive';
    });
    renderizarPedidos();
}

async function carregarPedidos() {
    const resposta = await fetch(`${URL_API}/pedidos`);
    pedidosGlobais = await resposta.json();
    renderizarPedidos();
}

function renderizarPedidos() {
    const painel = document.getElementById('lista-pedidos');
    painel.innerHTML = '';

    const totalOrcamentos = pedidosGlobais.filter(p => p.status === 'Orçamento').length;
    document.getElementById('tab-orcamentos').innerText = totalOrcamentos > 0 ? `Orçamentos (${totalOrcamentos})` : 'Orçamentos';

    const textoPesquisa = document.getElementById('pesquisa-pedidos').value.toLowerCase();
    const dataDe = document.getElementById('filtro-data-de').value;
    const dataAte = document.getElementById('filtro-data-ate').value;

    const filtrados = pedidosGlobais.filter(p => {
        let naAba;
        if (abaAtual === 'orcamentos') naAba = p.status === 'Orçamento';
        else if (abaAtual === 'concluidos') naAba = p.status === 'Concluído';
        else naAba = p.status !== 'Concluído' && p.status !== 'Orçamento';
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
        const corBorda = p.status === 'Concluído' ? '#27ae60' : ehOrcamento ? '#E5A83B' : '#8C5E3C';

        const btnConcluir = ehOrcamento
            ? `<button class="btn-small" style="background:#27ae60;" onclick="aprovarOrcamento(${p.id})">Aprovar e criar pedido</button>`
            : p.status !== 'Concluído'
            ? `<button class="btn-small" style="background:#27ae60;" onclick="mudarStatus(${p.id}, 'Concluído')">Concluir</button>`
            : `<button class="btn-small" style="background:#B08D6A;" onclick="mudarStatus(${p.id}, 'Pendente')">Reabrir</button>`;

        let btnWhatsApp = '';
        if (p.status === 'Concluído' && p.clientes && p.clientes.telefone) {
            const primeiroNome = p.clientes.nome.split(' ')[0];
            const texto = `Olá, ${primeiroNome}. Informamos que o seu pedido na Bordaveiro ("${p.descricao}") está concluído e disponível para levantamento. Obrigado pela preferência.`;
            const link = ligacaoWhatsApp(p.clientes.telefone, texto);
            btnWhatsApp = `<button class="btn-small" style="background:#25D366;" onclick="window.open(this.dataset.link, '_blank')" data-link="${escapar(link)}">Notificar cliente</button>`;
        }

        const btnEditar = `<button class="btn-small" style="background:#f39c12;" onclick="abrirEditarPedido(${p.id})">Editar</button>`;

        let botaoDst = '';
        if (p.arquivo_dst) {
            botaoDst = `<a href="${escapar(p.arquivo_dst)}" target="_blank" class="btn-small" style="background:#3498db;">Descarregar DST</a>`;
        }

        const miniatura = p.arquivo_imagem
            ? `<a href="${escapar(p.arquivo_imagem)}" target="_blank" title="Abrir imagem completa">
                 <img class="thumb-pedido" src="${escapar(p.arquivo_imagem)}" alt="Imagem do pedido ${p.id}" loading="lazy">
               </a>`
            : '';

        let dataFormatada = 'Sem data';
        if (p.data_entrega) {
            const d = p.data_entrega.split('-');
            dataFormatada = `${d[2]}/${d[1]}/${d[0]}`;
        }

        painel.innerHTML += `
      <div style="border-left: 5px solid ${corBorda}; background: white; padding: 15px; margin-bottom: 12px; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
        <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom: 8px; gap: 10px; flex-wrap: wrap;">
          <strong style="font-size: 15px; color: #4A2511;">#${p.id} - ${escapar(p.descricao)}${ehOrcamento ? ' <span style="font-size:11px; background:#E5A83B; color:white; padding:2px 6px; border-radius:4px; margin-left:4px;">ORÇAMENTO</span>' : ''}</strong>
          <div style="display:flex; gap:6px; flex-wrap: wrap;">${botaoDst}<button class="btn-small" style="background:#A67B5B;" onclick="gerarPDF(${p.id})">Gerar PDF</button></div>
        </div>
        <div class="pedido-corpo">
          ${miniatura}
          <p style="margin:2px 0; font-size:13px; color:#555;">
            <strong>Cliente:</strong> ${p.clientes ? escapar(p.clientes.nome) : 'Desconhecido'}<br>
            <strong>Valor:</strong> € ${escapar(p.valor)} | <strong>Entrega:</strong> ${dataFormatada}
          </p>
        </div>
        <div style="display:flex; gap:10px; margin-top:12px; flex-wrap: wrap;">
          ${btnConcluir} ${btnWhatsApp} ${btnEditar}
          <button class="btn-small" style="background:#e74c3c;" onclick="apagarPedido(${p.id})">Eliminar</button>
        </div>
      </div>`;
    });
}

function limparFiltroCalendarioPedidos() {
    document.getElementById('filtro-data-de').value = '';
    document.getElementById('filtro-data-ate').value = '';
    renderizarPedidos();
}

function limparFormularioPedido() {
    ['pesquisa-cliente-input', 'novo-cliente-id', 'nova-descricao', 'novo-valor', 'nova-linha',
     'novo-valor-pago', 'nova-imagem', 'novo-dst', 'nova-data-producao', 'nova-data-entrega']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
}

function cancelarEdicao() {
    limparFormularioPedido();
    document.getElementById('btn-cancelar-edicao').style.display = 'none';
}

function construirFormDataPedido(clienteId, status) {
    const formData = new FormData();
    formData.append('cliente_id', clienteId);
    formData.append('status', status);
    formData.append('descricao', document.getElementById('nova-descricao').value);
    formData.append('origem_artigo', document.getElementById('nova-origem').value);
    formData.append('codigos_linhas', document.getElementById('nova-linha').value);
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

    const inputDst = document.getElementById('novo-dst');
    if (inputDst && inputDst.files[0]) formData.append('dst', inputDst.files[0]);

    const inputImagem = document.getElementById('nova-imagem');
    if (inputImagem && inputImagem.files[0]) formData.append('imagem', inputImagem.files[0]);

    return formData;
}

// Guarda um pedido (status 'Pendente') ou um orçamento (status 'Orçamento')
async function guardarPedido(status = 'Pendente') {
    const ehOrcamento = status === 'Orçamento';
    const clienteId = document.getElementById('novo-cliente-id').value;
    const msg = document.getElementById('msg-novo-pedido');

    if (!clienteId) { msg.style.color = 'red'; msg.innerText = 'Selecione um cliente.'; return; }
    if (ehOrcamento && (!document.getElementById('nova-descricao').value || !(parseFloat(document.getElementById('novo-valor').value) > 0))) {
        msg.style.color = 'red'; msg.innerText = 'Para gerar o orçamento, preencha a descrição e o valor.'; return;
    }

    try {
        msg.style.color = '#8C5E3C';
        msg.innerText = ehOrcamento ? 'A gerar orçamento...' : 'A guardar pedido...';
        const res = await fetch(`${URL_API}/pedidos`, { method: 'POST', body: construirFormDataPedido(clienteId, status) });
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
        const res = await fetch(`${URL_API}/pedidos/${id}/status`, {
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
    await fetch(`${URL_API}/pedidos/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: novoStatus })
    });
    carregarPedidos();
}

async function apagarPedido(id) {
    if (!confirm('Confirma a eliminação deste pedido? Esta ação não pode ser revertida.')) return;
    await fetch(`${URL_API}/pedidos/${id}`, { method: 'DELETE' });
    carregarPedidos();
}

// --- Pedido rápido DP ---
function abrirModalDP() { document.getElementById('modal-dp').style.display = 'flex'; }
function fecharModalDP() { document.getElementById('modal-dp').style.display = 'none'; }

async function criarPedidoDP() {
    const msg = document.getElementById('msg-dp-pedido');
    const descricao = document.getElementById('dp-descricao').value;
    const valor = document.getElementById('dp-valor').value;
    const dataEntrega = document.getElementById('dp-data-entrega').value;

    const dp = clientesGlobais.find(c => c.nome.trim().toUpperCase() === 'DP');
    if (!dp) {
        msg.style.color = 'red';
        msg.innerText = 'Não existe um cliente com o nome "DP". Crie-o primeiro em "Novo Cliente".';
        return;
    }
    if (!descricao || !valor) {
        msg.style.color = 'red'; msg.innerText = 'Preencha a descrição e o valor.'; return;
    }

    const formData = new FormData();
    formData.append('cliente_id', dp.id);
    formData.append('descricao', descricao);
    formData.append('origem_artigo', 'Cliente');
    formData.append('valor', valor);
    formData.append('data_entrega', dataEntrega || '');
    formData.append('tipo_pagamento', 'Na Entrega');
    formData.append('metodo_pagamento', 'Numerário');

    try {
        msg.style.color = '#8C5E3C'; msg.innerText = 'A guardar...';
        const res = await fetch(`${URL_API}/pedidos`, { method: 'POST', body: formData });
        if (!res.ok) throw new Error('Falha ao guardar.');

        ['dp-descricao', 'dp-valor', 'dp-data-entrega'].forEach(id => document.getElementById(id).value = '');
        msg.innerText = '';
        fecharModalDP();
        carregarPedidos();
    } catch (e) {
        msg.style.color = 'red'; msg.innerText = 'Não foi possível guardar o pedido. Tente novamente.';
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
        <input type="hidden" id="edit-arquivo-dst-atual">

        <div class="input-group">
          <label>Descrição</label>
          <input type="text" id="edit-descricao">
        </div>
        <div class="input-group">
          <label>Códigos das Linhas</label>
          <input type="text" id="edit-linhas">
        </div>
        <div class="input-group">
          <label>Valor (€)</label>
          <input type="number" step="0.01" id="edit-valor">
        </div>
        <div class="input-group">
          <label>Atualizar Imagem PNG (opcional)</label>
          <input type="file" id="edit-imagem" accept="image/png">
        </div>
        <div class="input-group">
          <label>Atualizar Ficheiro DST (opcional)</label>
          <input type="file" id="edit-dst" accept=".dst">
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
    document.getElementById('edit-linhas').value = p.codigos_linhas || '';
    document.getElementById('edit-valor').value = p.valor || '';
    document.getElementById('edit-arquivo-dst-atual').value = p.arquivo_dst || '';
    document.getElementById('msg-editar-pedido').innerText = '';
    document.getElementById('edit-dst').value = '';
    document.getElementById('edit-imagem').value = '';
    modal.style.display = 'flex';
}

async function guardarEdicaoPedido() {
    const id = document.getElementById('edit-id').value;
    const msg = document.getElementById('msg-editar-pedido');
    const pAntigo = pedidosGlobais.find(item => item.id == id);

    const formData = new FormData();
    formData.append('descricao', document.getElementById('edit-descricao').value);
    formData.append('codigos_linhas', document.getElementById('edit-linhas').value);
    formData.append('valor', document.getElementById('edit-valor').value || 0);
    formData.append('arquivo_dst', document.getElementById('edit-arquivo-dst-atual').value);

    // Reenvia os restantes campos (incluindo arquivo_imagem atual) para não serem perdidos
    for (const key in pAntigo) {
        if (!['descricao', 'codigos_linhas', 'valor', 'arquivo_dst', 'clientes'].includes(key)) {
            formData.append(key, pAntigo[key] !== null ? pAntigo[key] : '');
        }
    }

    const inputDst = document.getElementById('edit-dst');
    if (inputDst.files[0]) formData.append('dst', inputDst.files[0]);

    const inputImagem = document.getElementById('edit-imagem');
    if (inputImagem.files[0]) formData.append('imagem', inputImagem.files[0]);

    try {
        msg.style.color = '#8C5E3C'; msg.innerText = 'A atualizar pedido...';
        const res = await fetch(`${URL_API}/pedidos/${id}`, { method: 'PUT', body: formData });
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
    const resposta = await fetch(`${URL_API}/estoque`);
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
        const res = await fetch(`${URL_API}/estoque`, {
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
    await fetch(`${URL_API}/estoque/${id}`, { method: 'DELETE' });
    carregarEstoque();
}

// Pedidos dentro do período escolhido (filtra pela data de entrega)
function pedidosDoPeriodo() {
    const inicio = document.getElementById('stat-data-inicio').value;
    const fim = document.getElementById('stat-data-fim').value;
    return pedidosGlobais.filter(p => {
        if (p.status === 'Orçamento') return false;
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

function calcularEstatisticasGlobais() {
    let totalFaturado = 0, faturadoDP = 0, totalPendente = 0;
    const lista = pedidosDoPeriodo();

    lista.forEach(p => {
        const valorPed = parseFloat(p.valor || 0);
        if (p.status === 'Concluído') {
            totalFaturado += valorPed;
            if (ehPedidoDP(p)) faturadoDP += valorPed;
        } else {
            totalPendente += valorPorReceber(p);
        }
    });

    document.getElementById('stat-faturado').innerText = `€ ${totalFaturado.toFixed(2)}`;
    document.getElementById('stat-faturado-dp').innerText = `€ ${faturadoDP.toFixed(2)}`;
    document.getElementById('stat-pendente').innerText = `€ ${totalPendente.toFixed(2)}`;
    document.getElementById('stat-qtd').innerText = lista.length;
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

    if (tipo === 'faturacao' || tipo === 'dp') {
        const concluidos = lista.filter(p => p.status === 'Concluído' && (tipo === 'faturacao' || ehPedidoDP(p)));
        titulo = tipo === 'dp' ? 'Faturação DP' : 'Faturação Geral';
        cabecalho = ['Pedido', 'Cliente', 'Descrição', 'Data de Entrega', 'Método de Pagamento', 'Valor (€)'];
        linhas = concluidos.map(p => [...base(p), p.metodo_pagamento || '', parseFloat(p.valor || 0)]);
        totais = ['', '', '', '', 'TOTAL', linhas.reduce((t, l) => t + l[5], 0)];
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

function gerarPDF(id) {
    const { jsPDF } = window.jspdf;
    const p = pedidosGlobais.find(item => item.id === id);
    if (!p) return;

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const CASTANHO = [140, 94, 60];
    const CINZA = [85, 85, 85];
    const VERMELHO = [192, 38, 38];
    const MARGEM = 14, DIREITA = 196;
    const euro = n => `€ ${(parseFloat(n) || 0).toFixed(2)}`;

    // ---------- Dados do pedido ----------
    const nomeCliente = p.clientes ? p.clientes.nome : 'Desconhecido';
    const telefone = p.clientes && p.clientes.telefone ? p.clientes.telefone : '-';
    const dataDoc = p.created_at ? formatarData(p.created_at.slice(0, 10)) : new Date().toLocaleDateString('pt-PT');
    const dataEntrega = p.data_entrega ? formatarData(p.data_entrega) : 'a combinar';
    const qtd = parseInt(p.quantidade_artigo) || 1;
    const valorTotal = parseFloat(p.valor) || 0;
    const origem = p.origem_artigo === 'Bordaveiro'
        ? `(Artigo Bordaveiro${p.marca_artigo ? ' - ' + p.marca_artigo : ''})`
        : '(Artigo do Cliente)';
    const tamanhos = p.tamanhos_artigo ? p.tamanhos_artigo : '-';

    // ---------- PÁGINA 1: cabeçalho ----------
    doc.setFillColor(...CASTANHO);
    doc.rect(0, 0, 210, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(26);
    doc.text('BORDAVEIRO', 105, 19, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(240, 228, 216);
    doc.text('Personalização e Bordados', 105, 26.5, { align: 'center' });

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

    // ---------- Tabela ----------
    doc.autoTable({
        startY: 79,
        margin: { left: MARGEM, right: 14 },
        theme: 'grid',
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
        },
        styles: { font: 'helvetica', fontSize: 10, textColor: CINZA, lineColor: [200, 200, 200], lineWidth: 0.2, cellPadding: { top: 6, bottom: 6, left: 5, right: 4 } },
        headStyles: { fillColor: CASTANHO, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9.5, lineWidth: 0, cellPadding: { top: 5, bottom: 5, left: 5, right: 4 } }
    });

    // ---------- Total ----------
    let y = doc.lastAutoTable.finalY + 9;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text('TOTAL A PAGAR:', 160, y, { align: 'right' });
    doc.setFontSize(14);
    doc.setTextColor(...CASTANHO);
    doc.text(euro(valorTotal), DIREITA, y, { align: 'right' });

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
    doc.setFillColor(...CASTANHO);
    doc.rect(0, 0, 210, 15, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('TERMOS DE SERVIÇO E CONDIÇÕES DO ORÇAMENTO', 105, 9, { align: 'center' });

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
            ['v', 'Aos valores apresentados acresce o IVA à taxa em vigor.'],
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
    doc.setDrawColor(...CASTANHO);
    doc.setLineWidth(1);
    doc.line(MARGEM, 274.5, DIREITA, 274.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(140, 140, 140);
    doc.text('Bordaveiro - Documento gerado eletronicamente', 105, 281, { align: 'center' });

    doc.save(`Bordaveiro_Pedido_${p.id}.pdf`);
}