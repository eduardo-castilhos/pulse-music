require('dotenv').config();
const path = require('path');
const express = require('express');
const yts = require('yt-search');

const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function interpretarPedido(transcript) {
  if (!GROQ_API_KEY) {
    return transcript;
  }

  const resposta = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.2,
      max_tokens: 60,
      messages: [
        {
          role: 'system',
          content:
            'Voce recebe um pedido de musica falado por um usuario em portugues. ' +
            'Responda APENAS com o melhor termo de busca para encontrar essa musica no YouTube ' +
            '(nome da musica e artista, se houver). Nao explique nada, nao use aspas.',
        },
        { role: 'user', content: transcript },
      ],
    }),
  });

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => '');
    throw new Error(`Falha na Groq (${resposta.status}): ${detalhe}`);
  }

  const dados = await resposta.json();
  const termo = dados?.choices?.[0]?.message?.content?.trim();
  return termo || transcript;
}

app.post('/api/play', async (req, res) => {
  const transcript = (req.body?.transcript || '').trim();

  if (!transcript) {
    return res.status(400).json({ erro: 'Nenhum texto reconhecido.' });
  }

  try {
    let termoBusca = transcript;
    let interpretadoPelaGroq = false;

    try {
      termoBusca = await interpretarPedido(transcript);
      interpretadoPelaGroq = Boolean(GROQ_API_KEY);
    } catch (erroGroq) {
      console.error('Groq falhou, usando transcricao crua como busca:', erroGroq.message);
    }

    const resultado = await yts(termoBusca);
    const video = resultado.videos?.[0];

    if (!video) {
      return res.status(404).json({ erro: `Nenhum video encontrado para "${termoBusca}".` });
    }

    res.json({
      transcript,
      termoBusca,
      interpretadoPelaGroq,
      video: {
        id: video.videoId,
        titulo: video.title,
        canal: video.author?.name,
        duracao: video.timestamp,
        thumbnail: video.thumbnail,
      },
    });
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Falha ao buscar a musica.' });
  }
});

app.listen(PORT, () => {
  console.log(`Pulse Music rodando em http://localhost:${PORT}`);
  if (!GROQ_API_KEY) {
    console.warn('Aviso: GROQ_API_KEY nao definida no .env — a busca usara o texto falado sem interpretacao da IA.');
  }
});
