// Relatórios em Excel com o aspeto padrão da Bordaveiro:
// logo e título no topo, cabeçalho colorido, bordas e linhas alternadas.
// Usado pelo painel (script.js) e pelo portal do cliente (portal.js).
async function gerarExcelBordaveiro({ titulo, periodo, cabecalho, linhas, totais, rodape, larguras, colunasEsquerda = [], ficheiro }) {
    const livro = new ExcelJS.Workbook();
    const folha = livro.addWorksheet(titulo.replace(/[\\/?*\[\]:]/g, ' ').substring(0, 31), { views: [{ state: 'frozen', ySplit: 6 }] });
    folha.columns = larguras.map(width => ({ width }));

    // Topo: logo à esquerda e texto ao lado
    for (let r = 1; r <= 4; r++) folha.getRow(r).height = 22;
    try {
        const resposta = await fetch('logo.png');
        if (!resposta.ok) throw new Error();
        const logo = livro.addImage({ buffer: await resposta.arrayBuffer(), extension: 'png' });
        folha.addImage(logo, { tl: { col: 0.1, row: 0.1 }, ext: { width: 84, height: 84 } });
    } catch (e) { /* sem logo, o relatório continua válido */ }
    folha.getCell('B1').value = `BORDAVEIRO - ${titulo}`;
    folha.getCell('B1').font = { bold: true, size: 14, color: { argb: 'FF4A2511' } };
    folha.getCell('B2').value = periodo;
    folha.getCell('B3').value = `Gerado em ${new Date().toLocaleDateString('pt-PT')}`;

    const borda = { style: 'thin', color: { argb: 'FF8C5E3C' } };
    const bordas = { top: borda, left: borda, bottom: borda, right: borda };
    const fundo = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
    const ehValor = col => /\(€\)/.test(cabecalho[col - 1] || '');

    const linhaCab = folha.getRow(6);
    linhaCab.values = cabecalho;
    linhaCab.height = 24;
    linhaCab.eachCell(c => {
        c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        c.fill = fundo('FF8C5E3C');
        c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        c.border = bordas;
    });

    linhas.forEach((valores, n) => {
        const linha = folha.addRow(valores);
        for (let col = 1; col <= cabecalho.length; col++) {
            const c = linha.getCell(col);
            c.border = bordas;
            c.alignment = {
                vertical: 'middle',
                horizontal: ehValor(col) ? 'right' : colunasEsquerda.includes(col - 1) ? 'left' : 'center',
                wrapText: true
            };
            if (ehValor(col) && typeof c.value === 'number') c.numFmt = '#,##0.00';
            if (n % 2) c.fill = fundo('FFFAF6F2');
        }
    });

    if (totais) {
        const linha = folha.addRow(totais);
        for (let col = 1; col <= cabecalho.length; col++) {
            const c = linha.getCell(col);
            c.font = { bold: true };
            c.fill = fundo('FFEADDCE');
            c.border = bordas;
            c.alignment = { vertical: 'middle', horizontal: ehValor(col) ? 'right' : 'center' };
            if (ehValor(col) && typeof c.value === 'number') c.numFmt = '#,##0.00';
        }
    }
    if (rodape) {
        folha.addRow([]);
        folha.addRow([rodape]).getCell(1).font = { bold: true };
    }

    const dados = await livro.xlsx.writeBuffer();
    const ligacao = document.createElement('a');
    ligacao.href = URL.createObjectURL(new Blob([dados], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    ligacao.download = ficheiro;
    ligacao.click();
    setTimeout(() => URL.revokeObjectURL(ligacao.href), 1000);
}
