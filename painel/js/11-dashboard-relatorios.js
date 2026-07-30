/* =========================================================
   DASHBOARD
   ========================================================= */
function renderDashboard(){
  const receberPendente = financeiroAtivos().filter(f => f.tipo === 'receber' && f.status === 'pendente').reduce((s,f) => s + f.valor, 0);
  const pagarPendente = financeiroAtivos().filter(f => f.tipo === 'pagar' && f.status === 'pendente').reduce((s,f) => s + f.valor, 0);
  const saldo = receberPendente - pagarPendente;
  const hoje = new Date();
  const orcAtivos = orcamentosAtivos();
  const orcMes = orcAtivos.filter(o => {
    const d = paraDataObj(o.data);
    return d && d.getMonth() === hoje.getMonth() && d.getFullYear() === hoje.getFullYear();
  }).length;

  const lucro = lucroDoMes();
  document.getElementById('cardsDashboard').innerHTML = `
    <div class="card"><div class="label">Clientes</div><div class="value">${clientesAtivos().length}</div></div>
    <div class="card"><div class="label">Produtos/serviços</div><div class="value">${produtosAtivos().length}</div></div>
    <div class="card"><div class="label">Orçamentos este mês</div><div class="value">${orcMes}</div><div class="sub">${orcAtivos.length} no total · próximo nº ${String(state.proximoNumero).padStart(4,'0')}</div></div>
    <div class="card"><div class="label">A receber (pendente)</div><div class="value green">R$ ${fmtMoeda(receberPendente)}</div></div>
    <div class="card"><div class="label">A pagar (pendente)</div><div class="value red">R$ ${fmtMoeda(pagarPendente)}</div></div>
    <div class="card"><div class="label">Saldo previsto</div><div class="value ${saldo >= 0 ? 'green' : 'red'}">R$ ${fmtMoeda(saldo)}</div></div>
    <div class="card"><div class="label">Lucro do mês</div><div class="value ${lucro >= 0 ? 'green' : 'red'}">R$ ${fmtMoeda(lucro)}</div><div class="sub">Vendas aprovadas menos custo</div></div>
  `;

  const venc = financeiroAtivos()
    .filter(f => f.status === 'pendente' && f.vencimento)
    .map(f => ({f, d: paraDataObj(f.vencimento)}))
    .filter(x => x.d)
    .sort((a,b) => a.d - b.d)
    .slice(0, 8);
  const corpoVenc = document.getElementById('corpoVencimentos');
  corpoVenc.innerHTML = venc.length === 0 ? '<tr class="empty-row"><td colspan="5">Nada por aqui.</td></tr>' : '';
  venc.forEach(({f}) => {
    const vencido = estaVencido(f);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${esc(f.descricao)}</td><td><span class="badge ${f.tipo}">${f.tipo === 'pagar' ? 'Pagar' : 'Receber'}</span></td><td>${esc(nomeClienteOpcional(f.clienteId))}</td><td style="${vencido?'color:#c0392b;font-weight:bold;':''}">${fmtDataExibir(f.vencimento)}</td><td>R$ ${fmtMoeda(f.valor)}</td>`;
    corpoVenc.appendChild(tr);
  });

  const ultimos = orcAtivos.slice(-6).reverse();
  const corpoOrc = document.getElementById('corpoUltimosOrc');
  corpoOrc.innerHTML = ultimos.length === 0 ? '<tr class="empty-row"><td colspan="4">Nenhum orçamento ainda.</td></tr>' : '';
  ultimos.forEach(o => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${esc(o.numero)}</td><td>${esc(nomeCliente(o.clienteId))}</td><td>R$ ${fmtMoeda(o.total)}</td><td>${badgeStatusOrc(o.status)}</td>`;
    corpoOrc.appendChild(tr);
  });

  renderOrcamentosParados();
}

