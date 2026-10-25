// ============================================================================
// BORDAVEIRO - PORTAL DO CLIENTE
// ============================================================================

const ehLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname) || window.location.protocol === 'file:';
const URL_API = ehLocal && window.location.port !== '3000' ? 'http://localhost:3000' : '';
const MAX_FICHEIROS = 6;
const MAX_TAMANHO = 15 * 1024 * 1024;
const EXTENSOES_PORTAL = /\.(png|jpe?g|pdf|dst|emb)$/i;

// Sessão própria do portal, separada da app da equipa
const CHAVE_TOKEN = 'token_portal';
const CHAVE_NOME = 'nome_portal';

window.onload = () => {
    if (localStorage.getItem(CHAVE_TOKEN)) mostrarPortal();
};

function escapar(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

function formatarData(iso) {
    if (!iso) return '';
    const d = iso.slice(0, 10).split('-');
    return `${d[2]}/${d[1]}/${d[0]}`;
}

async function api(url, opcoes = {}) {
    const resposta = await fetch(url, {
        ...opcoes,
        headers: { ...(opcoes.headers || {}), Authorization: `Bearer ${localStorage.getItem(CHAVE_TOKEN)}` }
    });
    if (resposta.status === 401) {
        if (!api.sessaoTerminada) {
            api.sessaoTerminada = true;
            sairPortal('A sua sessão expirou. Inicie sessão novamente.');
        }
        throw new Error('Sessão expirada');
    }
    return resposta;
}

// --- Sessão ---
async function entrarPortal() {
    const email = document.getElementById('email').value;
    const senha = document.getElementById('password').value;
    const msgErro = document.getElementById('msg-erro');
    msgErro.style.display = 'none';

    const erro = texto => { msgErro.style.color = 'red'; msgErro.innerText = texto; msgErro.style.display = 'block'; };
    if (!email || !senha) return erro('Introduza o email e a palavra-passe.');

    try {
        const resposta = await fetch(`${URL_API}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, senha })
        });
        const dados = await resposta.json();
        if (!resposta.ok) return erro(dados.erro || 'Não foi possível iniciar sessão.');
        if (dados.perfil !== 'cliente') return erro('Esta conta é da equipa Bordaveiro. Utilize a aplicação principal.');

        localStorage.setItem(CHAVE_TOKEN, dados.token);
        localStorage.setItem(CHAVE_NOME, dados.nome || '');
        mostrarPortal();
    } catch (e) {
        erro('Não foi possível contactar o servidor. Tente novamente mais tarde.');
    }
}

// --- Recuperação da palavra-passe (com autorização do admin) ---
// O código fica guardado neste browser para o cliente voltar mais tarde sem o perder
const CHAVE_RECUPERACAO = 'recuperacao_portal';
let recuperacaoAtual = null; // { email, codigo }

function lerRecuperacaoGuardada() {
    try { return JSON.parse(localStorage.getItem(CHAVE_RECUPERACAO)); } catch (e) { return null; }
}

function msgRecuperacao(texto, cor = 'red') {
    const msg = document.getElementById('rec-msg');
    msg.style.color = cor;
    msg.innerText = texto;
}

function abrirRecuperacao() {
    document.getElementById('caixa-login').style.display = 'none';
    document.getElementById('caixa-recuperar').style.display = 'block';
    msgRecuperacao('');
    recuperacaoAtual = lerRecuperacaoGuardada();
    if (recuperacaoAtual) {
        mostrarPassoRecuperacao('codigo');
        verificarRecuperacao();
    } else {
        document.getElementById('rec-email').value = document.getElementById('email').value;
        mostrarPassoRecuperacao('pedir');
    }
}

function fecharRecuperacao() {
    document.getElementById('caixa-recuperar').style.display = 'none';
    document.getElementById('caixa-login').style.display = 'block';
}

function mostrarPassoRecuperacao(passo) {
    ['pedir', 'codigo', 'nova'].forEach(p =>
        document.getElementById(`rec-${p}`).style.display = p === passo ? 'block' : 'none');
    document.getElementById('rec-estado').innerText = '';
    if (passo !== 'codigo') return;

    // Com um pedido feito neste browser mostra o código; senão pede email e código
    const temGuardado = !!recuperacaoAtual;
    document.getElementById('rec-codigo-mostrar').innerText = temGuardado ? recuperacaoAtual.codigo : '';
    document.getElementById('rec-codigo-campos').style.display = temGuardado ? 'none' : 'block';
    document.getElementById('rec-codigo-texto').innerText = temGuardado
        ? `Pedido enviado para ${recuperacaoAtual.email}. Guarde este código: vai precisar dele se continuar noutro computador. Depois de a Bordaveiro autorizar, volte aqui e clique em "Verificar autorização".`
        : 'Introduza o email e o código que recebeu quando fez o pedido.';
}

async function pedirRecuperacao() {
    const email = document.getElementById('rec-email').value.trim();
    if (!email) return msgRecuperacao('Indique o seu email.');
    try {
        const res = await fetch(`${URL_API}/portal/recuperar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const dados = await res.json();
        if (!res.ok) throw new Error(dados.erro);

        recuperacaoAtual = { email, codigo: dados.codigo };
        localStorage.setItem(CHAVE_RECUPERACAO, JSON.stringify(recuperacaoAtual));
        mostrarPassoRecuperacao('codigo');
        msgRecuperacao('Pedido enviado à Bordaveiro.', 'green');
    } catch (e) {
        msgRecuperacao(e.message || 'Não foi possível enviar o pedido.');
    }
}

async function verificarRecuperacao() {
    if (!recuperacaoAtual) {
        const email = document.getElementById('rec-email-2').value.trim();
        const codigo = document.getElementById('rec-codigo-input').value.trim().toUpperCase();
        if (!email || !codigo) return msgRecuperacao('Indique o email e o código.');
        recuperacaoAtual = { email, codigo };
    }
    msgRecuperacao('');
    const estado = document.getElementById('rec-estado');

    try {
        const res = await fetch(`${URL_API}/portal/recuperar/estado`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(recuperacaoAtual)
        });
        const dados = await res.json();
        if (!res.ok) throw new Error(dados.erro);

        if (dados.estado === 'Autorizado') {
            localStorage.setItem(CHAVE_RECUPERACAO, JSON.stringify(recuperacaoAtual));
            return mostrarPassoRecuperacao('nova');
        }
        if (dados.estado === 'Pendente') {
            estado.style.color = '#E5A83B';
            estado.innerText = 'A aguardar autorização da Bordaveiro.';
            localStorage.setItem(CHAVE_RECUPERACAO, JSON.stringify(recuperacaoAtual));
            return;
        }

        const mensagens = {
            Recusado: 'A Bordaveiro recusou este pedido. Contacte-a para mais informações.',
            Expirado: 'Este pedido expirou. Faça um novo pedido.',
            Substituído: 'Este código foi substituído por um pedido mais recente.',
            Usado: 'Este código já foi usado. Se precisar, faça um novo pedido.',
            'Inválido': 'Email ou código incorretos.'
        };
        estado.style.color = 'red';
        estado.innerText = mensagens[dados.estado] || 'Este pedido já não é válido.';
        // Um código sem utilidade deixa de ficar guardado; permite fazer um pedido novo
        localStorage.removeItem(CHAVE_RECUPERACAO);
        recuperacaoAtual = null;
        document.getElementById('rec-codigo-mostrar').innerText = '';
        document.getElementById('rec-codigo-campos').style.display = 'block';
        document.getElementById('rec-pedir').style.display = 'block';
    } catch (e) {
        if (!lerRecuperacaoGuardada()) recuperacaoAtual = null;
        msgRecuperacao(e.message || 'Não foi possível verificar o pedido.');
    }
}

async function concluirRecuperacao() {
    const nova = document.getElementById('rec-senha').value;
    if (nova.length < 8) return msgRecuperacao('A nova palavra-passe deve ter pelo menos 8 caracteres.');
    if (nova !== document.getElementById('rec-senha-2').value) return msgRecuperacao('As duas palavras-passe não são iguais.');

    try {
        const res = await fetch(`${URL_API}/portal/recuperar/concluir`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...recuperacaoAtual, nova })
        });
        const dados = await res.json();
        if (!res.ok) throw new Error(dados.erro);

        localStorage.removeItem(CHAVE_RECUPERACAO);
        document.getElementById('email').value = recuperacaoAtual.email;
        recuperacaoAtual = null;
        ['rec-senha', 'rec-senha-2'].forEach(id => document.getElementById(id).value = '');
        fecharRecuperacao();
        const msgErro = document.getElementById('msg-erro');
        msgErro.style.color = 'green';
        msgErro.innerText = 'Palavra-passe alterada. Já pode entrar com a nova palavra-passe.';
        msgErro.style.display = 'block';
    } catch (e) {
        msgRecuperacao(e.message || 'Não foi possível alterar a palavra-passe.');
    }
}

