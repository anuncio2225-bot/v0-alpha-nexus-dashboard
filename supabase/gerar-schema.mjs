// Regera supabase/schema.sql a partir do banco de produção (só estrutura, sem dados).
// Uso: node supabase/gerar-schema.mjs   (lê SUPABASE_ACCESS_TOKEN do .env.local)
import fs from 'node:fs';
const env = Object.fromEntries(fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const REF = 'vkheedwuoppvodkqovgv';
const q = async sql => { const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: 'POST', headers: { Authorization: 'Bearer ' + env.SUPABASE_ACCESS_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }) }); const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j)); return j; };
const out=[]; const P=s=>out.push(s);
const ver=(await q(`select version() v`))[0].v.split(' on ')[0];
const mig=await q(`select version, name from supabase_migrations.schema_migrations order by version`);
P(`-- ============================================================================
-- RETRATO DA ESTRUTURA DO BANCO DE PRODUÇÃO (schema public) — somente estrutura, sem dados.
-- Gerado a partir do catálogo do Postgres em ${new Date().toISOString().slice(0,10)} (${ver}).
-- Projeto Supabase: vkheedwuoppvodkqovgv.
--
-- Por que existe: o v0 aplicou mudanças direto no Supabase e parte delas nunca virou
-- arquivo em scripts/. Este arquivo é a fonte de verdade do que EXISTE hoje.
-- Mudanças novas vão em supabase/migrations/ — e este retrato é regerado depois.
--
-- Migrações registradas no banco (${mig.length}):
${mig.map(m=>`--   ${m.version}  ${m.name}`).join('\n')}
-- ============================================================================\n`);
const ext=await q(`select extname, extversion from pg_extension order by 1`);
P(`-- Aplicadas pelo SQL Editor (fora da tabela acima): 20260923130000_fechar_acesso_publico
`);
P(`-- Extensões instaladas: ${ext.map(e=>e.extname+' '+e.extversion).join(', ')}\n`);
const enums=await q(`select t.typname, string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder) l from pg_type t join pg_enum e on e.enumtypid=t.oid where t.typnamespace='public'::regnamespace group by 1 order by 1`);
if(enums.length){P('-- ---------------------------------------------------------------- TIPOS'); enums.forEach(e=>P(`create type public.${e.typname} as enum (${e.l});`)); P('');}
const tabs=(await q(`select c.oid::int oid, c.relname from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' order by 2`));
const cols=await q(`select a.attrelid::int oid, a.attname, format_type(a.atttypid,a.atttypmod) typ, a.attnotnull nn, pg_get_expr(d.adbin,d.adrelid) def, a.attidentity idn from pg_attribute a join pg_class c on c.oid=a.attrelid left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where c.relnamespace='public'::regnamespace and c.relkind='r' and a.attnum>0 and not a.attisdropped order by a.attrelid, a.attnum`);
const cons=await q(`select conrelid::int oid, conname, contype, pg_get_constraintdef(oid) def from pg_constraint where connamespace='public'::regnamespace and conrelid<>0 order by conrelid, contype, conname`);
P('-- ---------------------------------------------------------------- TABELAS');
for(const t of tabs){
  const lines=cols.filter(c=>c.oid===t.oid).map(c=>`  ${c.attname} ${c.typ}${c.idn?` generated ${c.idn==='a'?'always':'by default'} as identity`:''}${c.def?` default ${c.def}`:''}${c.nn?' not null':''}`);
  cons.filter(c=>c.oid===t.oid && c.contype!=='f').forEach(c=>lines.push(`  constraint ${c.conname} ${c.def}`));
  P(`create table public.${t.relname} (\n${lines.join(',\n')}\n);\n`);
}
P('-- ---------------------------------------------------------------- CHAVES ESTRANGEIRAS');
for(const c of cons.filter(c=>c.contype==='f')) P(`alter table public.${tabs.find(t=>t.oid===c.oid).relname} add constraint ${c.conname} ${c.def};`);
P('\n-- ---------------------------------------------------------------- ÍNDICES');
(await q(`select pg_get_indexdef(i.indexrelid) d from pg_index i join pg_class c on c.oid=i.indrelid where c.relnamespace='public'::regnamespace and not exists (select 1 from pg_constraint k where k.conindid=i.indexrelid) order by c.relname, 1`)).forEach(x=>P(x.d+';'));
P('\n-- ---------------------------------------------------------------- FUNÇÕES');
(await q(`select pg_get_functiondef(p.oid) d from pg_proc p where p.pronamespace='public'::regnamespace order by p.proname`)).forEach(x=>P(x.d.trim()+';\n'));
const fg=await q(`select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' f, has_function_privilege('anon',p.oid,'execute') a, has_function_privilege('authenticated',p.oid,'execute') u from pg_proc p where p.pronamespace='public'::regnamespace order by 1`);
P('-- Permissão de execução (anon = sem login / authenticated = logado):'); fg.forEach(g=>P(`--   ${g.f}: anon=${g.a?'sim':'não'}, logado=${g.u?'sim':'não'}`));
P('\n-- ---------------------------------------------------------------- GATILHOS');
(await q(`select pg_get_triggerdef(t.oid) d from pg_trigger t join pg_class c on c.oid=t.tgrelid where (c.relnamespace='public'::regnamespace or (c.relnamespace='auth'::regnamespace and c.relname='users')) and not t.tgisinternal order by 1`)).forEach(x=>P(x.d.replace('ON users','ON auth.users')+';'));
P('\n-- ---------------------------------------------------------------- RLS (SEGURANÇA POR LINHA)');
(await q(`select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' and relrowsecurity order by 1`)).forEach(x=>P(`alter table public.${x.relname} enable row level security;`));
P('');
(await q(`select tablename t, policyname n, permissive p, cmd, roles::text r, qual, with_check w from pg_policies where schemaname='public' order by 1,2`)).forEach(x=>P(`create policy "${x.n}" on public.${x.t} as ${x.p.toLowerCase()} for ${x.cmd.toLowerCase()} to ${x.r.replace(/[{}]/g,'')}${x.qual?`\n  using (${x.qual})`:''}${x.w?`\n  with check (${x.w})`:''};`));
fs.writeFileSync(new URL('./schema.sql', import.meta.url), out.join('\n')+'\n');
console.log('tabelas',tabs.length,'| colunas',cols.length,'| constraints',cons.length,'| linhas do arquivo', out.join('\n').split('\n').length);
