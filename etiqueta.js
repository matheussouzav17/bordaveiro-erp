// ============================================================================
// BORDAVEIRO - ETIQUETA DE PRODUÇÃO
// Papel A6, uma página por produto: nome da encomenda, local, letra, cor da linha e data.
// Substitui o papel que os clientes costumam mandar com a encomenda.
// Usado pelo painel (script.js) e pelo portal do cliente (portal.js); precisa do jsPDF.
// ============================================================================

// tituloAlternativo: usado quando o pedido não tem subtítulo (no painel, o nome do cliente)
function imprimirEtiqueta(p, tituloAlternativo = '') {
    if (!window.jspdf) {
        alert('Não foi possível carregar a biblioteca de PDF. Verifique a ligação à internet.');
        return;
    }
    // a janela tem de abrir já no clique, senão o navegador bloqueia
    const janela = window.open('', '_blank');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a6', compress: true });
    const LARGURA = 105, ALTURA = 148, MARGEM = 10, X = 15, MAX = LARGURA - 2 * X;

    const titulo = (p.subtitulo || tituloAlternativo || `Pedido nº ${p.id}`).toUpperCase();
    const dataIso = String(p.data_pedido || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
    const data = dataIso.split('-').reverse().join('.');
    const itens = Array.isArray(p.itens) && p.itens.length
        ? p.itens
        : [{ nome: p.descricao, codigos: p.codigos_linhas || p.cor_linha }];

    itens.forEach((i, n) => {
        if (n) doc.addPage();
        doc.setDrawColor(0);
        doc.setLineWidth(0.3);
        doc.setLineDashPattern([1.2, 1], 0);
        doc.rect(MARGEM, MARGEM + 8, LARGURA - 2 * MARGEM, ALTURA - 2 * MARGEM - 16);
        doc.setLineDashPattern([], 0);
        doc.setTextColor(0);

        let y = MARGEM + 20;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        const linhasTitulo = doc.splitTextToSize(titulo, MAX);
        doc.text(linhasTitulo, X, y);
        y += linhasTitulo.length * 7;

        y += 4;

        // Produto (quantidade × nome) e a sua descrição
        if (i.nome) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            const linhasNome = doc.splitTextToSize(`${i.quantidade ? i.quantidade + ' × ' : ''}${i.nome}`, MAX);
            doc.text(linhasNome, X, y);
            y += linhasNome.length * 5.5;
        }
        if (i.descricao) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            const linhasDesc = doc.splitTextToSize(i.descricao, MAX);
            doc.text(linhasDesc, X, y);
            y += linhasDesc.length * 4.5;
        }
        y += 6;

        // Local, letra e cor da linha saem sempre (vazios ficam para escrever à mão);
        // os restantes só se estiverem preenchidos
        const campos = [
            ['Local', i.local, true],
            ['Letra', i.letra, true],
            ['Cor da linha', i.codigos || p.cor_linha, true],
            ['Cor do artigo', i.cor],
            ['Género', i.genero],
            ['Tamanhos', i.tamanhos],
            ['Observação', i.observacao]
        ].filter(([, valor, sempre]) => sempre || valor);

        doc.setFontSize(11);
        campos.forEach(([rotulo, valor]) => {
            doc.setFont('helvetica', 'bold');
            const textoRotulo = `${rotulo}:`;
            doc.text(textoRotulo, X, y);
            // largura medida ainda em negrito, mais um pequeno espaço
            const recuo = doc.getTextWidth(textoRotulo) + 1.5;
            doc.setFont('helvetica', 'normal');
            const linhas = doc.splitTextToSize(String(valor || ''), MAX - recuo);
            doc.text(linhas, X + recuo, y);
            y += linhas.length * 5 + 3.5;
        });

        doc.text(`Data ${data}`, LARGURA - X, ALTURA - MARGEM - 18, { align: 'right' });
    });

    doc.autoPrint();
    if (janela) janela.location = doc.output('bloburl');
    else doc.save(`Bordaveiro_Etiqueta_${p.id}.pdf`);
}