function sairPortal(aviso) {
    localStorage.removeItem(CHAVE_TOKEN);
    localStorage.removeItem(CHAVE_NOME);
    if (aviso) alert(aviso);
    location.reload();
}

function mostrarPortal() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('dashboard-screen').style.display = 'block';
    document.getElementById('nome-cliente').innerText = localStorage.getItem(CHAVE_NOME) || '';
    limparFormulario();
    carregarPedidos();
    carregarConta();
    // O estado e as datas mudam quando a Bordaveiro atualiza o pedido: volta a carregar
    // a cada minuto e sempre que o cliente regressa a este separador
    setInterval(() => { if (!document.hidden) carregarPedidos(); }, 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) carregarPedidos(); });
}

function mudarPagina(pagina) {
    document.getElementById('pagina-pedidos').style.display = pagina === 'pedidos' ? 'grid' : 'none';
    ['senha', 'sugestoes'].forEach(p =>
        document.getElementById(`pagina-${p}`).style.display = pagina === p ? 'block' : 'none');
    ['pedidos', 'sugestoes', 'senha'].forEach(p =>
        document.getElementById(`nav-${p}`).className = `btn-nav ${p === pagina ? 'btn-nav-active' : 'btn-nav-inactive'}`);
    if (pagina === 'sugestoes' && !document.getElementById('chat-mensagens').children.length) iniciarChat();
}

