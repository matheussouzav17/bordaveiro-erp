// Correr com: npm test
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { arred, calcularItemIva, totaisItens, ehPedidoDP, valorPorReceber, decomporIva } = require('../calculos');

const valores = ({ sem_iva, iva, com_iva }) => ({ sem_iva, iva, com_iva });

test('arred arredonda a 2 casas decimais', () => {
    assert.equal(arred(69.1057), 69.11);
    assert.equal(arred(4.6000000001), 4.6);
});

test('IVA acrescentado ao preço: 2 × 10 € dá 20 + 4,60 = 24,60', () => {
    assert.deepEqual(valores(calcularItemIva(2, 10, 'acrescentar')), { sem_iva: 20, iva: 4.6, com_iva: 24.6 });
});

test('preço já com IVA: 12,30 € corresponde a 10 € + 2,30 €', () => {
    const item = calcularItemIva(1, 12.3, 'incluido');
    assert.deepEqual(valores(item), { sem_iva: 10, iva: 2.3, com_iva: 12.3 });
    assert.equal(item.preco, 10);
    assert.equal(item.preco_com_iva, 12.3);
});

test('sem IVA: 3 × 5 € dá 15 € e IVA zero', () => {
    assert.deepEqual(valores(calcularItemIva(3, 5, 'sem')), { sem_iva: 15, iva: 0, com_iva: 15 });
});

test('desconto de 10% aplica-se ao total do produto, antes do IVA', () => {
    const item = calcularItemIva(2, 10, 'acrescentar', 10);
    assert.deepEqual(valores(item), { sem_iva: 18, iva: 4.14, com_iva: 22.14 });
    assert.equal(item.preco, 10, 'o preço unitário mantém-se sem desconto');
});

test('desconto de 15% num preço já com IVA', () => {
    assert.deepEqual(valores(calcularItemIva(1, 100, 'incluido', 15)), { sem_iva: 69.11, iva: 15.89, com_iva: 85 });
});

test('sem IVA + IVA é sempre igual ao total com IVA', () => {
    for (const modo of ['acrescentar', 'incluido', 'sem']) {
        for (const desconto of [0, 5, 10, 15]) {
            for (const [qtd, preco] of [[1, 0.99], [3, 7.35], [17, 2.49], [250, 1.13]]) {
                const i = calcularItemIva(qtd, preco, modo, desconto);
                assert.equal(arred(i.sem_iva + i.iva), i.com_iva, `${modo}, ${desconto}%, ${qtd} × ${preco}`);
            }
        }
    }
});

test('totais do pedido somam os produtos', () => {
    const itens = [calcularItemIva(2, 10, 'acrescentar'), calcularItemIva(1, 12.3, 'incluido'), calcularItemIva(3, 5, 'sem')];
    assert.deepEqual(totaisItens(itens), { semIva: 45, iva: 6.9, comIva: 51.9 });
    assert.deepEqual(totaisItens([]), { semIva: 0, iva: 0, comIva: 0 });
});

test('cliente DP é reconhecido com espaços e minúsculas', () => {
    assert.equal(ehPedidoDP({ clientes: { nome: ' dp ' } }), true);
    assert.equal(ehPedidoDP({ clientes: { nome: 'DP Lda' } }), false);
    assert.equal(ehPedidoDP({}), false);
});

test('valor por receber conforme o pagamento', () => {
    assert.equal(valorPorReceber({ valor: 100, tipo_pagamento: 'Completo' }), 0);
    assert.equal(valorPorReceber({ valor: 100, tipo_pagamento: 'Parcial', valor_pago: 30 }), 70);
    assert.equal(valorPorReceber({ valor: 100, tipo_pagamento: 'Parcial', valor_pago: 150 }), 0, 'nunca é negativo');
    assert.equal(valorPorReceber({ valor: '49.90', tipo_pagamento: 'Na Entrega' }), 49.9);
    assert.equal(valorPorReceber({ tipo_pagamento: 'Na Fatura' }), 0);
});

test('decomporIva: pedido antigo sem produtos conta todo como base', () => {
    assert.deepEqual(decomporIva({ valor: '50' }), { semIva: 50, iva: 0, total: 50, semDiscriminacao: true });
});

test('decomporIva: pedido com produtos usa o IVA de cada produto', () => {
    const itens = [calcularItemIva(2, 10, 'acrescentar'), calcularItemIva(3, 5, 'sem')];
    assert.deepEqual(decomporIva({ valor: 39.6, itens }), { semIva: 35, iva: 4.6, total: 39.6, semDiscriminacao: false });
});

test('decomporIva: pedido do portal (produtos sem preço) retira o IVA do valor confirmado', () => {
    const itens = [{ nome: 'Polo', quantidade: 5 }];
    assert.deepEqual(decomporIva({ valor: 123, itens }), { semIva: 100, iva: 23, total: 123, semDiscriminacao: false });
});