// Orçamentos com status "Pendente" há X dias ou mais, sem resposta — sinaliza pra dar um retorno ao cliente.
var DIAS_ORCAMENTO_PARADO = 5;
function renderOrcamentosParados(){
  const hoje = new Date();
  hoje.setHours(0,0,0,0);
  const parados = orcamentosAtivos()
    .filter(o => o.status === 'Pendente')
    .map(o => {
      const d = paraDataObj(o.data);
      if(!d) return null;
      d.setHours(0,0,0,0);
      const dias = Math.round((hoje - d) / (1000*60*60*24));
      return { o, dias };
    })
    .filter(x => x && x.dias >= DIAS_ORCAMENTO_PARADO)
    .sort((a,b) => b.dias - a.dias);

  const box = document.getElementById('boxOrcamentosParados');
  const corpo = document.getElementById('corpoOrcamentosParados');
  if(parados.length === 0){
    box.classList.add('hidden');
    return;
  }
  box.classList.remove('hidden');
  corpo.innerHTML = '';
  parados.forEach(({o, dias}) => {
    const grave = dias >= 10;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${esc(o.numero)}</td><td>${esc(nomeCliente(o.clienteId))}</td><td>R$ ${fmtMoeda(o.total)}</td>
      <td><span class="badge ${grave ? 'vencido' : 'pendente'}">${dias} dia${dias > 1 ? 's' : ''}</span></td>
      <td class="acoes">
        <button class="btn-icon" onclick="imprimirOrcamento('${o.id}')" title="Imprimir / PDF">🖨</button>
        <button class="btn-icon" onclick="enviarOrcamentoWhatsApp('${o.id}')" title="Cobrar retorno pelo WhatsApp">📲</button>
      </td>`;
    corpo.appendChild(tr);
  });
}

/* =========================================================
   RELATÓRIOS (gráficos simples de barra, sem depender de libs externas)
   ========================================================= */
const NOMES_MES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function mesesUltimos(n){
  const hoje = new Date();
  const arr = [];
  for(let i = n - 1; i >= 0; i--){
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    arr.push({ ano: d.getFullYear(), mes: d.getMonth(), rotulo: NOMES_MES_ABREV[d.getMonth()] + '/' + String(d.getFullYear()).slice(2) });
  }
  return arr;
}
function calcularVendasPorMes(orcamentos, meses){
  const vendidos = orcamentos.filter(o => o.status === 'Aprovado' || o.status === 'Concluído');
  return meses.map(({ano, mes, rotulo}) => {
    const total = vendidos
      .filter(o => { const d = paraDataObj(o.data); return d && d.getFullYear() === ano && d.getMonth() === mes; })
      .reduce((s,o) => s + (o.total || 0), 0);
    return { rotulo, total };
  });
}
function calcularLucroPorMes(orcamentos, meses){
  const vendidos = orcamentos.filter(o => o.status === 'Aprovado' || o.status === 'Concluído');
  return meses.map(({ano, mes, rotulo}) => {
    const lucro = vendidos
      .filter(o => { const d = paraDataObj(o.data); return d && d.getFullYear() === ano && d.getMonth() === mes; })
      .reduce((s,o) => s + lucroOrcamento(o), 0);
    return { rotulo, lucro };
  });
}
function produtosMaisVendidos(orcamentos, limite){
  const mapa = {};
  orcamentos.filter(o => o.status === 'Aprovado' || o.status === 'Concluído').forEach(o => {
    (o.itens || []).forEach(it => {
      const chave = it.produtoId || ('livre_' + (it.descricao || it.cod || '?'));
      const nome = it.descricao || it.cod || 'Item';
      if(!mapa[chave]) mapa[chave] = { nome, qtd: 0, receita: 0 };
      mapa[chave].qtd += (it.qtd || 0);
      mapa[chave].receita += (it.qtd || 0) * (it.valorUnit || 0);
    });
  });
  return Object.values(mapa).sort((a,b) => b.receita - a.receita).slice(0, limite);
}
function barraHtml(rotulo, valorBarra, max, cor, formatador){
  const pct = max > 0 ? Math.max(2, Math.round((valorBarra / max) * 100)) : 2;
  return `<div class="rel-bar-row">
    <div class="rel-bar-rotulo" title="${esc(rotulo)}">${esc(rotulo)}</div>
    <div class="rel-bar-trilho"><div class="rel-bar-fill" style="width:${pct}%;background:${cor};"></div></div>
    <div class="rel-bar-valor">${formatador(valorBarra)}</div>
  </div>`;
}
function renderRelatorios(){
  const ativos = orcamentosAtivos();
  const meses = mesesUltimos(12);

  const vendas = calcularVendasPorMes(ativos, meses);
  const maxVenda = Math.max(1, ...vendas.map(v => v.total));
  document.getElementById('relVendasMes').innerHTML = vendas.some(v => v.total > 0)
    ? vendas.map(v => barraHtml(v.rotulo, v.total, maxVenda, 'var(--navy)', x => 'R$ ' + fmtMoeda(x))).join('')
    : '<p style="color:var(--gray)">Sem vendas registradas ainda.</p>';

  const lucros = calcularLucroPorMes(ativos, meses);
  const maxLucro = Math.max(1, ...lucros.map(l => Math.abs(l.lucro)));
  document.getElementById('relLucroMes').innerHTML = lucros.some(l => l.lucro !== 0)
    ? lucros.map(l => barraHtml(l.rotulo, Math.abs(l.lucro), maxLucro, l.lucro >= 0 ? 'var(--green)' : 'var(--red)', x => (l.lucro < 0 ? '-' : '') + 'R$ ' + fmtMoeda(x))).join('')
    : '<p style="color:var(--gray)">Sem dados ainda.</p>';

  const top = produtosMaisVendidos(ativos, 10);
  const maxReceita = Math.max(1, ...top.map(p => p.receita));
  document.getElementById('relTopProdutos').innerHTML = top.length
    ? top.map(p => barraHtml(p.nome + ' (' + p.qtd + ')', p.receita, maxReceita, 'var(--navy)', x => 'R$ ' + fmtMoeda(x))).join('')
    : '<p style="color:var(--gray)">Nenhuma venda aprovada/concluída ainda.</p>';
}

