// Suíte de fumaça (smoke test) do Painel Formato 3D.
// Roda o painel de verdade (painel/index.html) num Chromium headless, contra um
// backend falso local (mock_backend.js) — nunca toca na planilha real. Pensada
// pra rodar no GitHub Actions a cada push (ver .github/workflows/tests.yml).
const path = require('path');
const { chromium } = require('playwright');
const { criarMockBackend } = require('./mock_backend');

const PORTA = 8931;
let falhas = 0;
function assert(condicao, mensagem){
  if (condicao) {
    console.log('  ok - ' + mensagem);
  } else {
    console.error('  FALHOU - ' + mensagem);
    falhas++;
  }
}

(async () => {
  const server = await criarMockBackend(PORTA);
  const browser = await chromium.launch();
  const errosJs = [];
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on('pageerror', e => errosJs.push(e.message));

  const caminho = path.resolve(__dirname, '..', 'painel', 'index.html');
  const url = 'file://' + caminho + '?api=' + encodeURIComponent('http://localhost:' + PORTA + '/exec');
  await page.goto(url);
  await page.evaluate(() => {
    localStorage.setItem('sessaoToken', 'sess-abc');
    localStorage.setItem('sessaoUsuario', 'felipe');
  });
  await page.evaluate(() => { document.body.classList.add('autenticado'); carregarDoServidor(); });
  await page.waitForTimeout(600);

  console.log('Grupo: carregamento inicial');
  assert(await page.evaluate(() => document.body.classList.contains('autenticado')), 'painel autenticado após carregar sessão salva');
  assert(await page.evaluate(() => state.clientes.length === 1), 'carregou o cliente inicial do backend falso');

  console.log('Grupo: lixeira — cliente (excluir vira restaurável, não some de vez)');
  await page.evaluate(() => {
    state.clientes.push({id: uid('cliente'), nome: 'Cliente CI Teste', telefone:'', email:'', cidade:'Manaus/AM'});
    marcarAlterado();
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    window.confirm = () => true;
    const c = state.clientes.find(x => x.nome === 'Cliente CI Teste');
    excluirCliente(c.id);
  });
  await page.waitForTimeout(900);
  assert(await page.evaluate(() => clientesAtivos().every(c => c.nome !== 'Cliente CI Teste')), 'cliente excluído some da lista de ativos');
  assert(await page.evaluate(() => state.clientes.some(c => c.nome === 'Cliente CI Teste')), 'cliente excluído continua existindo nos dados (soft delete)');
  await page.evaluate(() => mostrarAba('lixeira'));
  await page.waitForTimeout(150);
  assert(await page.evaluate(() => document.getElementById('corpoLixeira').textContent.includes('Cliente CI Teste')), 'cliente excluído aparece na tela de Lixeira');
  await page.evaluate(() => {
    const c = state.clientes.find(x => x.nome === 'Cliente CI Teste');
    restaurarItemLixeira('clientes', c.id);
  });
  await page.waitForTimeout(900);
  assert(await page.evaluate(() => clientesAtivos().some(c => c.nome === 'Cliente CI Teste')), 'cliente volta a aparecer como ativo depois de restaurar');

  console.log('Grupo: lixeira — produto');
  await page.evaluate(() => {
    state.produtos.push({id: uid('produto'), codigo:'CI1', nome:'Produto CI Teste', categoria:'', precoCusto:1, preco:10, unidade:'un', peso:0, quantidade:5, alertaEstoqueBaixo:5, foto:'', descricao:''});
    marcarAlterado();
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    window.confirm = () => true;
    const p = state.produtos.find(x => x.nome === 'Produto CI Teste');
    excluirProduto(p.id);
  });
  await page.waitForTimeout(900);
  assert(await page.evaluate(() => produtosAtivos().every(p => p.nome !== 'Produto CI Teste')), 'produto excluído some da lista de ativos');
  await page.evaluate(() => mostrarAba('produtos'));
  await page.waitForTimeout(150);
  assert(await page.evaluate(() => !document.getElementById('corpoTabelaProdutos').textContent.includes('Produto CI Teste')), 'produto excluído não aparece na tabela de produtos');

  console.log('Grupo: orçamento parado (alerta de 5+ dias sem resposta)');
  await page.evaluate(() => {
    const clienteId = state.clientes[0].id;
    const dataPassada = new Date();
    dataPassada.setDate(dataPassada.getDate() - 8);
    const dataStr = String(dataPassada.getDate()).padStart(2,'0') + '/' + String(dataPassada.getMonth()+1).padStart(2,'0') + '/' + dataPassada.getFullYear();
    state.orcamentos.push({
      id: uid('orcamento'), numero: state.proximoNumero, clienteId, data: dataStr, validadeDias:'7',
      status:'Pendente', frete:0, desconto:0, total:200, obs:'', financeiroGerado:false,
      condicaoPagamento:'', formasPagamento:[], itens:[{ produtoId:null, cod:'X', descricao:'Item parado', qtd:1, valorUnit:200, custoUnit:50 }]
    });
    state.proximoNumero++;
    marcarAlterado();
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => mostrarAba('dashboard'));
  await page.waitForTimeout(150);
  assert(await page.evaluate(() => !document.getElementById('boxOrcamentosParados').classList.contains('hidden')), 'alerta de orçamento parado aparece no dashboard');

  console.log('Grupo: relatórios');
  await page.evaluate(() => {
    const clienteId = state.clientes[0].id;
    const hoje = new Date();
    const dataStr = String(hoje.getDate()).padStart(2,'0') + '/' + String(hoje.getMonth()+1).padStart(2,'0') + '/' + hoje.getFullYear();
    state.orcamentos.push({
      id: uid('orcamento'), numero: state.proximoNumero, clienteId, data: dataStr, validadeDias:'7',
      status:'Aprovado', frete:0, desconto:0, total:150, obs:'', financeiroGerado:false,
      condicaoPagamento:'', formasPagamento:[], itens:[{ produtoId:null, cod:'X1', descricao:'Item Relatorio CI', qtd:2, valorUnit:75, custoUnit:20 }]
    });
    state.proximoNumero++;
    marcarAlterado();
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => mostrarAba('relatorios'));
  await page.waitForTimeout(200);
  assert(await page.evaluate(() => document.getElementById('relTopProdutos').textContent.includes('Item Relatorio CI')), 'produto vendido aparece no relatório de mais vendidos');
  assert(await page.evaluate(() => document.getElementById('relVendasMes').children.length > 0), 'gráfico de vendas por mês renderizou barras');

  console.log('Grupo: baixa de estoque ao confirmar venda (orçamento Aprovado/Concluído)');
  await page.evaluate(() => {
    state.produtos.push({id:'prod_ci1', codigo:'CI2', nome:'Produto Estoque CI', categoria:'', precoCusto:5, preco:20, unidade:'un', peso:0, quantidade:10, alertaEstoqueBaixo:5, foto:'', descricao:''});
    marcarAlterado();
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const clienteId = state.clientes[0].id;
    const o = {
      id: uid('orcamento'), numero: state.proximoNumero, clienteId, data: hojeStr(), validadeDias:'7',
      status:'Pendente', frete:0, desconto:0, total:60, obs:'', financeiroGerado:false, estoqueBaixado:false,
      condicaoPagamento:'', formasPagamento:[], itens:[{ produtoId:'prod_ci1', cod:'CI2', descricao:'Produto Estoque CI', qtd:3, valorUnit:20, custoUnit:5 }]
    };
    state.orcamentos.push(o);
    window.__orcEstoqueId = o.id;
    state.proximoNumero++;
    marcarAlterado();
  });
  await page.waitForTimeout(900);
  assert(await page.evaluate(() => state.produtos.find(p => p.id === 'prod_ci1').quantidade === 10), 'orçamento Pendente não mexe no estoque');
  await page.evaluate(() => {
    const o = state.orcamentos.find(x => x.id === window.__orcEstoqueId);
    o.status = 'Aprovado';
    confirmarVendaSeNecessario(o);
    marcarAlterado();
  });
  await page.waitForTimeout(900);
  assert(await page.evaluate(() => state.produtos.find(p => p.id === 'prod_ci1').quantidade === 7), 'estoque desconta a quantidade do item ao aprovar/confirmar a venda (10 - 3 = 7)');
  await page.evaluate(() => {
    const o = state.orcamentos.find(x => x.id === window.__orcEstoqueId);
    confirmarVendaSeNecessario(o); // chamando de novo (ex.: salvar o orçamento outra vez já Aprovado)
    marcarAlterado();
  });
  await page.waitForTimeout(900);
  assert(await page.evaluate(() => state.produtos.find(p => p.id === 'prod_ci1').quantidade === 7), 'não desconta o estoque de novo numa segunda confirmação (flag estoqueBaixado evita duplicar)');

  console.log('Grupo: recibo — oferece gerar ao confirmar pagamento e preenche a área de impressão');
  await page.evaluate(() => {
    window.print = () => {}; // evita abrir o diálogo real de impressão durante o teste
    const clienteId = state.clientes[0].id;
    state.financeiro.push({id:'fin_ci1', tipo:'receber', descricao:'Orçamento nº 0099 - Cliente CI Recibo', valor:123.45, vencimento:hojeStr(), categoria:'Orçamento', clienteId, orcamentoId:null, status:'pendente'});
    marcarAlterado();
  });
  await page.waitForTimeout(900);
  const respostaConfirm = await page.evaluate(() => {
    window.__confirmMsg = null;
    window.confirm = (msg) => { window.__confirmMsg = msg; return false; }; // recusa gerar o recibo dessa vez
    alternarStatusFinanceiro('fin_ci1');
    return window.__confirmMsg;
  });
  await page.waitForTimeout(900);
  assert(await page.evaluate(() => state.financeiro.find(f => f.id === 'fin_ci1').status === 'pago'), 'marcar conta a receber como paga funciona normalmente');
  assert(!!respostaConfirm && /recibo/i.test(respostaConfirm), 'ao confirmar pagamento de uma venda, o painel pergunta se quer gerar o recibo');
  await page.evaluate(() => renderFinanceiro());
  assert(await page.evaluate(() => !!document.querySelector('button[onclick*="abrirRecibo(\'fin_ci1\')"]')), 'botão de gerar recibo (🧾) aparece na linha da conta paga');
  await page.evaluate(() => { abrirRecibo('fin_ci1'); });
  await page.waitForTimeout(150);
  assert(await page.evaluate(() => document.getElementById('printAreaRecibo').classList.contains('ativo')), 'área de impressão do recibo fica ativa ao gerar');
  assert(await page.evaluate(() => !document.getElementById('printArea').classList.contains('ativo')), 'área de impressão do orçamento fica inativa ao gerar um recibo');
  assert(await page.evaluate(() => document.getElementById('reValorNum').textContent.trim() === 'R$ 123,45'), 'valor do recibo mostrado corretamente');
  assert(await page.evaluate(() => document.getElementById('reValorExtenso').textContent === 'Cento e vinte e três reais e quarenta e cinco centavos'), 'valor por extenso calculado corretamente');
  assert(await page.evaluate(() => document.getElementById('rePagoPor').textContent === 'Meire São Vicente Pallotti'), 'nome do cliente aparece no recibo');
  assert(await page.evaluate(() => /^\d{4}$/.test(document.getElementById('reNumero').textContent)), 'recibo recebe um número sequencial de 4 dígitos');
  const numeroReciboAntes = await page.evaluate(() => state.financeiro.find(f => f.id === 'fin_ci1').reciboNumero);
  await page.evaluate(() => { abrirRecibo('fin_ci1'); });
  await page.waitForTimeout(150);
  assert(await page.evaluate((n) => state.financeiro.find(f => f.id === 'fin_ci1').reciboNumero === n, numeroReciboAntes), 'gerar o recibo de novo mantém o mesmo número (não gera um novo a cada impressão)');

  console.log('Grupo: orçamento e financeiro (venda) ficam interligados');
  await page.evaluate(() => {
    state.clientes.push({id:'cli_sync_a', nome:'Cliente Sync A', telefone:'', email:'', cidade:'Manaus/AM'});
    state.clientes.push({id:'cli_sync_b', nome:'Cliente Sync B', telefone:'', email:'', cidade:'Manaus/AM'});
    const o = {
      id:'orc_sync1', numero: state.proximoNumero, clienteId:'cli_sync_a', data: hojeStr(), validadeDias:'7',
      status:'Aprovado', frete:0, desconto:0, total:100, obs:'', financeiroGerado:false, estoqueBaixado:true,
      condicaoPagamento:'', formasPagamento:['Pix'], itens:[{ produtoId:null, cod:'', descricao:'Item sync', qtd:1, valorUnit:100, custoUnit:0 }]
    };
    state.orcamentos.push(o);
    state.proximoNumero++;
    gerarContaReceber('orc_sync1');
  });
  await page.waitForTimeout(900);
  const finSyncId = await page.evaluate(() => state.financeiro.find(f => f.orcamentoId === 'orc_sync1').id);
  assert(await page.evaluate((id) => state.financeiro.find(f => f.id === id).valor === 100, finSyncId), 'gerar a venda a partir do orçamento traz o valor certo');

  // Mudou o orçamento (cliente e valor) enquanto a venda ainda está pendente — tem que refletir sozinho.
  await page.evaluate(() => {
    const o = state.orcamentos.find(x => x.id === 'orc_sync1');
    o.clienteId = 'cli_sync_b';
    o.total = 180;
    sincronizarFinanceiroComOrcamento(o);
    marcarAlterado();
  });
  await page.waitForTimeout(900);
  assert(await page.evaluate((id) => state.financeiro.find(f => f.id === id).valor === 180, finSyncId), 'mudar o valor do orçamento atualiza a venda pendente automaticamente');
  assert(await page.evaluate((id) => state.financeiro.find(f => f.id === id).clienteId === 'cli_sync_b', finSyncId), 'mudar o cliente do orçamento atualiza a venda pendente automaticamente');

  // Confirma o pagamento (pago) e SÓ DEPOIS o orçamento muda de novo — não pode reescrever um pagamento já confirmado.
  await page.evaluate((id) => {
    window.confirm = () => false; // não precisa gerar recibo nesse teste
    alternarStatusFinanceiro(id);
  }, finSyncId);
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const o = state.orcamentos.find(x => x.id === 'orc_sync1');
    o.total = 999;
    sincronizarFinanceiroComOrcamento(o);
    marcarAlterado();
  });
  await page.waitForTimeout(900);
  assert(await page.evaluate((id) => state.financeiro.find(f => f.id === id).valor === 180, finSyncId), 'venda já paga não é sobrescrita quando o orçamento muda depois');
  assert(await page.evaluate((id) => financeiroDessincronizado(state.financeiro.find(f => f.id === id)) === true, finSyncId), 'venda paga com orçamento alterado depois fica marcada como desencontrada');
  await page.evaluate(() => renderFinanceiro());
  assert(await page.evaluate(() => document.getElementById('corpoTabelaFinanceiro').textContent.includes('orçamento mudou')), 'aviso de desencontro aparece na tabela do Financeiro');

  // Formulário: cliente/valor ficam travados quando a venda está vinculada a um orçamento.
  await page.evaluate((id) => abrirFormFinanceiro(id), finSyncId);
  await page.waitForTimeout(150);
  assert(await page.evaluate(() => document.getElementById('ffCliente').disabled === true), 'campo de cliente fica travado no formulário quando vinculado a um orçamento');
  assert(await page.evaluate(() => document.getElementById('ffValor').readOnly === true), 'campo de valor fica travado no formulário quando vinculado a um orçamento');
  assert(await page.evaluate(() => !document.getElementById('ffVinculoAviso').classList.contains('hidden')), 'aviso de vínculo com o orçamento aparece no formulário');
  await page.evaluate(() => fecharFormFinanceiro());
  await page.evaluate(() => abrirFormFinanceiro('fin_ci1'));
  await page.waitForTimeout(150);
  assert(await page.evaluate(() => document.getElementById('ffCliente').disabled === false), 'conta sem orçamento vinculado continua com o campo de cliente editável');
  await page.evaluate(() => fecharFormFinanceiro());

  console.log('Grupo: parcelamento automático (contas a pagar/receber)');
  const calc = await page.evaluate(() => {
    const valores = dividirValorEmParcelas(100, 3);
    const datasMensal = [0,1,2].map(i => calcularVencimentoParcela('31/01/2026', i, 'mensal'));
    return { valores, somaValores: Math.round(valores.reduce((s,v) => s+v, 0) * 100) / 100, datasMensal };
  });
  assert(calc.somaValores === 100, 'dividirValorEmParcelas(100,3) soma exatamente o valor total, sem sobrar/perder centavo no arredondamento');
  assert(calc.valores[0] === 33.34 && calc.valores[1] === 33.33 && calc.valores[2] === 33.33, 'o centavo de resto do arredondamento vai pra(s) primeira(s) parcela(s) (33,34 + 33,33 + 33,33)');
  assert(calc.datasMensal[0] === '31/01/2026' && calc.datasMensal[1] === '28/02/2026' && calc.datasMensal[2] === '31/03/2026', 'vencimento mensal trata fim de mês direito (31/01 -> 28/02, não estoura pra 03/03)');

  await page.evaluate(() => abrirFormFinanceiro());
  await page.waitForTimeout(150);
  assert(await page.evaluate(() => !document.getElementById('ffParceladoBloco').classList.contains('hidden')), 'opção de parcelar aparece ao abrir o formulário de uma conta nova');
  assert(await page.evaluate(() => document.getElementById('ffParcelado').checked === false), 'a opção de parcelar começa desmarcada por padrão');
  await page.evaluate(() => {
    document.getElementById('ffTipo').value = 'pagar';
    document.getElementById('ffDescricao').value = 'Compra parcelada CI';
    document.getElementById('ffValor').value = '1000,00';
    document.getElementById('ffVencimento').value = '10/08/2026';
    document.getElementById('ffCategoria').value = 'Fornecedor';
    document.getElementById('ffParcelado').checked = true;
    alternarParcelamento();
    document.getElementById('ffParcelas').value = '10';
    atualizarPreviewParcelas();
  });
  assert(await page.evaluate(() => !document.getElementById('ffParceladoCampos').classList.contains('hidden')), 'campos de nº de parcelas e intervalo aparecem ao marcar "parcelar"');
  assert(await page.evaluate(() => document.getElementById('ffParcelaPreview').textContent.includes('10x de R$ 100,00')), 'a prévia mostra o valor de cada parcela calculado a partir do total (1000 / 10 = 100,00)');
  await page.evaluate(() => salvarFinanceiro());
  await page.waitForTimeout(900);
  const parcelas = await page.evaluate(() => financeiroAtivos().filter(f => f.descricao === 'Compra parcelada CI').sort((a,b) => a.parcelaNum - b.parcelaNum).map(f => ({ id:f.id, tipo:f.tipo, categoria:f.categoria, valor:f.valor, vencimento:f.vencimento, status:f.status, parcelaNum:f.parcelaNum, parcelaTotal:f.parcelaTotal, parcelamentoId:f.parcelamentoId })));
  assert(parcelas.length === 10, 'salvar uma conta marcada como parcelada em 10x cria os 10 lançamentos sozinho (não precisa cadastrar um por um)');
  assert(parcelas.every(p => p.tipo === 'pagar' && p.categoria === 'Fornecedor' && p.status === 'pendente'), 'todas as parcelas herdam tipo, categoria e status informados uma única vez no formulário');
  assert(parcelas.every((p,i) => p.parcelaNum === i+1 && p.parcelaTotal === 10), 'cada parcela sabe seu número dentro do total (ex.: a 3ª de 10)');
  assert(new Set(parcelas.map(p => p.parcelamentoId)).size === 1, 'todas as parcelas de uma mesma compra compartilham o mesmo id de parcelamento (ficam agrupadas)');
  const somaParcelas = Math.round(parcelas.reduce((s,p) => s + p.valor, 0) * 100) / 100;
  assert(somaParcelas === 1000, 'a soma das 10 parcelas bate exatamente com o valor total de R$ 1000,00 informado');
  assert(parcelas[0].vencimento === '10/08/2026', 'a 1ª parcela vence na data informada no formulário');
  assert(parcelas[1].vencimento === '10/09/2026', 'a 2ª parcela vence 1 mês depois (intervalo mensal, o padrão)');
  assert(parcelas[9].vencimento === '10/05/2027', 'a 10ª (última) parcela vence 9 meses depois da 1ª — cada parcela já nasce na data certa, sem precisar cadastrar uma por uma');

  await page.evaluate((id) => abrirFormFinanceiro(id), parcelas[2].id);
  await page.waitForTimeout(150);
  assert(await page.evaluate(() => document.getElementById('ffParceladoBloco').classList.contains('hidden')), 'a opção de parcelar fica escondida ao editar uma parcela já existente (evita reparcelar por engano)');
  assert(await page.evaluate(() => !document.getElementById('ffParcelaInfoAviso').classList.contains('hidden')), 'aviso informando de qual parcela se trata aparece ao editar uma parcela');
  assert(await page.evaluate(() => document.getElementById('ffParcelaInfoTexto').textContent === '3 de 10'), 'o aviso mostra o número certo da parcela sendo editada (3 de 10)');
  await page.evaluate(() => fecharFormFinanceiro());
  await page.evaluate(() => abrirFormFinanceiro());
  await page.waitForTimeout(150);
  assert(await page.evaluate(() => document.getElementById('ffParcelaInfoAviso').classList.contains('hidden')), 'o aviso de parcela some ao abrir o formulário pra uma conta nova (sem parcela nenhuma)');
  await page.evaluate(() => fecharFormFinanceiro());

  await page.evaluate(() => renderFinanceiro());
  assert(await page.evaluate(() => document.getElementById('corpoTabelaFinanceiro').textContent.includes('3/10')), 'a tabela do Financeiro mostra a etiqueta "3/10" identificando a parcela na listagem');

  console.log('Grupo: exportar Excel não quebra mesmo sem a lib carregada');
  const exportResult = await page.evaluate(() => {
    try { exportarFinanceiroExcel(); return 'sem erro'; } catch(e) { return 'ERRO: ' + e.message; }
  });
  assert(exportResult === 'sem erro', 'exportarFinanceiroExcel() não lança exceção (' + exportResult + ')');

  console.log('Grupo: logout invalida sessão no servidor');
  let chamouLogout = false;
  await page.evaluate(() => {
    window.__logoutOk = false;
    const origFetch = window.fetch;
    window.fetch = function(u, opts){
      if(opts && opts.body){ try{ if(JSON.parse(opts.body).action === 'logout') window.__logoutOk = true; }catch(e){} }
      return origFetch(u, opts);
    };
    window.confirm = () => true;
    sair();
  });
  await page.waitForTimeout(300);
  chamouLogout = await page.evaluate(() => window.__logoutOk);
  assert(chamouLogout, 'sair() manda a ação "logout" pro backend');
  assert(await page.evaluate(() => !document.body.classList.contains('autenticado')), 'painel volta pra tela de login depois de sair');

  console.log('Grupo: nenhum erro de JS não tratado durante os testes');
  assert(errosJs.length === 0, 'sem erros de JavaScript no console (' + JSON.stringify(errosJs) + ')');

  await browser.close();
  server.close();

  console.log('\n' + (falhas === 0 ? 'TUDO OK ✅' : (falhas + ' verificação(ões) falharam ❌')));
  process.exit(falhas === 0 ? 0 : 1);
})().catch(err => {
  console.error('Erro inesperado rodando os testes:', err);
  process.exit(1);
});
