# MyStream

PWA privada para reprodução de serviços IPTV autorizados através de uma API Xtream Codes.

## Correr localmente

```bash
npm install
npm run dev
```

## Publicar

O projeto é uma aplicação estática. Depois de `npm run build`, publique a pasta `dist/` em GitHub Pages, Cloudflare Pages ou Vercel.

## Compatibilidade de codecs (Tesla e browsers)

Se a lista abrir mas o vídeo não reproduzir, o serviço IPTV está a fornecer um codec que o browser não suporta. Este projeto inclui um proxy privado que converte o vídeo em H.264/AAC com FFmpeg antes de o entregar ao browser.

1. Copie `.env.example` para `.env` e substitua os dois endereços pelos seus valores reais.
2. Num servidor onde tenha Docker, execute `docker compose --env-file .env up -d --build`.
3. Dê ao servidor um URL HTTPS público, por exemplo `https://stream-proxy.seu-dominio.pt`.
4. Na página inicial de MyStream, introduza esse URL no campo **URL do proxy de compatibilidade** e volte a entrar.

O `STREAM_ORIGINS` é obrigatório: restringe o proxy ao seu fornecedor IPTV autorizado. O URL do stream — que contém as credenciais temporariamente — é enviado apenas ao proxy privado durante a conversão e nunca é guardado pelo projeto nem enviado para GitHub.

## Privacidade

O endereço do serviço, utilizador e palavra-passe são guardados apenas no `localStorage` do browser que os introduz. Nunca os adicione ao repositório.

## Limitação conhecida

O serviço IPTV tem de aceitar pedidos CORS a partir do domínio onde publicar a aplicação. Caso contrário, use um proxy privado no seu próprio servidor; não exponha as credenciais num proxy público.
