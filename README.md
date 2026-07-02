# Dashboard de Funil de Tráfego L20

Dashboard estática para GitHub Pages que cruza:

- `Queries | Meta-Ads 📢`
- `Queries | YouTube-Ads 📢`
- `Leads`

O build roda em GitHub Actions, gera `public/data.json` e publica a pasta `public` no GitHub Pages. As planilhas são acessadas somente para leitura pelo endpoint CSV público do Google Sheets.

## Regra de imposto

O investimento de Meta Ads é multiplicado por `1,1385` antes do cálculo de investimento, CPM, CPC, CPL e demais métricas. Google/YouTube Ads fica sem imposto.

## Publicação

1. Suba estes arquivos para um repositório no GitHub.
2. Em `Settings > Pages`, selecione `GitHub Actions` como source.
3. Rode a action `Atualizar dashboard` manualmente uma vez.

Depois do primeiro deploy, a URL pública será:

```text
https://SEU_USUARIO.github.io/SEU_REPOSITORIO/
```

## cron-job.org

Crie um cron a cada 3 horas com:

```text
URL: https://api.github.com/repos/SEU_USUARIO/SEU_REPOSITORIO/dispatches
Method: POST
```

Headers:

```text
Accept: application/vnd.github+json
Authorization: Bearer SEU_TOKEN_GITHUB
X-GitHub-Api-Version: 2022-11-28
Content-Type: application/json
```

Body:

```json
{
  "event_type": "cron-job",
  "client_payload": {
    "source": "cron-job.org",
    "interval": "3h"
  }
}
```

O token precisa ter permissão para disparar `repository_dispatch` no repositório.