// --- Reclamações e sugestões sobre o portal (o chat está em chat.js) ---
configurarChat({
    assuntos: ['Erro no portal', 'Fazer ou acompanhar pedidos', 'Palavra-passe / acesso', 'Outro (sobre o portal)'],
    saudacao: () => {
        const nome = (localStorage.getItem(CHAVE_NOME) || '').split(' ')[0];
        return `Olá${nome ? ', ' + nome : ''}! Sou o assistente da Bordaveiro.\n` +
            'Aqui pode reportar erros ou deixar sugestões sobre o portal. ' +
            'Para assuntos sobre os seus pedidos ou trabalhos, contacte a Bordaveiro diretamente.\n\nO que gostaria de nos enviar?';
    },
    enviar: async conversa => {
        const res = await api(`${URL_API}/portal/feedback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(conversa)
        });
        const dados = await res.json();
        if (!res.ok) {
            if (res.status === 403) carregarConta();
            throw new Error(dados.erro);
        }
        return dados;
    }
});

// O admin pode desligar as sugestões para esta conta: nesse caso a aba não aparece
async function carregarConta() {
    try {
        const res = await api(`${URL_API}/portal/conta`);
        const conta = await res.json();
        const ativo = res.ok && conta.feedback_ativo;
        document.getElementById('nav-sugestoes').style.display = ativo ? '' : 'none';
        if (!ativo && document.getElementById('pagina-sugestoes').style.display === 'block') mudarPagina('pedidos');
    } catch (e) { /* sem ligação: mantém como está */ }
}

// --- Alterar palavra-passe ---
async function alterarSenha() {
    const msg = document.getElementById('msg-senha');
    const campos = ['senha-atual', 'senha-nova', 'senha-repetir'].map(id => document.getElementById(id));
    const [atual, nova, repetir] = campos.map(c => c.value);
    const erro = texto => { msg.style.color = 'red'; msg.innerText = texto; };

    if (!atual || !nova || !repetir) return erro('Preencha os três campos.');
    if (nova.length < 8) return erro('A nova palavra-passe deve ter pelo menos 8 caracteres.');
    if (nova !== repetir) return erro('As duas novas palavras-passe não são iguais.');

    const botao = document.getElementById('btn-alterar-senha');
    try {
        botao.disabled = true;
        msg.style.color = '#8C5E3C'; msg.innerText = 'A alterar...';
        const res = await api(`${URL_API}/portal/senha`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ atual, nova })
        });
        const dados = await res.json();
        if (!res.ok) throw new Error(dados.erro);

        campos.forEach(c => c.value = '');
        msg.style.color = 'green'; msg.innerText = 'Palavra-passe alterada. Use a nova no próximo início de sessão.';
    } catch (e) {
        if (e.message !== 'Sessão expirada') erro(e.message || 'Não foi possível alterar a palavra-passe.');
    } finally {
        botao.disabled = false;
    }
}

// --- Novo pedido ---
// "Letra: X · Local: Y" de um produto (vazio se não tiver nenhum dos dois)
const letraLocal = i => [i.letra && `Letra: ${i.letra}`, i.local && `Local: ${i.local}`].filter(Boolean).join(' · ');

function adicionarItem() {
    const div = document.createElement('div');
    div.className = 'item-pedido';
    div.innerHTML = `
      <div class="item-linha">
        <div><small>Nome do produto</small><input type="text" class="item-nome" maxlength="150" placeholder="Ex: Polo com logótipo"></div>
        <button type="button" class="btn-small item-remover" title="Remover" onclick="this.closest('.item-pedido').remove()">✕</button>
      </div>
      <small>Descrição</small><input type="text" class="item-descricao" maxlength="500" placeholder="Ex: Tamanhos 2 M e 3 L, logótipo no peito">
      <div class="item-linha">
        <div><small>Letra</small><input type="text" class="item-letra" maxlength="100" placeholder="Ex: Cursiva, Arial"></div>
        <div><small>Local do bordado</small><input type="text" class="item-local" maxlength="150" placeholder="Ex: Peito esquerdo, costas"></div>
      </div>
      <div class="item-linha">
        <div style="max-width: 140px;"><small>Quantidade</small><input type="number" class="item-qtd" min="1" step="1" value="1"></div>
      </div>`;
    document.getElementById('lista-itens-pedido').appendChild(div);
}

function lerItens() {
    return [...document.querySelectorAll('#lista-itens-pedido .item-pedido')]
        .map(div => ({
            nome: div.querySelector('.item-nome').value.trim(),
            descricao: div.querySelector('.item-descricao').value.trim(),
            letra: div.querySelector('.item-letra').value.trim(),
            local: div.querySelector('.item-local').value.trim(),
            quantidade: parseInt(div.querySelector('.item-qtd').value) || 1
        }))
        .filter(i => i.nome);
}

function validarFicheiros(input) {
    const ficheiros = [...input.files];
    let erro = '';
    if (ficheiros.length > MAX_FICHEIROS) erro = `Pode enviar no máximo ${MAX_FICHEIROS} ficheiros por pedido.`;
    else if (ficheiros.some(f => !EXTENSOES_PORTAL.test(f.name))) erro = 'Só são aceites ficheiros PNG, JPEG, PDF, DST e EMB.';
    else if (ficheiros.some(f => f.size > MAX_TAMANHO)) erro = 'Cada ficheiro pode ter no máximo 15 MB.';
    if (!erro) return true;
    alert(erro);
    input.value = '';
    return false;
}

function limparFormulario() {
    document.getElementById('lista-itens-pedido').innerHTML = '';
    ['cor-linha', 'data-pretendida', 'ficheiros'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('data-pretendida').min = new Date().toISOString().slice(0, 10);
    adicionarItem();
}

async function enviarPedido() {
    const msg = document.getElementById('msg-pedido');
    const botao = document.getElementById('btn-enviar');
    const itens = lerItens();
    const ficheiros = document.getElementById('ficheiros');

    if (!itens.length) { msg.style.color = 'red'; msg.innerText = 'Indique pelo menos um produto.'; return; }
    if (!validarFicheiros(ficheiros)) return;

    const formData = new FormData();
    formData.append('itens', JSON.stringify(itens));
    formData.append('cor_linha', document.getElementById('cor-linha').value);
    formData.append('data_pretendida', document.getElementById('data-pretendida').value);
    [...ficheiros.files].forEach(f => formData.append('ficheiro', f));

    try {
        botao.disabled = true;
        msg.style.color = '#8C5E3C'; msg.innerText = 'A enviar pedido...';
        const res = await api(`${URL_API}/portal/pedidos`, { method: 'POST', body: formData });
        const dados = await res.json();
        if (!res.ok) throw new Error(dados.erro);

        limparFormulario();
        await carregarPedidos();
        msg.style.color = 'green';
        msg.innerText = `Pedido nº ${dados.id} enviado. A Bordaveiro vai confirmar a data em breve.`;
        setTimeout(() => msg.innerText = '', 8000);
    } catch (e) {
        msg.style.color = 'red';
        msg.innerText = e.message && e.message !== 'Sessão expirada' ? e.message : 'Não foi possível enviar o pedido. Tente novamente.';
    } finally {
        botao.disabled = false;
    }
}

// --- Os meus pedidos ---
const lerUrls = valor => {
    if (!valor) return [];
    try { return valor.startsWith('[') ? JSON.parse(valor) : [valor]; } catch (e) { return []; }
};

// Nome do ficheiro guardado (sem o prefixo de upload "fich_<data>_<n>_") e o seu tipo
function nomeFicheiro(url) {
    return decodeURIComponent(url.split('?')[0].split('/').pop()).replace(/^[a-z]+_\d+_\d+_/, '');
}
const tipoFicheiro = url => (nomeFicheiro(url).split('.').pop() || '').toUpperCase();

// Estado mostrado ao cliente e a respetiva cor
function estadoCliente(p) {
    if (p.status === 'Pedido Cliente') return { texto: 'A aguardar confirmação', cor: '#E5A83B' };
    if (p.status === 'Cancelado') return { texto: 'Cancelado', cor: '#95a5a6' };
    if (p.status === 'Concluído') return { texto: 'Pronto', cor: '#27ae60' };
    return { texto: 'Confirmado · em produção', cor: '#8C5E3C' };
}

// A Bordaveiro indicou uma data diferente da pedida
const temNovaData = p => p.status === 'Pendente' && p.data_pretendida && p.data_entrega && p.data_entrega !== p.data_pretendida;
// Mesma regra que o servidor aplica
const podeCancelar = p => p.status === 'Pedido Cliente' || temNovaData(p);

function avisoCancelar(p) {
    if (!podeCancelar(p)) return '';
    const texto = temNovaData(p)
        ? 'A Bordaveiro indicou uma nova data de entrega. Se não lhe convier, pode cancelar o pedido.'
        : 'Pode cancelar o pedido enquanto aguarda confirmação.';
    return `
      <div class="portal-aviso">
        <span>${texto}</span>
        <button class="btn-small" style="background: #c0392b;" onclick="cancelarPedido(${p.id})">Cancelar pedido</button>
      </div>`;
}

async function cancelarPedido(id) {
    if (!confirm(`Confirma o cancelamento do pedido nº ${id}? Esta ação não pode ser desfeita.`)) return;
    try {
        const res = await api(`${URL_API}/portal/pedidos/${id}/cancelar`, { method: 'POST' });
        const dados = await res.json();
        if (!res.ok) throw new Error(dados.erro);
    } catch (e) {
        if (e.message !== 'Sessão expirada') alert(e.message || 'Não foi possível cancelar o pedido.');
    }
    carregarPedidos();
}

function linhaEntrega(p) {
    if (p.status === 'Cancelado') return '';
    if (p.status === 'Pedido Cliente') {
        return p.data_pretendida ? `Data pretendida: ${formatarData(p.data_pretendida)}` : 'Sem data pretendida';
    }
    if (!p.data_entrega) return '';
    if (p.data_pretendida && p.data_entrega !== p.data_pretendida) {
        return `<strong>Previsão de entrega: ${formatarData(p.data_entrega)}</strong> (pedido para ${formatarData(p.data_pretendida)})`;
    }
    return `<strong>Entrega confirmada: ${formatarData(p.data_entrega)}</strong>`;
}

let pedidosPortal = [];

async function carregarPedidos() {
    try {
        const res = await api(`${URL_API}/portal/pedidos`);
        const pedidos = await res.json();
        if (!res.ok) throw new Error(pedidos.erro);
        pedidosPortal = pedidos;
        document.getElementById('ultima-atualizacao').innerText =
            `Atualizado às ${new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`;
        renderizarPedidos();
    } catch (e) {
        if (e.message !== 'Sessão expirada') {
            document.getElementById('lista-pedidos').innerHTML = '<p style="text-align: center; color: red;">Não foi possível carregar os pedidos.</p>';
        }
    }
}

// Filtro De/Até pela data de entrada do pedido (data_pedido)
function pedidosDoPeriodo() {
    const de = document.getElementById('filtro-de').value;
    const ate = document.getElementById('filtro-ate').value;
    return pedidosPortal.filter(p => {
        const entrada = (p.data_pedido || '').slice(0, 10);
        return (!de || entrada >= de) && (!ate || entrada <= ate);
    });
}

function limparFiltroDatas() {
    document.getElementById('filtro-de').value = '';
    document.getElementById('filtro-ate').value = '';
    renderizarPedidos();
}

// Pedidos aprovados: confirmados pela Bordaveiro (em produção) ou prontos
const ehAprovado = p => p.status === 'Pendente' || p.status === 'Concluído';

function renderizarPedidos() {
    const div = document.getElementById('lista-pedidos');
    const filtrado = !!(document.getElementById('filtro-de').value || document.getElementById('filtro-ate').value);
    const pedidos = pedidosDoPeriodo();
    document.getElementById('resumo-filtro').innerText = filtrado
        ? `${pedidos.length} pedido(s) no período, ${pedidos.filter(ehAprovado).length} aprovado(s).`
        : '';

    if (!pedidos.length) {
        div.innerHTML = `<p style="text-align: center; color: #888;">${filtrado ? 'Não há pedidos neste período.' : 'Ainda não fez nenhum pedido.'}</p>`;
        return;
    }

    div.innerHTML = pedidos.map(p => {
            const estado = estadoCliente(p);
            const itens = Array.isArray(p.itens) && p.itens.length
                ? `<ul class="portal-itens">${p.itens.map(i =>
                    `<li>${escapar(i.quantidade)} × <strong>${escapar(i.nome)}</strong>${i.descricao ? ` — ${escapar(i.descricao)}` : ''}` +
                    `${letraLocal(i) ? `<br><small>${escapar(letraLocal(i))}</small>` : ''}</li>`).join('')}</ul>`
                : `<p style="margin: 6px 0;">${escapar(p.descricao)}</p>`;
            const imagens = lerUrls(p.arquivo_imagem);
            const outros = lerUrls(p.arquivo_dst);
            return `
          <div class="portal-pedido" style="border-left-color: ${estado.cor};">
            <div style="display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; align-items: center;">
              <strong style="color: #4A2511;">Pedido nº ${p.id}</strong>
              <span class="portal-estado" style="background: ${estado.cor};">${estado.texto}</span>
            </div>
            ${itens}
            ${p.cor_linha ? `<div><small>Cor da linha:</small> ${escapar(p.cor_linha)}</div>` : ''}
            <div style="margin-top: 4px;">${linhaEntrega(p)}</div>
            ${avisoCancelar(p)}
            ${imagens.length ? `<div class="thumbs-pedido" style="margin-top: 8px;">${imagens.map(url =>
                `<a href="${escapar(url)}" target="_blank"><img class="thumb-pedido" style="width: 56px; height: 56px;" src="${escapar(url)}" alt="" loading="lazy"></a>`).join('')}</div>` : ''}
            ${outros.length ? `<div class="portal-ficheiros">${outros.map(url =>
                `<a href="${escapar(url)}" target="_blank" title="${escapar(nomeFicheiro(url))}">${escapar(tipoFicheiro(url))} · ${escapar(nomeFicheiro(url))}</a>`).join('')}</div>` : ''}
            <small style="color: #999;">Data de entrada: ${formatarData(p.data_pedido)}</small>
          </div>`;
        }).join('');
}

// Relatório em Excel dos pedidos aprovados do período (sem valores)
function exportarRelatorio() {
    if (typeof XLSX === 'undefined') {
        alert('Não foi possível carregar a biblioteca de Excel. Verifique a ligação à internet.');
        return;
    }
    const aprovados = pedidosDoPeriodo().filter(ehAprovado);
    if (!aprovados.length) {
        alert('Não há pedidos aprovados no período selecionado.');
        return;
    }

    const de = document.getElementById('filtro-de').value;
    const ate = document.getElementById('filtro-ate').value;
    const periodo = (de || ate)
        ? `Período (data de entrada): ${de ? formatarData(de) : 'início'} a ${ate ? formatarData(ate) : 'hoje'}`
        : 'Período: todos os pedidos';
    const produtos = p => Array.isArray(p.itens) && p.itens.length
        ? p.itens.map(i => `${i.quantidade} × ${i.nome}${i.descricao ? ` (${i.descricao})` : ''}${letraLocal(i) ? ` [${letraLocal(i)}]` : ''}`).join('; ')
        : p.descricao || '';

    const cabecalho = ['Pedido nº', 'Produtos', 'Cor da linha', 'Data de entrada', 'Data pretendida', 'Data de entrega', 'Estado'];
    const linhas = aprovados.map(p => [
        p.id,
        produtos(p),
        p.cor_linha || '',
        formatarData(p.data_pedido),
        formatarData(p.data_pretendida),
        formatarData(p.data_entrega),
        estadoCliente(p).texto
    ]);

    const folha = XLSX.utils.aoa_to_sheet([
        [`BORDAVEIRO - Pedidos aprovados - ${localStorage.getItem(CHAVE_NOME) || ''}`],
        [periodo],
        [`Gerado em ${new Date().toLocaleDateString('pt-PT')}`],
        [],
        cabecalho,
        ...linhas,
        [],
        [`Total: ${linhas.length} pedido(s)`]
    ]);
    folha['!cols'] = [{ wch: 10 }, { wch: 50 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 26 }];

    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, folha, 'Pedidos aprovados');
    const sufixo = de || ate ? `_${de || 'inicio'}_a_${ate || 'hoje'}` : '';
    XLSX.writeFile(livro, `Bordaveiro_Pedidos_Aprovados${sufixo}.xlsx`);
}
