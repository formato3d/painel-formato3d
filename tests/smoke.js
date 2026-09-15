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
  await page.evaluate(() => { alternarStatusFinanceiro('fin_ci1'); });
  await page.waitForTimeout(150);
  assert(await page.evaluate(() => !document.getElementById('confirmarPagamentoWrap').classList.contains('hidden')), 'clicar em confirmar (✓) numa conta a receber abre o pop-up de confirmação, em vez de marcar como pago na hora');
  assert(await page.evaluate(() => document.getElementById('cfValor').value === '123,45'), 'o pop-up já vem preenchido com o valor da conta');
  assert(await page.evaluate(() => document.getElementById('cfData').value === hojeStr()), 'o pop-up já vem preenchido com a data de hoje como data do pagamento');
  const respostaConfirm = await page.evaluate(() => {
    window.__confirmMsg = null;
    window.confirm = (msg) => { window.__confirmMsg = msg; return false; }; // recusa gerar o recibo dessa vez
    confirmarPagamentoSalvar();
    return window.__confirmMsg;
  });
  await page.waitForTimeout(900);
  assert(await page.evaluate(() => document.getElementById('confirmarPagamentoWrap').classList.contains('hidden')), 'o pop-up fecha sozinho depois de confirmar');
  assert(await page.evaluate(() => state.financeiro.find(f => f.id === 'fin_ci1').status === 'pago'), 'confirmar o pagamento no pop-up marca a conta como paga');
  assert(await page.evaluate(() => state.financeiro.find(f => f.id === 'fin_ci1').formaPagamentoConfirmada === 'Pix'), 'a forma de pagamento escolhida no pop-up fica registrada no lançamento');
  assert(!!respostaConfirm && /recibo/i.test(respostaConfirm), 'ao confirmar pagamento de uma venda, o painel pergunta se quer gerar o recibo');
  await page.evaluate(() => mostrarAbaFinanceiro('receber')); // fin_ci1 é do tipo receber — só aparece na aba certa
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

  console.log('Grupo: catálogo de produtos em PDF (pra mandar pro cliente)');
  const alertaSemProdutos = await page.evaluate(() => {
    const guardados = state.produtos;
    state.produtos = []; // simula não ter nenhum produto cadastrado ainda
    window.__alertaCatalogo = null;
    const origAlert = window.alert;
    window.alert = (msg) => { window.__alertaCatalogo = msg; };
    gerarCatalogoPdf();
    const ativouAreaSemProdutos = document.getElementById('printAreaCatalogo').classList.contains('ativo');
    window.alert = origAlert;
    state.produtos = guardados; // restaura pros próximos testes
    return { msg: window.__alertaCatalogo, ativou: ativouAreaSemProdutos };
  });
  assert(!!alertaSemProdutos.msg && /nenhum produto|não há produtos/i.test(alertaSemProdutos.msg), 'sem nenhum produto cadastrado, avisa em vez de gerar um catálogo vazio');
  assert(!alertaSemProdutos.ativou, 'não ativa a área de impressão quando não tem produto pra mostrar');

  await page.evaluate(() => {
    state.produtos.push({
      id: uid('produto'), codigo:'CAT1', nome:'Vaso Geométrico Grande', categoria:'Decoração',
      precoCusto:8, preco:45, unidade:'un', peso:0, quantidade:3, alertaEstoqueBaixo:1,
      foto:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      descricao:'Vaso decorativo com padrão geométrico, acabamento fosco.'
    });
    marcarAlterado();
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => { document.querySelectorAll('.print-area').forEach(el => el.classList.remove('ativo')); gerarCatalogoPdf(); });
  await page.waitForTimeout(150);
  assert(await page.evaluate(() => document.getElementById('printAreaCatalogo').classList.contains('ativo')), 'área de impressão do catálogo fica ativa ao gerar');
  assert(await page.evaluate(() => !document.getElementById('printArea').classList.contains('ativo') && !document.getElementById('printAreaRecibo').classList.contains('ativo')), 'gerar o catálogo desativa as áreas de orçamento/recibo, pra não imprimir as duas juntas');
  assert(await page.evaluate(() => document.getElementById('catGrid').children.length === produtosAtivos().length), 'o catálogo lista todos os produtos ativos (exclui os que estão na lixeira)');
  assert(await page.evaluate(() => document.getElementById('catGrid').textContent.includes('Vaso Geométrico Grande')), 'nome do produto aparece no catálogo');
  assert(await page.evaluate(() => document.getElementById('catGrid').textContent.includes('Decoração')), 'categoria do produto aparece no catálogo');
  assert(await page.evaluate(() => document.getElementById('catGrid').textContent.includes('acabamento fosco')), 'descrição do produto aparece no catálogo');
  assert(await page.evaluate(() => !document.getElementById('catGrid').textContent.includes('R$')), 'o catálogo não mostra preços (combinado: é vitrine, não tabela de preço)');
  assert(await page.evaluate(() => document.querySelector('#catGrid img[alt="Vaso Geométrico Grande"]') !== null), 'foto do produto aparece no catálogo quando cadastrada');
  assert(await page.evaluate(() => document.getElementById('catLogoImg').src === document.getElementById('poLogoImg').src && document.getElementById('catLogoImg').src.length > 0), 'catálogo usa a mesma logo da empresa usada no orçamento/recibo');

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
    alternarStatusFinanceiro(id); // abre o pop-up, já preenchido com o valor/data/forma padrão
    confirmarPagamentoSalvar(); // confirma com os valores padrão (mantém os R$ 180 do lançamento)
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
  await page.evaluate(() => mostrarAbaFinanceiro('receber')); // finSyncId também é do tipo receber
  assert(await page.evaluate(() => document.getElementById('corpoTabelaFinanceiro').textContent.includes('orçamento mudou')), 'aviso de desencontro aparece na tabela do Financeiro');
  assert(await page.evaluate((id) => document.getElementById('financeiro-linha-' + id).innerHTML.includes('atualizarFinanceiroComOrcamento'), finSyncId), 'botão de atualizar (🔄) aparece na linha do lançamento desencontrado');

  // Clica no botão de atualizar: tem que perguntar (mostrando de/para) antes de sobrescrever um pagamento já confirmado.
  await page.evaluate((id) => {
    window.__confirmMsgAtualiza = null;
    window.confirm = (msg) => { window.__confirmMsgAtualiza = msg; return false; }; // recusa dessa vez
    atualizarFinanceiroComOrcamento(id);
  }, finSyncId);
  await page.waitForTimeout(150);
  const respostaConfirmAtualiza = await page.evaluate(() => window.__confirmMsgAtualiza);
  assert(!!respostaConfirmAtualiza && /180.*999|R\$ 180,00.*R\$ 999,00/.test(respostaConfirmAtualiza), 'a pergunta de atualizar mostra o valor antigo e o novo (de/para)');
  assert(await page.evaluate((id) => state.financeiro.find(f => f.id === id).valor === 180, finSyncId), 'recusando a pergunta, o lançamento continua com o valor antigo');

  await page.evaluate((id) => { window.confirm = () => true; atualizarFinanceiroComOrcamento(id); }, finSyncId);
  await page.waitForTimeout(150);
  assert(await page.evaluate((id) => state.financeiro.find(f => f.id === id).valor === 999, finSyncId), 'aceitando a pergunta, o lançamento passa a usar o valor atual do orçamento');
  assert(await page.evaluate((id) => financeiroDessincronizado(state.financeiro.find(f => f.id === id)) === false, finSyncId), 'depois de atualizar, o lançamento não fica mais marcado como desencontrado');
  await page.evaluate(() => mostrarAbaFinanceiro('receber'));
  assert(await page.evaluate(() => !document.getElementById('corpoTabelaFinanceiro').textContent.includes('orçamento mudou')), 'o aviso de desencontro some da tabela depois de atualizar');
  assert(await page.evaluate((id) => !document.getElementById('financeiro-linha-' + id).innerHTML.includes('atualizarFinanceiroComOrcamento'), finSyncId), 'o botão de atualizar (🔄) some depois que não tem mais desencontro');

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

  console.log('Grupo: botão "Ver no financeiro" no orçamento (gerar, ver, e regenerar se o lançamento sumir)');
  await page.evaluate(() => {
    state.clientes.push({id:'cli_verfin', nome:'Cliente VerFin CI', telefone:'', email:'', cidade:'Manaus/AM'});
    const o = {
      id:'orc_verfin1', numero: state.proximoNumero, clienteId:'cli_verfin', data: hojeStr(), validadeDias:'7',
      status:'Aprovado', frete:0, desconto:0, total:250, obs:'', financeiroGerado:false, estoqueBaixado:true,
      condicaoPagamento:'', formasPagamento:['Pix'], itens:[{ produtoId:null, cod:'', descricao:'Item verfin', qtd:1, valorUnit:250, custoUnit:0 }]
    };
    state.orcamentos.push(o);
    state.proximoNumero++;
    mostrarAba('orcamentos');
    renderOrcamentos();
  });
  await page.waitForTimeout(150);
  assert(await page.evaluate(() => document.getElementById('corpoTabelaOrcamentos').innerHTML.includes("gerarContaReceber('orc_verfin1')")), 'orçamento recém-aprovado (ainda sem financeiro) mostra o botão de gerar conta a receber');

  await page.evaluate(() => { gerarContaReceber('orc_verfin1'); renderOrcamentos(); });
  await page.waitForTimeout(150);
  const finVerId = await page.evaluate(() => state.financeiro.find(f => f.orcamentoId === 'orc_verfin1' && !f.excluidoEm).id);
  assert(await page.evaluate(() => document.getElementById('corpoTabelaOrcamentos').innerHTML.includes("verFinanceiroDoOrcamento('orc_verfin1')")), 'depois de gerar, o botão do orçamento vira "Ver no financeiro"');
  assert(await page.evaluate(() => !document.getElementById('corpoTabelaOrcamentos').innerHTML.includes("gerarContaReceber('orc_verfin1')")), 'o botão de gerar conta a receber some depois que já foi gerado (não pode gerar duas vezes)');

  await page.evaluate(() => verFinanceiroDoOrcamento('orc_verfin1'));
  await page.waitForTimeout(150);
  assert(await page.evaluate(() => document.getElementById('navtab-financeiro').classList.contains('active')), 'clicar em "Ver no financeiro" leva pra aba Financeiro');
  assert(await page.evaluate((id) => document.getElementById('financeiro-linha-' + id).classList.contains('linha-em-foco'), finVerId), 'o lançamento vinculado fica destacado na tabela do Financeiro');

  // Exclui o lançamento direto no Financeiro (simula a pessoa apagando por lá) e tenta ver de novo.
  await page.evaluate((id) => { window.confirm = () => true; excluirFinanceiro(id); }, finVerId);
  await page.waitForTimeout(150);
  assert(await page.evaluate(() => financeiroVinculadoAoOrcamento('orc_verfin1') === null), 'depois de excluído no Financeiro, o orçamento não encontra mais o lançamento vinculado');

  await page.evaluate(() => {
    mostrarAba('orcamentos');
    window.__confirmMsgVerFin = null;
    window.confirm = (msg) => { window.__confirmMsgVerFin = msg; return true; }; // aceita gerar de novo
    verFinanceiroDoOrcamento('orc_verfin1');
  });
  await page.waitForTimeout(150);
  const respostaConfirmVerFin = await page.evaluate(() => window.__confirmMsgVerFin);
  assert(!!respostaConfirmVerFin && /gerar novamente/i.test(respostaConfirmVerFin), 'quando o lançamento vinculado não existe mais, o painel pergunta se quer gerar novamente');
  assert(await page.evaluate(() => financeiroVinculadoAoOrcamento('orc_verfin1') !== null), 'aceitando a pergunta, um novo lançamento é gerado e vinculado ao mesmo orçamento');
  assert(await page.evaluate(() => state.orcamentos.find(o => o.id === 'orc_verfin1').financeiroGerado === true), 'o orçamento volta a ficar marcado como "financeiro gerado" depois de regenerar');

  // Exclui de novo e, dessa vez, recusa a regeneração.
  const finVerId2 = await page.evaluate(() => financeiroVinculadoAoOrcamento('orc_verfin1').id);
  await page.evaluate((id) => { window.confirm = () => true; excluirFinanceiro(id); }, finVerId2);
  await page.waitForTimeout(150);
  await page.evaluate(() => { window.confirm = () => false; verFinanceiroDoOrcamento('orc_verfin1'); });
  await page.waitForTimeout(150);
  assert(await page.evaluate(() => financeiroVinculadoAoOrcamento('orc_verfin1') === null), 'recusando a pergunta, nenhum lançamento novo é gerado');

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

  await page.evaluate(() => mostrarAbaFinanceiro('pagar')); // as parcelas criadas acima são do tipo pagar
  assert(await page.evaluate(() => document.getElementById('corpoTabelaFinanceiro').textContent.includes('3/10')), 'a tabela do Financeiro mostra a etiqueta "3/10" identificando a parcela na listagem');

  console.log('Grupo: cards do Financeiro/Dashboard mostram a receber, a pagar, saldo e previsão do mês');
  await page.evaluate(() => {
    const clienteId = state.clientes[0].id;
    // Uma conta a receber vencendo neste mês (pendente) e outra só no mês que vem.
    state.financeiro.push({id:'fin_mes_receber', tipo:'receber', descricao:'Receber este mes CI', valor:500, vencimento:hojeStr(), categoria:'', clienteId, status:'pendente'});
    state.financeiro.push({id:'fin_prox_receber', tipo:'receber', descricao:'Receber mes que vem CI', valor:1000, vencimento:somarMeses(hojeStr(), 1), categoria:'', clienteId, status:'pendente'});
    // Uma conta a pagar vencendo neste mês (pendente) e outra já paga (não deve contar em nada).
    state.financeiro.push({id:'fin_mes_pagar', tipo:'pagar', descricao:'Pagar este mes CI', valor:200, vencimento:hojeStr(), categoria:'', clienteId:null, status:'pendente'});
    state.financeiro.push({id:'fin_pago_ignorar', tipo:'pagar', descricao:'Ja pago CI', valor:9999, vencimento:hojeStr(), categoria:'', clienteId:null, status:'pago'});
    marcarAlterado();
  });
  await page.waitForTimeout(900);

  const totais = await page.evaluate(() => ({
    receberTudo: totalFinanceiroPendente('receber', false),
    receberMes: totalFinanceiroPendente('receber', true),
    pagarMes: totalFinanceiroPendente('pagar', true)
  }));
  assert(totais.receberMes < totais.receberTudo, 'totalFinanceiroPendente(tipo, true) considera só o mês atual — soma menos que o total geral quando existe conta pra mês que vem');
  assert(totais.receberMes >= 500, 'a previsão do mês inclui a conta a receber que vence hoje');
  assert(totais.pagarMes >= 200 && totais.pagarMes < 9999, 'a previsão do mês inclui só contas pendentes desse mês (ignora a que já está paga)');

  await page.evaluate(() => mostrarAba('financeiro'));
  await page.waitForTimeout(150);

  // Aba "A pagar": tabela só mostra lançamentos tipo pagar, e o card de vencidas é específico dela.
  await page.evaluate(() => { document.getElementById('filtroMesFin').value = ''; document.getElementById('filtroStatusFin').value = ''; mostrarAbaFinanceiro('pagar'); });
  await page.waitForTimeout(150);
  const cardsResumoTexto = await page.evaluate(() => document.getElementById('cardsResumoFinanceiro').textContent);
  assert(/Saídas/.test(cardsResumoTexto) && /Recebido/.test(cardsResumoTexto) && /Saldo/.test(cardsResumoTexto), 'os 3 cards simples do resumo (Saídas, Recebido, Saldo) aparecem fixos no topo do Financeiro');
  const tabelaPagarTexto = await page.evaluate(() => document.getElementById('corpoTabelaFinanceiro').textContent);
  assert(tabelaPagarTexto.includes('Pagar este mes CI'), 'a aba "A pagar" mostra os lançamentos do tipo pagar');
  assert(!tabelaPagarTexto.includes('Receber este mes CI'), 'a aba "A pagar" não mostra lançamentos do tipo receber');
  const cardsTipoPagarTexto = await page.evaluate(() => document.getElementById('cardsTipoFinanceiro').textContent);
  assert(/Vencidas \(a pagar\)/.test(cardsTipoPagarTexto), 'o card de vencidas na aba "A pagar" é específico desse tipo');

  // Aba "A receber": o inverso — e ela é quem eu uso pra testar o filtro de mês, porque as
  // duas contas de receber deste teste vencem em meses relativos a "hoje" (não datas fixas).
  await page.evaluate(() => mostrarAbaFinanceiro('receber'));
  await page.waitForTimeout(150);
  const tabelaReceberTexto = await page.evaluate(() => document.getElementById('corpoTabelaFinanceiro').textContent);
  assert(tabelaReceberTexto.includes('Receber este mes CI') && tabelaReceberTexto.includes('Receber mes que vem CI'), 'a aba "A receber" mostra os lançamentos do tipo receber, de todos os meses (filtro em "Todos os meses")');
  assert(!tabelaReceberTexto.includes('Pagar este mes CI'), 'a aba "A receber" não mostra lançamentos do tipo pagar');
  const cardsTipoReceberTexto = await page.evaluate(() => document.getElementById('cardsTipoFinanceiro').textContent);
  assert(/Vencidas \(a receber\)/.test(cardsTipoReceberTexto), 'o card de vencidas na aba "A receber" é específico desse tipo');
  // Nenhuma das contas "a receber" cadastradas neste teste está paga (todas pendentes) —
  // então elas não entram nos cards de Saídas/Recebido/Saldo, que só contam o que já é
  // caixa de verdade (combinado com o usuário: cards simples, só do que já foi pago/recebido).
  const cardReceberTudoTexto = await page.evaluate(() => document.getElementById('cardsResumoFinanceiro').textContent);

  // Filtro de mês: escolher o mês atual esconde, na TABELA, a conta que só vence no mês que
  // vem — mas os cards (Saídas/Recebido/Saldo) não mudam com esse filtro: eles são sempre o
  // total real desde o início, não a previsão do período em tela.
  const chaveMesAtual = await page.evaluate(() => { const h = new Date(); return h.getFullYear() + '-' + String(h.getMonth()+1).padStart(2,'0'); });
  await page.evaluate((chave) => { document.getElementById('filtroMesFin').value = chave; renderFinanceiro(); }, chaveMesAtual);
  await page.waitForTimeout(150);
  const tabelaMesAtualTexto = await page.evaluate(() => document.getElementById('corpoTabelaFinanceiro').textContent);
  assert(tabelaMesAtualTexto.includes('Receber este mes CI') && !tabelaMesAtualTexto.includes('Receber mes que vem CI'), 'escolhendo o mês atual no filtro, a tabela esconde a conta que só vence no mês que vem');
  const cardsResumoComFiltroMesTexto = await page.evaluate(() => document.getElementById('cardsResumoFinanceiro').textContent);
  assert(cardsResumoComFiltroMesTexto === cardReceberTudoTexto, 'os cards de Saídas/Recebido/Saldo não mudam quando o filtro de mês da tabela muda — são sempre o total real desde o início, não uma previsão do período em tela');

  await page.evaluate(() => { document.getElementById('filtroMesFin').value = ''; renderFinanceiro(); });
  await page.waitForTimeout(150);
  const tabelaVoltaTodosMesesTexto = await page.evaluate(() => document.getElementById('corpoTabelaFinanceiro').textContent);
  assert(tabelaVoltaTodosMesesTexto.includes('Receber mes que vem CI'), 'voltando pra "Todos os meses", a conta do mês que vem aparece de novo na tabela');

  await page.evaluate(() => mostrarAba('dashboard'));
  await page.waitForTimeout(150);
  const cardsDashTexto = await page.evaluate(() => document.getElementById('cardsDashboard').textContent);
  assert(/Saídas/.test(cardsDashTexto) && /Recebido/.test(cardsDashTexto) && /Saldo/.test(cardsDashTexto), 'os mesmos 3 cards simples (Saídas, Recebido, Saldo) aparecem também no Dashboard, com os mesmos rótulos do Financeiro');

  console.log('Grupo: Compras (registro de gastos já realizados) e Saldo real de caixa');
  await page.evaluate(() => mostrarAba('financeiro'));
  await page.waitForTimeout(150);
  await page.evaluate(() => mostrarAbaFinanceiro('compras'));
  await page.waitForTimeout(150);
  assert(await page.evaluate(() => document.getElementById('blocoCompras').classList.contains('hidden') === false), 'ao clicar na sub-aba "Compras", o bloco de Compras aparece');
  assert(await page.evaluate(() => document.getElementById('blocoContasFinanceiro').classList.contains('hidden')), 'ao clicar na sub-aba "Compras", o bloco de Contas a pagar/receber fica escondido — Compras é uma seção própria, com campos próprios, não reaproveita o formulário de Financeiro');
  assert(await page.evaluate(() => document.getElementById('subtabFinCompras').classList.contains('active')), 'a sub-aba "Compras" fica marcada como ativa');

  // Cadastra uma compra pelo formulário de verdade (preenchendo os campos na tela, como a
  // pessoa faria), pra garantir que o form e o salvarCompra() estão ligados certinho.
  await page.evaluate(() => abrirFormCompra());
  await page.waitForTimeout(100);
  assert(await page.evaluate(() => !document.getElementById('formCompraWrap').classList.contains('hidden')), 'o formulário de nova compra abre');
  await page.evaluate(() => {
    document.getElementById('cpDescricao').value = 'Filamento PLA 1kg CI';
    document.getElementById('cpFornecedor').value = 'Loja XYZ';
    document.getElementById('cpCategoria').value = 'Insumos';
    document.getElementById('cpValor').value = '150,00';
    document.getElementById('cpData').value = hojeStr();
    document.getElementById('cpFormaPagamento').value = 'Pix';
    salvarCompra();
  });
  await page.waitForTimeout(900);
  assert(await page.evaluate(() => document.getElementById('formCompraWrap').classList.contains('hidden')), 'o formulário fecha sozinho depois de salvar');
  assert(await page.evaluate(() => state.compras.some(c => c.descricao === 'Filamento PLA 1kg CI' && c.valor === 150 && c.fornecedor === 'Loja XYZ' && c.categoria === 'Insumos' && c.formaPagamento === 'Pix')), 'a compra criada pelo formulário fica salva no estado com todos os campos próprios (fornecedor, categoria, forma de pagamento — nada disso existe no Financeiro)');
  const tabelaComprasTexto = await page.evaluate(() => document.getElementById('corpoTabelaCompras').textContent);
  assert(tabelaComprasTexto.includes('Filamento PLA 1kg CI') && tabelaComprasTexto.includes('Loja XYZ'), 'a compra aparece na tabela de Compras');
  const cardsComprasTexto = await page.evaluate(() => document.getElementById('cardsResumoCompras').textContent);
  assert(/150,00/.test(cardsComprasTexto), 'o card "Total em compras" reflete a compra cadastrada');

  // Exclusão vai pra Lixeira (soft delete), igual todo o resto do painel.
  await page.evaluate(() => {
    window.confirm = () => true;
    const c = state.compras.find(x => x.descricao === 'Filamento PLA 1kg CI');
    excluirCompra(c.id);
  });
  await page.waitForTimeout(900);
  assert(await page.evaluate(() => comprasAtivos().every(c => c.descricao !== 'Filamento PLA 1kg CI')), 'compra excluída some da lista de ativas');
  assert(await page.evaluate(() => state.compras.some(c => c.descricao === 'Filamento PLA 1kg CI')), 'compra excluída continua existindo nos dados (soft delete)');
  await page.evaluate(() => mostrarAba('lixeira'));
  await page.waitForTimeout(150);
  assert(await page.evaluate(() => document.getElementById('corpoLixeira').textContent.includes('Filamento PLA 1kg CI')), 'a compra excluída aparece na tela de Lixeira, igual clientes/produtos/financeiro');
  await page.evaluate(() => {
    const c = state.compras.find(x => x.descricao === 'Filamento PLA 1kg CI');
    restaurarItemLixeira('compras', c.id);
  });
  await page.waitForTimeout(900);
  assert(await page.evaluate(() => comprasAtivos().some(c => c.descricao === 'Filamento PLA 1kg CI')), 'a compra volta a aparecer como ativa depois de restaurada da Lixeira');

  // Saldo real: precisa bater com o saldo de verdade do banco — recebido (pago) menos pago
  // (pago) menos comprado, desde o início. É o card que resolve o problema original ("saldo
  // de 700 e pouco, mas tem compras que fiz que diminuem esse saldo").
  await page.evaluate(() => {
    state.financeiro.push({id:'fin_recebido_real_ci', tipo:'receber', descricao:'Venda recebida de verdade CI', valor:1000, vencimento:hojeStr(), categoria:'', clienteId:null, status:'pago'});
    state.financeiro.push({id:'fin_pago_real_ci', tipo:'pagar', descricao:'Conta paga de verdade CI', valor:200, vencimento:hojeStr(), categoria:'', clienteId:null, status:'pago'});
    marcarAlterado();
  });
  await page.waitForTimeout(900);
  const saldoRealInfo = await page.evaluate(() => ({
    recebidoReal: totalRecebidoReal(),
    pagoReal: totalPagoReal(),
    comprasReal: totalComprasReal(),
    saldoReal: saldoRealCaixa()
  }));
  assert(Math.abs(saldoRealInfo.saldoReal - (saldoRealInfo.recebidoReal - saldoRealInfo.pagoReal - saldoRealInfo.comprasReal)) < 0.001, 'saldoRealCaixa() = recebido (pago) − pago (pago) − compras, exatamente');
  assert(saldoRealInfo.comprasReal >= 150, 'a compra registrada entra na conta do que já foi de fato gasto (totalComprasReal)');

  await page.evaluate(() => mostrarAba('financeiro'));
  await page.waitForTimeout(150);
  await page.evaluate(() => mostrarAbaFinanceiro('pagar'));
  await page.waitForTimeout(150);
  const cardsFinanceiroComSaldoReal = await page.evaluate(() => {
    const saidas = totalSaidasReal(), recebido = totalRecebidoReal(), saldo = saldoRealCaixa();
    return {
      texto: document.getElementById('cardsResumoFinanceiro').textContent,
      saidasTexto: 'R$ ' + fmtMoeda(saidas),
      recebidoTexto: 'R$ ' + fmtMoeda(recebido),
      saldoTexto: 'R$ ' + fmtMoeda(saldo)
    };
  });
  assert(/Saídas/.test(cardsFinanceiroComSaldoReal.texto) && /Recebido/.test(cardsFinanceiroComSaldoReal.texto) && /Saldo/.test(cardsFinanceiroComSaldoReal.texto), 'os 3 cards simples (Saídas, Recebido, Saldo) continuam aparecendo no Financeiro depois de cadastrar compras e pagamentos reais');
  assert(cardsFinanceiroComSaldoReal.texto.includes(cardsFinanceiroComSaldoReal.saidasTexto), 'o card "Saídas" do Financeiro bate exatamente com totalSaidasReal() (contas pagas + compras)');
  assert(cardsFinanceiroComSaldoReal.texto.includes(cardsFinanceiroComSaldoReal.recebidoTexto), 'o card "Recebido" do Financeiro bate exatamente com totalRecebidoReal()');
  assert(cardsFinanceiroComSaldoReal.texto.includes(cardsFinanceiroComSaldoReal.saldoTexto), 'o card "Saldo" do Financeiro bate exatamente com saldoRealCaixa() (recebido menos saídas — é o card que resolve o "saldo que some" sem as compras aparecerem em lugar nenhum)');

  await page.evaluate(() => mostrarAba('dashboard'));
  await page.waitForTimeout(150);
  const cardsDashComSaldoReal = await page.evaluate(() => {
    const saidas = totalSaidasReal(), recebido = totalRecebidoReal(), saldo = saldoRealCaixa();
    return {
      texto: document.getElementById('cardsDashboard').textContent,
      saidasTexto: 'R$ ' + fmtMoeda(saidas),
      recebidoTexto: 'R$ ' + fmtMoeda(recebido),
      saldoTexto: 'R$ ' + fmtMoeda(saldo)
    };
  });
  assert(/Saídas/.test(cardsDashComSaldoReal.texto) && /Recebido/.test(cardsDashComSaldoReal.texto) && /Saldo/.test(cardsDashComSaldoReal.texto), 'os mesmos 3 cards simples (Saídas, Recebido, Saldo) aparecem também no Dashboard');
  assert(cardsDashComSaldoReal.texto.includes(cardsDashComSaldoReal.saidasTexto) && cardsDashComSaldoReal.texto.includes(cardsDashComSaldoReal.recebidoTexto) && cardsDashComSaldoReal.texto.includes(cardsDashComSaldoReal.saldoTexto), 'os valores dos cards do Dashboard batem com os mesmos totais reais do Financeiro (a mesma fonte de verdade nas duas telas)');

  console.log('Grupo: desconto do orçamento (valor fixo em R$ ou percentual, à escolha)');
  await page.evaluate(() => mostrarAba('orcamentos'));
  await page.waitForTimeout(150);
  await page.evaluate(() => abrirFormOrcamento());
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    document.getElementById('foCliente').value = state.clientes[0].id;
    document.querySelector('#corpoItensOrc .it-desc').value = 'Item desconto CI';
    document.querySelector('#corpoItensOrc .it-qtd').value = '1';
    document.querySelector('#corpoItensOrc .it-valor').value = '200,00';
    document.getElementById('foDescontoTipo').value = 'valor';
    document.getElementById('foDesconto').value = '50,00';
    atualizarTotalOrc();
  });
  assert(await page.evaluate(() => document.getElementById('foTotalGeral').textContent === 'R$ 150,00'), 'desconto em R$ fixo é subtraído direto do total dos itens (200 - 50 = 150)');
  await page.evaluate(() => {
    document.getElementById('foDescontoTipo').value = 'percentual';
    document.getElementById('foDesconto').value = '10';
    atualizarTotalOrc();
  });
  assert(await page.evaluate(() => document.getElementById('foTotalGeral').textContent === 'R$ 180,00'), 'desconto em % é calculado sobre a soma dos itens (10% de 200 = 20, total 180)');
  await page.evaluate(() => salvarOrcamento());
  await page.waitForTimeout(900);
  const orcDescontoId = await page.evaluate(() => state.orcamentos.slice().reverse().find(o => o.itens.some(it => it.descricao === 'Item desconto CI')).id);
  const orcDesconto = await page.evaluate((id) => {
    const o = state.orcamentos.find(x => x.id === id);
    return { desconto: o.desconto, descontoTipo: o.descontoTipo, descontoInformado: o.descontoInformado, total: o.total };
  }, orcDescontoId);
  assert(Math.abs(orcDesconto.desconto - 20) < 0.001, 'o orçamento salvo guarda o desconto já convertido pra R$ (10% de 200 = 20), pra continuar funcionando no WhatsApp/impressão/Excel, que esperam um valor final em R$');
  assert(orcDesconto.descontoTipo === 'percentual' && orcDesconto.descontoInformado === 10, 'o orçamento também guarda o tipo escolhido e o número exatamente como foi digitado (percentual, 10)');
  assert(orcDesconto.total === 180, 'o total do orçamento salvo reflete o desconto percentual calculado (200 - 20 = 180)');
  await page.evaluate((id) => abrirFormOrcamento(id), orcDescontoId);
  await page.waitForTimeout(150);
  assert(await page.evaluate(() => document.getElementById('foDescontoTipo').value === 'percentual' && document.getElementById('foDesconto').value === '10,00'), 'reabrir um orçamento com desconto em % mostra o toggle em "%" e o número original digitado (10) — não o valor em R$ já convertido');
  await page.evaluate(() => fecharFormOrcamento());

  console.log('Grupo: pop-up de confirmação de pagamento — desconto da maquininha (cartão de crédito)');
  await page.evaluate(() => mostrarAba('financeiro'));
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const clienteId = state.clientes[0].id;
    state.financeiro.push({id:'fin_maquininha_ci', tipo:'receber', descricao:'Venda maquininha CI', valor:300, vencimento:hojeStr(), categoria:'', clienteId, status:'pendente'});
    marcarAlterado();
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => { alternarStatusFinanceiro('fin_maquininha_ci'); });
  await page.waitForTimeout(150);
  assert(await page.evaluate(() => document.getElementById('cfDescontoBloco').classList.contains('hidden')), 'o campo de desconto da maquininha começa escondido (forma de pagamento padrão do pop-up é Pix)');
  await page.evaluate(() => { document.getElementById('cfFormaPagamento').value = 'Cartão de crédito'; alternarDescontoConfirmarPagamento(); });
  assert(await page.evaluate(() => !document.getElementById('cfDescontoBloco').classList.contains('hidden')), 'escolher "Cartão de crédito" numa conta a receber mostra o campo de desconto da maquininha');
  await page.evaluate(() => {
    document.getElementById('cfDesconto').value = '9,00';
    atualizarPreviewDescontoConfirmarPagamento();
  });
  assert(await page.evaluate(() => document.getElementById('cfDescontoPreview').textContent.includes('291,00')), 'a prévia mostra o valor líquido que vai entrar no Saldo real (300 - 9 = 291)');
  await page.evaluate(() => confirmarPagamentoSalvar());
  await page.waitForTimeout(900);
  const finMaquininha = await page.evaluate(() => state.financeiro.find(f => f.id === 'fin_maquininha_ci'));
  assert(finMaquininha.status === 'pago' && finMaquininha.valor === 291, 'o valor líquido (já com a taxa da maquininha descontada) é o que fica registrado como recebido — combinado com o usuário: o pop-up registra o valor líquido, não o valor cheio');
  assert(finMaquininha.descontoMaquininha === 9 && finMaquininha.valorOriginal === 300, 'o painel guarda o desconto aplicado e o valor original da conta, pra poder desfazer se precisar');
  await page.evaluate(() => alternarStatusFinanceiro('fin_maquininha_ci')); // desfazer (↺): volta pendente, sem pop-up
  await page.waitForTimeout(900);
  const finMaquininhaDesfeito = await page.evaluate(() => state.financeiro.find(f => f.id === 'fin_maquininha_ci'));
  assert(finMaquininhaDesfeito.status === 'pendente' && finMaquininhaDesfeito.valor === 300 && finMaquininhaDesfeito.valorOriginal === undefined, 'desfazer (↺) uma conta paga volta pro valor original da conta, sem deixar resíduo do desconto da maquininha');

  await page.evaluate(() => {
    state.financeiro.push({id:'fin_pagar_cartao_ci', tipo:'pagar', descricao:'Conta a pagar no cartão CI', valor:80, vencimento:hojeStr(), categoria:'', clienteId:null, status:'pendente'});
    marcarAlterado();
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => { alternarStatusFinanceiro('fin_pagar_cartao_ci'); });
  await page.waitForTimeout(150);
  await page.evaluate(() => { document.getElementById('cfFormaPagamento').value = 'Cartão de crédito'; alternarDescontoConfirmarPagamento(); });
  assert(await page.evaluate(() => document.getElementById('cfDescontoBloco').classList.contains('hidden')), 'numa conta a PAGAR, o campo de desconto da maquininha não aparece mesmo escolhendo "Cartão de crédito" (esse desconto só faz sentido pra dinheiro entrando, numa conta a receber)');
  await page.evaluate(() => fecharConfirmarPagamento());
  assert(await page.evaluate(() => state.financeiro.find(f => f.id === 'fin_pagar_cartao_ci').status === 'pendente'), 'cancelar o pop-up (sem confirmar) não muda o status da conta');
  // Limpa os lançamentos deste grupo (iam sujar o quadro "vence hoje" do próximo grupo de testes).
  await page.evaluate(() => {
    ['fin_maquininha_ci', 'fin_pagar_cartao_ci'].forEach(id => {
      const f = state.financeiro.find(x => x.id === id);
      if(f) moverParaLixeira(f);
    });
    marcarAlterado();
  });
  await page.waitForTimeout(900);

  console.log('Grupo: botão "Salvar" (💾) força salvar imediatamente, sem esperar o autosave de 800ms');
  await page.evaluate(() => {
    state.clientes.push({id: uid('cliente'), nome: 'Cliente Salvar Agora CI', telefone:'', email:'', cidade:''});
    dirty = true;
    salvarAgora();
  });
  const textoLogoAposSalvarAgora = await page.evaluate(() => document.getElementById('statusSalvo').textContent);
  assert(/salvando/i.test(textoLogoAposSalvarAgora), 'clicar em "Salvar" já mostra "salvando..." na hora, sem esperar o debounce normal de 800ms do autosave');
  await page.waitForTimeout(900);
  assert(await page.evaluate(() => document.getElementById('statusSalvo').textContent.startsWith('salvo às')), 'depois de salvarAgora(), o painel confirma que salvou');
  const clientesNoServidorSalvarAgora = await page.evaluate(async () => {
    const dados = await fetch(CONFIG.URL_API + '?token=' + encodeURIComponent(CONFIG.TOKEN) + '&sessao=' + encodeURIComponent(sessaoAtual())).then(r => r.json());
    return dados.clientes.map(c => c.nome);
  });
  assert(clientesNoServidorSalvarAgora.includes('Cliente Salvar Agora CI'), 'o botão "Salvar" realmente grava no servidor na hora, sem esperar nem perder a informação que já estava registrada');

  console.log('Grupo: dashboard — contas a pagar/receber do dia');
  const doDia = await page.evaluate(() => ({
    pagarHojeTexto: document.getElementById('corpoPagarHoje').textContent,
    receberHojeTexto: document.getElementById('corpoReceberHoje').textContent,
    subPagar: document.getElementById('subtituloContasPagarHoje').textContent,
    subReceber: document.getElementById('subtituloContasReceberHoje').textContent
  }));
  assert(doDia.pagarHojeTexto.includes('Pagar este mes CI'), 'a conta a pagar que vence hoje aparece no quadro "Contas a pagar hoje"');
  assert(doDia.receberHojeTexto.includes('Receber este mes CI'), 'a conta a receber que vence hoje aparece no quadro "Contas a receber hoje"');
  assert(!doDia.receberHojeTexto.includes('Receber mes que vem CI'), 'a conta que só vence no mês que vem não aparece no quadro de hoje');
  assert(!doDia.pagarHojeTexto.includes('Ja pago CI'), 'uma conta já paga não aparece no quadro de hoje mesmo vencendo hoje');
  assert(/1 conta/.test(doDia.subPagar) && /R\$ 200,00/.test(doDia.subPagar), 'o subtítulo de "a pagar hoje" mostra a quantidade e o total certo');
  assert(/1 conta/.test(doDia.subReceber) && /R\$ 500,00/.test(doDia.subReceber), 'o subtítulo de "a receber hoje" mostra a quantidade e o total certo');

  await page.evaluate(() => {
    state.financeiro.push({id:'fin_amanha_pagar', tipo:'pagar', descricao:'Pagar amanha CI', valor:77, vencimento:somarDias(hojeStr(),1), categoria:'', clienteId:null, status:'pendente'});
    marcarAlterado();
    renderDashboard();
  });
  await page.waitForTimeout(900);
  assert(await page.evaluate(() => !document.getElementById('corpoPagarHoje').textContent.includes('Pagar amanha CI')), 'uma conta que vence amanhã não aparece no quadro "Contas a pagar hoje"');

  await page.evaluate(() => {
    state.financeiro.forEach(f => { if(f.id === 'fin_mes_pagar' || f.id === 'fin_amanha_pagar') moverParaLixeira(f); });
    renderDashboard();
  });
  await page.waitForTimeout(150);
  assert(await page.evaluate(() => document.getElementById('corpoPagarHoje').textContent.includes('Nenhuma conta a pagar vence hoje')), 'quando não tem nada vencendo hoje, o quadro mostra a mensagem de vazio');
  assert(await page.evaluate(() => document.getElementById('subtituloContasPagarHoje').textContent === 'Nada vencendo hoje'), 'o subtítulo também reflete o estado vazio');

  console.log('Grupo: cache local (localStorage) — entra já com os dados na tela, sem esperar a rede');
  const chaveCache = await page.evaluate(() => CHAVE_CACHE_LOCAL);
  const semCacheAindaOk = await page.evaluate((chave) => {
    const backup = localStorage.getItem(chave);
    localStorage.removeItem(chave);
    const resultado = carregarCacheLocal();
    if(backup) localStorage.setItem(chave, backup); // restaura pro resto dos testes
    return resultado;
  }, chaveCache);
  assert(semCacheAindaOk === false, 'carregarCacheLocal() devolve false sem quebrar nada quando ainda não existe cache (ex.: 1º acesso no aparelho)');

  await page.evaluate(() => atualizarAgora());
  await page.waitForTimeout(900);
  const cacheApósCarregar = await page.evaluate((chave) => {
    const bruto = localStorage.getItem(chave);
    return bruto ? JSON.parse(bruto) : null;
  }, chaveCache);
  assert(!!cacheApósCarregar && Array.isArray(cacheApósCarregar.state && cacheApósCarregar.state.clientes), 'depois de carregar do servidor, uma cópia dos dados fica guardada no navegador (cache local)');

  const resultadoCache = await page.evaluate(() => {
    state = estadoPadrao();
    document.getElementById('corpoTabelaClientes').innerHTML = '';
    const achou = carregarCacheLocal();
    return { achou, qtdClientes: state.clientes.length, carregandoAgora: carregando, statusTexto: document.getElementById('statusSalvo').textContent };
  });
  assert(resultadoCache.achou === true, 'carregarCacheLocal() encontra o cache salvo e devolve true');
  assert(resultadoCache.qtdClientes > 0, 'os dados do cache já aparecem no "state" na hora, sem esperar nenhuma resposta do servidor');
  assert(resultadoCache.carregandoAgora === false, 'depois de mostrar o cache o painel já não fica mais no estado de "carregando"');
  assert(/mostrando dados salvos/.test(resultadoCache.statusTexto), 'o aviso deixa claro que são os dados salvos localmente, enquanto confirma com o servidor');
  assert(await page.evaluate(() => document.getElementById('corpoTabelaClientes').children.length > 0), 'a tabela de clientes já aparece preenchida na hora, a partir do cache (carregarCacheLocal já chama renderTudo)');

  const semErroAoFalharCache = await page.evaluate(() => {
    const original = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function(){ throw new Error('QuotaExceededError simulado'); };
    let ok = true;
    try { salvarCacheLocal(); } catch(e){ ok = false; }
    localStorage.setItem = original;
    return ok;
  });
  assert(semErroAoFalharCache, 'se o navegador recusar guardar o cache (ex.: sem espaço, modo anônimo), salvarCacheLocal() não trava o painel com um erro não tratado');

  console.log('Grupo: uma edição em andamento não é sobrescrita por uma busca em segundo plano');
  await page.evaluate(async () => {
    // Simula outro dispositivo salvando uma mudança nesse meio-tempo, direto no backend.
    const atual = await fetch(CONFIG.URL_API + '?token=' + encodeURIComponent(CONFIG.TOKEN) + '&sessao=' + encodeURIComponent(sessaoAtual())).then(r => r.json());
    atual.clientes = atual.clientes.map(c => c.id === 'cli_1' ? Object.assign({}, c, {nome:'ATUALIZADO POR OUTRO DISPOSITIVO'}) : c);
    await fetch(CONFIG.URL_API, { method:'POST', body: JSON.stringify({ token: CONFIG.TOKEN, sessao: sessaoAtual(), state: atual }) });
  });
  await page.evaluate(() => {
    state.clientes.find(c => c.id === 'cli_1').nome = 'EDITANDO AGORA (ainda não salvo)';
    dirty = true;
  });
  await page.evaluate(() => carregarDoServidor());
  await page.waitForTimeout(900);
  assert(await page.evaluate(() => state.clientes.find(c => c.id === 'cli_1').nome === 'EDITANDO AGORA (ainda não salvo)'), 'uma busca em segundo plano não sobrescreve os dados na tela enquanto tem uma edição sendo salva (dirty=true), mesmo se o servidor já tem algo mais novo');
  await page.evaluate(() => { dirty = false; carregarDoServidor(); });
  await page.waitForTimeout(900);
  assert(await page.evaluate(() => state.clientes.find(c => c.id === 'cli_1').nome === 'ATUALIZADO POR OUTRO DISPOSITIVO'), 'assim que a edição termina de salvar (dirty=false), a próxima busca já aplica normalmente os dados mais novos do servidor');

  console.log('Grupo: recuperação automática depois de um conflito (dados_desatualizados) — a causa raiz de "some alguma coisa toda vez que entro"');
  await page.evaluate(async () => {
    // Simula outro dispositivo criando um cliente novo direto no backend, usando a
    // revisão que esta aba tem agora (ainda válida nesse momento — o POST vai suceder
    // e a revisão do servidor avança, deixando a revisão desta aba desatualizada).
    const atual = await fetch(CONFIG.URL_API + '?token=' + encodeURIComponent(CONFIG.TOKEN) + '&sessao=' + encodeURIComponent(sessaoAtual())).then(r => r.json());
    atual.clientes.push({id:'cli_outro_dispositivo', nome:'Cliente criado por OUTRO dispositivo', telefone:'', email:'', cidade:''});
    await fetch(CONFIG.URL_API, { method:'POST', body: JSON.stringify({ token: CONFIG.TOKEN, sessao: sessaoAtual(), state: atual }) });
  });
  const nomeClienteRecuperado = 'Cliente criado NESTA aba (não devia sumir)';
  await page.evaluate((nome) => {
    // Enquanto isso, esta aba — com a revisão agora desatualizada, sem saber — cria um
    // cliente novo. É exatamente isso que reproduz o conflito: o autosave de 800ms vai
    // tentar salvar com uma revisão velha e o backend vai recusar (dados_desatualizados).
    state.clientes.push({id: uid('cliente'), nome, telefone:'', email:'', cidade:''});
    marcarAlterado();
  }, nomeClienteRecuperado);
  // ~800ms pro autosave tentar salvar (recusado) + buscar a versão nova + reaplicar a
  // criação sozinho + salvar de novo (mais ~800ms).
  await page.waitForTimeout(2200);
  assert(await page.evaluate(() => document.getElementById('statusSalvo').textContent.startsWith('salvo às')), 'depois do conflito, o painel não fica travado em "...atualizando" pra sempre — termina de recuperar sozinho e volta a mostrar "salvo às ..." (o bug era a flag "dirty" ficar travada em true, bloqueando carregarDoServidor()/a verificação periódica pra sempre até um F5 manual)');
  assert(await page.evaluate(() => !bloqueadoPorConflito), 'o bloqueio por conflito é liberado depois que a recuperação termina');
  assert(await page.evaluate(() => !dirty), 'a flag "dirty" não fica travada em true depois do conflito');
  assert(await page.evaluate(() => state.clientes.some(c => c.nome === 'Cliente criado por OUTRO dispositivo')), 'a versão mais recente do servidor (criada por "outro dispositivo") foi aplicada nesta aba');
  assert(await page.evaluate((nome) => state.clientes.some(c => c.nome === nome), nomeClienteRecuperado), 'o cliente criado NESTA aba antes do conflito ser detectado foi recuperado automaticamente — a pessoa não precisou perceber que sumiu nem refazer');
  const clientesNoServidorFinal = await page.evaluate(async () => {
    const dados = await fetch(CONFIG.URL_API + '?token=' + encodeURIComponent(CONFIG.TOKEN) + '&sessao=' + encodeURIComponent(sessaoAtual())).then(r => r.json());
    return dados.clientes.map(c => c.nome);
  });
  assert(clientesNoServidorFinal.includes('Cliente criado por OUTRO dispositivo') && clientesNoServidorFinal.includes(nomeClienteRecuperado), 'os dois clientes (o do "outro dispositivo" e o recuperado desta aba) realmente ficaram salvos no servidor — não só reapareceram na tela pra sumir de novo depois');

  console.log('Grupo: falha ao buscar dados não trava o painel numa tela de erro pedindo F5');
  const urlOriginal = await page.evaluate(() => CONFIG.URL_API);
  await page.evaluate(() => { CONFIG.URL_API = 'http://127.0.0.1:9/rota-que-nao-existe'; });
  await page.evaluate(() => carregarDoServidor());
  await page.waitForTimeout(500);
  const statusAposFalha = await page.evaluate(() => document.getElementById('statusSalvo').textContent);
  assert(/não foi possível atualizar agora/.test(statusAposFalha) && /tentando de novo/.test(statusAposFalha), 'quando a busca falha mas o painel já tem dados na tela, o aviso é discreto — não pede pra recarregar a página');
  assert(await page.evaluate(() => state.clientes.length > 0), 'os dados que já estavam na tela continuam lá mesmo depois de uma falha ao tentar atualizar');
  await page.evaluate((url) => { CONFIG.URL_API = url; }, urlOriginal);
  await page.evaluate(() => atualizarAgora());
  await page.waitForTimeout(900);
  assert(await page.evaluate(() => document.getElementById('statusSalvo').textContent.startsWith('salvo às')), 'o botão de atualizar agora (🔄 atualizarAgora()) recupera normalmente assim que a conexão volta');

  console.log('Grupo: cache local só é apagado num "Sair" explícito, não numa sessão expirada');
  assert(await page.evaluate((chave) => !!localStorage.getItem(chave), chaveCache), 'existe cache local guardado antes de testar a limpeza');
  await page.evaluate(() => voltarParaLogin('Sua sessão expirou — faça login novamente.'));
  assert(await page.evaluate((chave) => !!localStorage.getItem(chave), chaveCache), 'uma sessão expirada não apaga o cache local — a pessoa ainda quer ver os dados rápido no próximo login');
  await page.evaluate(() => {
    localStorage.setItem('sessaoToken', 'sess-abc');
    localStorage.setItem('sessaoUsuario', 'felipe');
    document.body.classList.add('autenticado');
  });
  await page.evaluate(() => carregarDoServidor());
  await page.waitForTimeout(900);
  assert(await page.evaluate(() => document.body.classList.contains('autenticado')), 're-autentica normalmente pra continuar os próximos testes');

  console.log('Grupo: exportar Excel não quebra mesmo sem a lib carregada');
  const exportResult = await page.evaluate(() => {
    try { exportarFinanceiroExcel(); return 'sem erro'; } catch(e) { return 'ERRO: ' + e.message; }
  });
  assert(exportResult === 'sem erro', 'exportarFinanceiroExcel() não lança exceção (' + exportResult + ')');
  const exportComprasResult = await page.evaluate(() => {
    try { exportarComprasExcel(); return 'sem erro'; } catch(e) { return 'ERRO: ' + e.message; }
  });
  assert(exportComprasResult === 'sem erro', 'exportarComprasExcel() não lança exceção (' + exportComprasResult + ')');

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
  assert(await page.evaluate((chave) => localStorage.getItem(chave) === null, chaveCache), 'um "Sair" explícito apaga o cache local guardado no navegador (privacidade em computador compartilhado)');

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
