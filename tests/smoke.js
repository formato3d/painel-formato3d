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
