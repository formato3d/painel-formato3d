/* =========================================================
   CALCULADORA 3D
   ========================================================= */
function aplicarModeloImpressora(){
  const sel = document.getElementById('calcModeloImpressora');
  const v = sel.value;
  if(v && v !== 'outro'){
    document.getElementById('calcConsumo').value = v;
  }
  calcularOrcamento3D();
}
function calcularOrcamento3D(){
  const elQtd = document.getElementById('calcQtd');
  if(!elQtd) return;
  const qtd = Math.max(1, parseInt(elQtd.value, 10) || 1);
  const peso = parseFloat(document.getElementById('calcPeso').value) || 0;
  const unidadePeso = document.getElementById('calcPesoUnidade').value;
  const pesoKg = unidadePeso === 'kg' ? peso : peso / 1000;
  const precoFilamentoKg = parseMoeda(document.getElementById('calcPrecoFilamento').value);
  const horas = parseFloat(document.getElementById('calcHoras').value) || 0;
  const minutos = parseFloat(document.getElementById('calcMinutos').value) || 0;
  const horasTotais = horas + (minutos / 60);
  const precoKwh = parseMoeda(document.getElementById('calcPrecoKwh').value);
  const embalagem = parseMoeda(document.getElementById('calcEmbalagem').value);

  // Depreciação da impressora: em vez de pedir um "desgaste por hora" solto (um número
  // sem origem clara), a pessoa informa quanto pagou na impressora e por quantas horas
  // pretende usá-la — a depreciação por hora é sempre CALCULADA a partir desses dois
  // valores (valor da máquina ÷ vida útil em horas), nunca digitada direto.
  const valorImpressora = parseMoeda(document.getElementById('calcValorImpressora').value);
  const vidaUtilHoras = Math.max(1, parseFloat(document.getElementById('calcVidaUtil').value) || 1);
  const depreciacaoPorHora = valorImpressora / vidaUtilHoras;
  const elDepreciacaoHora = document.getElementById('calcDepreciacaoHora');
  if(elDepreciacaoHora) elDepreciacaoHora.value = 'R$ ' + fmtMoeda(depreciacaoPorHora) + '/h';

  const markup = Math.max(0, parseFloat(document.getElementById('calcMarkup').value) || 0);
  // A comissão do cartão/ponto de venda é sempre uma % do PREÇO DE VENDA final (o que o
  // cliente paga) — nunca do custo. Por isso o preço é "engordado" um pouco mais abaixo:
  // depois de a maquininha descontar a comissão sobre esse preço maior, o que sobra pra
  // quem vendeu é exatamente o preço base (custo + markup) que ela queria receber.
  const comissao = Math.min(95, Math.max(0, parseFloat(document.getElementById('calcComissao').value) || 0));
  const consumoW = parseFloat(document.getElementById('calcConsumo').value) || 0;

  // Mão de obra: tempo de modelagem, acompanhamento e pós-processamento (lixar, tirar
  // suporte, pintar etc.) não é a mesma coisa que o tempo de impressão em si — por isso é
  // um campo à parte, não reaproveita as horas de impressão usadas em energia/depreciação.
  const valorHoraMaoDeObra = parseMoeda(document.getElementById('calcMaoDeObraHora').value);
  const horasMaoDeObra = Math.max(0, parseFloat(document.getElementById('calcHorasMaoDeObra').value) || 0);
  const custoMaoDeObra = valorHoraMaoDeObra * horasMaoDeObra;

  const custoFilamento = pesoKg * precoFilamentoKg;
  const kWhConsumido = (consumoW / 1000) * horasTotais;
  const custoEnergia = kWhConsumido * precoKwh;
  const custoDesgaste = depreciacaoPorHora * horasTotais;
  const custoFabricacao = custoFilamento + custoEnergia + embalagem + custoDesgaste + custoMaoDeObra;

  // Taxa de perdas/refugo: nem toda impressão dá certo. Se X% das tentativas falham (peça
  // empenou, faltou filamento, entupiu o bico etc.), o custo de UMA peça que efetivamente
  // vira produto vendável precisa embutir o custo das tentativas que falharam no caminho —
  // por isso o custo de fabricação é "engordado" dividindo por (1 - taxaPerda/100), o
  // mesmo princípio matemático usado mais abaixo pra comissão do cartão. Com taxaPerda=0
  // (padrão), custoTotal fica igual a custoFabricacao, sem nenhuma mudança de comportamento.
  const taxaPerda = Math.min(95, Math.max(0, parseFloat(document.getElementById('calcTaxaPerda').value) || 0));
  const custoTotal = taxaPerda < 100 ? custoFabricacao / (1 - taxaPerda / 100) : custoFabricacao;
  const custoPerdas = custoTotal - custoFabricacao;

  // MARKUP: percentual aplicado sobre o CUSTO pra chegar no preço base (ver item 7 da
  // explicação na tela — markup e margem de lucro NÃO são a mesma coisa).
  // Preço base = Custo total × (1 + Markup/100)
  const precoBase = custoTotal * (1 + markup / 100);
  // Lucro em reais: o que a pessoa efetivamente pretende ganhar por peça. Não muda com a
  // comissão — é justamente pra preservar esse valor que o preço de venda final é
  // engordado (ver precoVenda logo abaixo), então o lucro em R$ é sempre precoBase - custo.
  const lucro = precoBase - custoTotal;
  // Preço de venda final: o preço base "engordado" o suficiente pra, depois de a
  // maquininha descontar a comissão, ainda sobrar o preço base inteiro pra quem vendeu.
  const precoVenda = comissao < 100 ? precoBase / (1 - comissao / 100) : precoBase;
  // Valor da comissão: sempre uma fatia do preço de venda final (não do custo, nem do
  // preço base) — dá pra provar que valorComissao == precoVenda × comissao/100.
  const valorComissao = precoVenda - precoBase;
  // MARGEM DE LUCRO REAL: a fatia do PREÇO DE VENDA que é lucro de verdade — bem
  // diferente do markup (que é a fatia aplicada em cima do CUSTO). Ex.: custo R$36,68 com
  // 100% de markup vira preço R$73,36 — o lucro (R$36,68) é 100% do custo, mas é só 50%
  // do preço de venda, por isso a margem real dá 50%, não 100%.
  // Margem de lucro real (%) = (Lucro / Preço de venda) × 100
  const margemReal = precoVenda > 0 ? (lucro / precoVenda) * 100 : 0;

  document.getElementById('calcOutFilamento').textContent = 'R$ ' + fmtMoeda(custoFilamento);
  document.getElementById('calcOutEnergia').textContent = 'R$ ' + fmtMoeda(custoEnergia);
  document.getElementById('calcOutEmbalagem').textContent = 'R$ ' + fmtMoeda(embalagem);
  document.getElementById('calcOutDesgaste').textContent = 'R$ ' + fmtMoeda(custoDesgaste);
  document.getElementById('calcOutMaoDeObra').textContent = 'R$ ' + fmtMoeda(custoMaoDeObra);
  document.getElementById('calcOutPerdas').textContent = 'R$ ' + fmtMoeda(custoPerdas);
  document.getElementById('calcOutCustoTotal').textContent = 'R$ ' + fmtMoeda(custoTotal);
  document.getElementById('calcOutMarkup').textContent = fmtMoeda(markup).replace(/,00$/, '') + '%';
  document.getElementById('calcOutLucro').textContent = 'R$ ' + fmtMoeda(lucro);
  document.getElementById('calcOutMargemReal').textContent = fmtMoeda(margemReal) + '%';
  document.getElementById('calcOutComissao').textContent = 'R$ ' + fmtMoeda(valorComissao);
  document.getElementById('calcOutPrecoVenda').textContent = 'R$ ' + fmtMoeda(precoVenda);
  document.getElementById('calcOutQtdLabel').textContent = String(qtd);
  document.getElementById('calcOutTotalLote').textContent = 'R$ ' + fmtMoeda(precoVenda * qtd);
}
function usarPrecoNoProduto(){
  const nome = document.getElementById('calcNome').value.trim();
  const precoVendaTxt = document.getElementById('calcOutPrecoVenda').textContent.replace('R$', '').trim();
  const custoTotalTxt = document.getElementById('calcOutCustoTotal').textContent.replace('R$', '').trim();
  const peso = document.getElementById('calcPeso').value;
  const unidadePeso = document.getElementById('calcPesoUnidade').value;
  abrirFormProduto();
  if(nome) document.getElementById('fpNome').value = nome;
  document.getElementById('fpPreco').value = precoVendaTxt;
  document.getElementById('fpPrecoCusto').value = custoTotalTxt;
  if(peso) document.getElementById('fpPeso').value = unidadePeso === 'kg' ? (parseFloat(peso) * 1000) : peso;
}
