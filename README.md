# synthesisui

CLI para trazer design systems publicados no [SynthesisUI](https://www.synthesisui.com)
para dentro de qualquer projeto. Materializa o sistema em `_local/ds/<slug>/` e injeta
um bloco gerenciado no `CLAUDE.md` da raiz, de forma que o Claude Code construa
componentes seguindo o design system.

## Uso

Sem instalar nada:

```bash
npx synthesisui login        # conecta o CLI à sua conta (device-flow no browser)
npx synthesisui list         # lista os design systems disponíveis
npx synthesisui add <slug>   # traz um DS para _local/ds/<slug>/
```

Ou instale globalmente:

```bash
npm install -g synthesisui
synthesisui add halogen
```

### O que o `add` materializa

Em `_local/ds/<slug>/`:

- `design-system.json` — a verdade canônica do design system
- `tokens.css` — CSS custom properties escopadas por `data-ds`
- `GUIDE.md` — instruções para o agente (papéis semânticos, mood, recipes, como adicionar componentes)
- `.lock` — slug + versão pinada (reproduzível)

E injeta um bloco idempotente `<!-- synthesisui:start/end -->` no `CLAUDE.md` da raiz,
refletindo todos os DSs instalados.

## Autenticação

`synthesisui login` usa device-flow (RFC 8628): abre o browser, você confirma um código,
e o token é salvo em `~/.synthesisui/credentials.json` (por máquina). Logout = apagar esse arquivo.

## Registry

Por padrão aponta para `https://www.synthesisui.com`. Sobrescreva com:

```bash
synthesisui list --registry http://localhost:3000
# ou
SYNTHESISUI_REGISTRY_URL=http://localhost:3000 synthesisui list
```

## Licença

MIT
