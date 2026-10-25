// ============================================================================
// BORDAVEIRO - CHAT GUIADO DE RECLAMAÇÕES E SUGESTÕES
// Partilhado pela app da equipa (script.js) e pelo Portal do Cliente (portal.js).
// Usa os elementos #chat-mensagens, #chat-opcoes, #chat-texto e #chat-enviar da página.
// ============================================================================

// Definido por cada página com configurarChat():
//   assuntos: lista de assuntos que o utilizador pode escolher
//   saudacao(): primeira mensagem do assistente
//   enviar(conversa): grava { tipo, assunto, mensagem } e devolve { id }; lança Error com a mensagem a mostrar
//   aposEnviar(): opcional, corre depois de gravar
let configChat = null;
let conversa = {};          // { tipo, assunto, mensagem } da mensagem em curso
let aguardaTexto = false;   // true quando o chat espera a descrição escrita

function configurarChat(config) {
    configChat = config;
}

function bolhaChat(texto, autor = 'bot') {
    const caixa = document.getElementById('chat-mensagens');
    const div = document.createElement('div');
    div.className = `chat-bolha ${autor}`;
    div.textContent = texto;
    caixa.appendChild(div);
    caixa.scrollTop = caixa.scrollHeight;
    return div;
}

// Mostra "a escrever..." por instantes antes da resposta do assistente
function respostaBot(texto, opcoes = []) {
    definirOpcoesChat([]);
    const aEscrever = bolhaChat('a escrever...', 'bot escrever');
    return new Promise(resolve => setTimeout(() => {
        aEscrever.remove();
        bolhaChat(texto);
        definirOpcoesChat(opcoes);
        resolve();
    }, 500));
}

// opcoes: [{ texto, acao }]
function definirOpcoesChat(opcoes) {
    const div = document.getElementById('chat-opcoes');
    div.innerHTML = '';
    opcoes.forEach(({ texto, acao }) => {
        const btn = document.createElement('button');
        btn.textContent = texto;
        btn.onclick = () => { bolhaChat(texto, 'utilizador'); acao(); };
        div.appendChild(btn);
    });
}

function ativarTextoChat(ativo) {
    aguardaTexto = ativo;
    const texto = document.getElementById('chat-texto');
    texto.disabled = !ativo;
    document.getElementById('chat-enviar').disabled = !ativo;
    if (ativo) texto.focus();
}

function iniciarChat() {
    document.getElementById('chat-mensagens').innerHTML = '';
    perguntarTipo(configChat.saudacao());
}

function perguntarTipo(texto) {
    conversa = {};
    ativarTextoChat(false);
    respostaBot(texto, ['Reclamação', 'Sugestão'].map(tipo => ({
        texto: tipo, acao: () => { conversa.tipo = tipo; perguntarAssunto(); }
    })));
}

function perguntarAssunto() {
    respostaBot(`Sobre que assunto é a sua ${conversa.tipo.toLowerCase()}?`, configChat.assuntos.map(assunto => ({
        texto: assunto, acao: () => { conversa.assunto = assunto; pedirMensagem(); }
    })));
}

async function pedirMensagem() {
    await respostaBot(conversa.tipo === 'Reclamação'
        ? 'Lamentamos o incómodo. Descreva o que aconteceu, com o máximo de detalhe possível.'
        : 'Ótimo! Conte-nos a sua ideia.');
    ativarTextoChat(true);
}

function enviarTextoChat() {
    const campo = document.getElementById('chat-texto');
    const texto = campo.value.trim();
    if (!aguardaTexto || !texto) return;
    campo.value = '';
    ativarTextoChat(false);
    bolhaChat(texto, 'utilizador');
    conversa.mensagem = texto;
    confirmarEnvio();
}

function confirmarEnvio() {
    respostaBot(`Resumo:\n• Tipo: ${conversa.tipo}\n• Assunto: ${conversa.assunto}\n\nPosso enviar?`, [
        { texto: 'Enviar', acao: gravarFeedback },
        { texto: 'Reescrever mensagem', acao: pedirMensagem },
        { texto: 'Cancelar', acao: () => perguntarTipo('Sem problema, nada foi enviado. Quer enviar outra coisa?') }
    ]);
}

async function gravarFeedback() {
    definirOpcoesChat([]);
    try {
        const criado = await configChat.enviar(conversa);
        await respostaBot(`Obrigado! A sua ${conversa.tipo.toLowerCase()} foi registada com o nº ${criado.id}. A administração vai analisá-la.`,
            [{ texto: 'Enviar outra', acao: () => perguntarTipo('O que gostaria de enviar agora?') }]);
        if (configChat.aposEnviar) configChat.aposEnviar();
    } catch (e) {
        respostaBot(e.message || 'Não foi possível enviar a mensagem. Verifique a ligação e tente novamente.', [
            { texto: 'Tentar novamente', acao: gravarFeedback },
            { texto: 'Cancelar', acao: () => perguntarTipo('Quer enviar outra coisa?') }
        ]);
    }
}
