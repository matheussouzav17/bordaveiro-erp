# Vídeo tutorial do Portal do Cliente

Vídeo em Remotion que ensina a usar o portal (conta de exemplo **TESTE**), com narração em português de Portugal e legendas.

## Gerar o vídeo

```bash
npm install
npm run narracao   # gera a voz (Windows, voz pt-PT "Helia") a partir de src/narracao.json
npm run render     # cria out/tutorial-portal-bordaveiro.mp4
```

Para pré-visualizar e ajustar no browser: `npm run studio`.

## Alterar o texto

- O guião está em `src/narracao.json` (uma entrada por cena, uma fala por frase).
  Depois de mudar o texto, corra `npm run narracao` outra vez: as durações das cenas ajustam-se sozinhas.
- Os ecrãs do portal estão em `src/portal.tsx` (mesmo CSS do portal real, em `src/portal.css`).
- As animações de cada cena (cliques, zoom, destaques) estão em `src/cenas.tsx`, sincronizadas com o início de cada fala.
