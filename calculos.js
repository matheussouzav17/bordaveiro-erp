// ============================================================================
// BORDAVEIRO - CÁLCULOS DE IVA, DESCONTOS E VALORES
// Funções sem ligação ao ecrã, usadas pelo painel (script.js) e pelos testes (npm test).
// ============================================================================

const TAXA_IVA = 0.23;
const arred = n => Math.round(n * 100) / 100;

// desconto: percentagem (0, 5, 10 ou 15) aplicada ao total do produto; o preço unitário mantém-se sem desconto
function calcularItemIva(quantidade, precoDigitado, modo, desconto = 0) {
    const fator = 1 - (desconto || 0) / 100;
    if (modo === 'incluido') {
        const comIva = arred(quantidade * precoDigitado * fator);
        const semIva = arred(comIva / (1 + TAXA_IVA));
        return { modo_iva: modo, desconto, preco_com_iva: precoDigitado, preco: arred(precoDigitado / (1 + TAXA_IVA)), sem_iva: semIva, iva: arred(comIva - semIva), com_iva: comIva };
    }
    const semIva = arred(quantidade * precoDigitado * fator);
    const iva = modo === 'sem' ? 0 : arred(semIva * TAXA_IVA);
    return { modo_iva: modo, desconto, preco: precoDigitado, sem_iva: semIva, iva, com_iva: arred(semIva + iva) };
}

function totaisItens(itens) {
    const semIva = arred(itens.reduce((s, i) => s + i.sem_iva, 0));
    const iva = arred(itens.reduce((s, i) => s + i.iva, 0));
    return { semIva, iva, comIva: arred(semIva + iva) };
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

// No browser as funções ficam globais; no Node (testes) são exportadas
if (typeof module !== 'undefined') {
    module.exports = { TAXA_IVA, arred, calcularItemIva, totaisItens, ehPedidoDP, valorPorReceber, decomporIva };
}
