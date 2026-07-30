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
  const desgasteHora = parseMoeda(document.getElementById('calcDesgaste').value);
  const margem = parseFloat(document.getElementById('calcMargem').value) || 0;
  const comissao = Math.min(95, parseFloat(document.getElementById('calcComissao').value) || 0);
  const consumoW = parseFloat(document.getElementById('calcConsumo').value) || 0;

  const custoFilamento = pesoKg * precoFilamentoKg;
  const kWhConsumido = (consumoW / 1000) * horasTotais;
  const custoEnergia = kWhConsumido * precoKwh;
  const custoDesgaste = desgasteHora * horasTotais;
  const custoBase = custoFilamento + custoEnergia + embalagem + custoDesgaste;

  const custoComMargem = custoBase * (1 + margem / 100);
  const valorMargem = custoComMargem - custoBase;
  const precoVenda = comissao < 100 ? custoComMargem / (1 - comissao / 100) : custoComMargem;
  const valorComissao = precoVenda - custoComMargem;

  document.getElementById('calcOutFilamento').textContent = 'R$ ' + fmtMoeda(custoFilamento);
  document.getElementById('calcOutEnergia').textContent = 'R$ ' + fmtMoeda(custoEnergia);
  document.getElementById('calcOutEmbalagem').textContent = 'R$ ' + fmtMoeda(embalagem);
  document.getElementById('calcOutDesgaste').textContent = 'R$ ' + fmtMoeda(custoDesgaste);
  document.getElementById('calcOutCustoTotal').textContent = 'R$ ' + fmtMoeda(custoBase);
  document.getElementById('calcOutMargem').textContent = 'R$ ' + fmtMoeda(valorMargem);
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

