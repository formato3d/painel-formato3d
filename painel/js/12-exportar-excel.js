/* =========================================================
   EXPORTAR PARA EXCEL
   ========================================================= */
function exportarOrcamentosExcel(){
  if(typeof XLSX === 'undefined'){
    alert('Não foi possível carregar a biblioteca de exportação. Verifique sua internet e tente de novo.');
    return;
  }
  const filtro = document.getElementById('filtroStatusOrc').value;
  const linhas = orcamentosAtivos()
    .filter(o => !filtro || o.status === filtro)
    .map(o => ({
      'Número': String(o.numero).padStart(4,'0'),
      'Data': fmtDataExibir(o.data),
      'Cliente': nomeCliente(o.clienteId),
      'Status': o.status,
      'Total (R$)': o.total || 0,
      'Frete (R$)': o.frete || 0,
      'Desconto (R$)': o.desconto || 0,
      'Validade (dias)': o.validadeDias || 7,
      'Condição de pagamento': o.condicaoPagamento || '',
      'Observações': o.obs || ''
    }));
  if(linhas.length === 0){ alert('Não há orçamentos pra exportar.'); return; }
  const ws = XLSX.utils.json_to_sheet(linhas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Orçamentos');
  XLSX.writeFile(wb, 'orcamentos_formato3d_' + new Date().toISOString().slice(0,10) + '.xlsx');
}
function exportarFinanceiroExcel(){
  if(typeof XLSX === 'undefined'){
    alert('Não foi possível carregar a biblioteca de exportação. Verifique sua internet e tente de novo.');
    return;
  }
  const filtroTipo = document.getElementById('filtroTipoFin').value;
  const filtroStatus = document.getElementById('filtroStatusFin').value;
  const linhas = financeiroAtivos()
    .filter(f => (!filtroTipo || f.tipo === filtroTipo) && (!filtroStatus || f.status === filtroStatus))
    .map(f => ({
      'Tipo': f.tipo === 'pagar' ? 'A pagar' : 'A receber',
      'Descrição': f.descricao || '',
      'Categoria': f.categoria || '',
      'Cliente': nomeClienteOpcional(f.clienteId),
      'Vencimento': f.vencimento ? fmtDataExibir(f.vencimento) : '',
      'Valor (R$)': f.valor || 0,
      'Status': f.status === 'pago' ? 'Pago/Recebido' : 'Pendente',
      'Boleto (link)': f.boletoUrl || '',
      'Comprovante (link)': f.comprovanteUrl || ''
    }));
  if(linhas.length === 0){ alert('Não há lançamentos pra exportar.'); return; }
  const ws = XLSX.utils.json_to_sheet(linhas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Financeiro');
  XLSX.writeFile(wb, 'financeiro_formato3d_' + new Date().toISOString().slice(0,10) + '.xlsx');
}

