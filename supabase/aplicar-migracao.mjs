// Aplica UMA migração de supabase/migrations/ no banco de produção e a registra
// no histórico do Supabase (supabase_migrations.schema_migrations).
// Uso: node supabase/aplicar-migracao.mjs supabase/migrations/<arquivo>.sql
// Lê SUPABASE_ACCESS_TOKEN do .env.local. Depois de aplicar, rode
// `node supabase/gerar-schema.mjs` para atualizar o retrato em supabase/schema.sql.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REF = 'vkheedwuoppvodkqovgv';
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pastaMigracoes = path.join(raiz, 'supabase', 'migrations');

const arg = process.argv[2];
if (!arg) {
  console.error('Informe o arquivo: node supabase/aplicar-migracao.mjs supabase/migrations/<arquivo>.sql');
  process.exit(1);
}
const arquivo = path.resolve(raiz, arg);
// Só aceita arquivos .sql de dentro de supabase/migrations/.
if (path.dirname(arquivo) !== pastaMigracoes || !arquivo.endsWith('.sql') || !fs.existsSync(arquivo)) {
  console.error(`Recusado: o arquivo precisa existir e estar em supabase/migrations/ (recebido: ${arg})`);
  process.exit(1);
}

const env = Object.fromEntries(
  fs.readFileSync(path.join(raiz, '.env.local'), 'utf8').split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);

// "20260923130000_fechar_acesso_publico.sql" -> nome "fechar_acesso_publico"
const nome = path.basename(arquivo, '.sql').replace(/^\d+_/, '');
const sql = fs.readFileSync(arquivo, 'utf8');

const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/migrations`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql, name: nome }),
});
const corpo = await r.text();
if (!r.ok) {
  console.error(`FALHOU (HTTP ${r.status}): ${corpo.slice(0, 800)}`);
  process.exit(1);
}
console.log(`OK: ${path.basename(arquivo)} aplicada e registrada como "${nome}".`);
