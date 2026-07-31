/* =========================================================
   INICIALIZAÇÃO
   ========================================================= */
if(sessaoAtual()){
  document.body.classList.add('autenticado');
  // Mostra os dados salvos neste aparelho na hora (se tiver), pra pessoa já entrar
  // com a tela preenchida em vez de esperar a rede — e busca do servidor em
  // seguida, em segundo plano, pra confirmar ou trazer o que mudou.
  carregarCacheLocal();
  carregarDoServidor();
} else {
  carregando = false;
}
