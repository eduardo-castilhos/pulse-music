require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const yts = require('yt-search');

const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
const MUSICS_DIR = path.join(__dirname, 'public', 'musics');
const EXTENSOES_AUDIO = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac']);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function listarFaixas(dir, baseDir = dir) {
  let resultado = [];
  const itens = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of itens) {
    const caminhoCompleto = path.join(dir, item.name);

    if (item.isDirectory()) {
      resultado = resultado.concat(listarFaixas(caminhoCompleto, baseDir));
      continue;
    }

    const extensao = path.extname(item.name).toLowerCase();
    if (!EXTENSOES_AUDIO.has(extensao)) continue;

    const relativo = path.relative(baseDir, caminhoCompleto).split(path.sep).join('/');
    const partes = relativo.split('/');
    const categoria = partes.length > 1 ? partes.slice(0, -1).join('/') : null;

    resultado.push({
      nome: path.basename(item.name, extensao),
      categoria,
      url: `/musics/${partes.map(encodeURIComponent).join('/')}`,
    });
  }

  return resultado;
}

const PROMPT_SISTEMA =
  'Voce e um assistente de musica dentro de um app que conversa com o usuario por voz e tem acesso de busca ao YouTube. ' +
  'Sempre responda em JSON puro, sem nenhum texto fora do JSON, no formato exato: ' +
  '{"resposta": string (frase curta e natural para falar ao usuario, no maximo 2 frases), ' +
  '"acao": "tocar" | "listar" | "conversa", ' +
  '"termoBusca": string (obrigatorio apenas se acao="tocar"; o melhor termo de busca do YouTube para essa musica especifica, no formato "artista - musica"), ' +
  '"sugestoes": array de strings (obrigatorio apenas se acao="listar"; cada item deve ser EXATAMENTE o nome de uma musica real no formato "artista - musica", nunca um topico ou uma acao)}. ' +
  'Use acao="listar" quando o usuario pedir varias musicas, um ranking, top N, ou recomendacoes. ' +
  'Use acao="tocar" quando o usuario quiser ouvir uma musica especifica agora — inclusive quando ele descrever a musica de forma indireta ' +
  '(tema, sensacao, trecho de letra, epoca) e voce precisar deduzir qual e, ou quando ele estiver escolhendo um item de uma lista que voce mesmo sugeriu antes ' +
  '(use o historico da conversa para resolver referencias como "a segunda" ou o nome de um item da lista). ' +
  'Use acao="conversa" para qualquer outro caso, como perguntas gerais, saudacoes ou pedidos que nao envolvem tocar musica. ' +
  'IMPORTANTE: voce nunca sabe, com certeza, quais musicas existem ou foram lancadas recentemente — inclusive de anos posteriores ao seu treinamento —, ' +
  'mas isso NAO IMPORTA, porque quem confere se a musica existe de verdade e uma busca real no YouTube feita depois da sua resposta, nao voce. ' +
  'Por isso, NUNCA recuse um pedido dizendo que "nao tem acesso" a musicas de um certo ano, que "nao pode saber" isso, ou qualquer recusa parecida. ' +
  'Mesmo para pedidos sobre um ano futuro, recente ou desconhecido (ex: "toca uma musica de 2026", "top 5 de 2026"), sempre responda com acao="tocar" ' +
  '(usando um palpite razoavel de termo de busca, por exemplo "musicas mais tocadas 2026" ou um artista popular do genero pedido) ou acao="listar" ' +
  '(com palpites plausiveis de titulos), e deixe a busca real no YouTube decidir o que aparece. So use acao="conversa" para isso se o usuario pedir explicitamente ' +
  'para so conversar, sem nenhuma intencao de tocar algo.';

function extrairJson(texto) {
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch {
    const match = texto.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function conversarComGroq(mensagem, historico) {
  const resposta = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.4,
      max_tokens: 350,
      reasoning_effort: 'low',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: PROMPT_SISTEMA },
        ...historico,
        { role: 'user', content: mensagem },
      ],
    }),
  });

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => '');
    throw new Error(`Falha na Groq (${resposta.status}): ${detalhe}`);
  }

  const dados = await resposta.json();
  const bruto = dados?.choices?.[0]?.message?.content?.trim();
  const json = extrairJson(bruto);

  if (!json) {
    throw new Error('Groq nao retornou um JSON valido.');
  }

  return { json, bruto };
}

function historicoValido(historico) {
  if (!Array.isArray(historico)) return [];
  return historico
    .filter((item) => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string')
    .slice(-10);
}

app.post('/api/chat', async (req, res) => {
  const mensagem = (req.body?.mensagem || '').trim();
  const historico = historicoValido(req.body?.historico);

  if (!mensagem) {
    return res.status(400).json({ erro: 'Nenhum texto reconhecido.' });
  }

  let interpretacao = { resposta: '', acao: 'tocar', termoBusca: mensagem };
  let respostaBruta = null;
  let interpretadoPelaGroq = false;

  if (GROQ_API_KEY) {
    try {
      const { json, bruto } = await conversarComGroq(mensagem, historico);
      interpretacao = json;
      respostaBruta = bruto;
      interpretadoPelaGroq = true;
    } catch (erroGroq) {
      console.error('Groq falhou, tocando a transcricao crua como busca:', erroGroq.message);
    }
  }

  const saida = {
    resposta: interpretacao.resposta || '',
    acao: interpretacao.acao || 'tocar',
    sugestoes: Array.isArray(interpretacao.sugestoes) ? interpretacao.sugestoes.slice(0, 8) : undefined,
    interpretadoPelaGroq,
    respostaBruta,
  };

  if (saida.acao === 'tocar') {
    const termoBusca = interpretacao.termoBusca || mensagem;
    try {
      const resultado = await yts(termoBusca);
      const video = resultado.videos?.[0];

      if (!video) {
        return res.json({
          ...saida,
          acao: 'conversa',
          resposta: saida.resposta || `Não encontrei "${termoBusca}" no YouTube.`,
        });
      }

      saida.termoBusca = termoBusca;
      saida.video = {
        id: video.videoId,
        titulo: video.title,
        canal: video.author?.name,
        duracao: video.timestamp,
        thumbnail: video.thumbnail,
      };
    } catch (erro) {
      console.error(erro);
      return res.status(500).json({ erro: 'Falha ao buscar a musica no YouTube.' });
    }
  }

  res.json(saida);
});

app.get('/api/biblioteca', (req, res) => {
  if (!fs.existsSync(MUSICS_DIR)) {
    return res.json({ faixas: [] });
  }
  res.json({ faixas: listarFaixas(MUSICS_DIR) });
});

app.listen(PORT, () => {
  console.log(`Pulse Music rodando em http://localhost:${PORT}`);
  if (!GROQ_API_KEY) {
    console.warn('Aviso: GROQ_API_KEY nao definida no .env — a busca usara o texto falado sem interpretacao da IA.');
  }
});
